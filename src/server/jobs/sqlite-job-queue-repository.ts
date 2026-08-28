import type {
  BackgroundJob,
  ClaimJobInput,
  CompleteJobInput,
  EnqueueJobInput,
  EnqueueResult,
  FailJobInput,
  JobQueueRepository,
  JobStatus,
  RecoveryOutcome,
} from "@/platform/jobs/types";
import type { VortexDatabase } from "@/server/persistence/database";

type Row = {
  id: string;
  queue: string;
  idempotency_key: string;
  payload_json: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: number;
  lease_owner: string | null;
  lease_expires_at: number | null;
  last_error: string | null;
  result_json: string | null;
  created_at: string;
  updated_at: string;
};

function toJob(row: Row): BackgroundJob {
  return {
    id: row.id,
    queue: row.queue,
    idempotencyKey: row.idempotency_key,
    payload: JSON.parse(row.payload_json),
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    lastError: row.last_error,
    result: row.result_json === null ? null : JSON.parse(row.result_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Durable job queue (#25).
 *
 * Every state transition is guarded by the worker's own lease. A worker that
 * stalled long enough for its lease to expire, then woke up and tried to
 * complete, must not overwrite the run that recovered its job — so
 * `lease_owner` is part of every update predicate, not just a diagnostic field.
 */
export class SqliteJobQueueRepository implements JobQueueRepository {
  constructor(private readonly database: VortexDatabase) {}

  async enqueue(input: EnqueueJobInput): Promise<EnqueueResult> {
    const existing = await this.findByIdempotencyKey(input.queue, input.idempotencyKey);
    if (existing) return { job: existing, created: false };

    const runAfter = input.runAfter ?? Date.now();
    const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    try {
      this.database
        .prepare(
          `INSERT INTO background_jobs(
             id, queue, idempotency_key, payload_json, status, attempts, max_attempts,
             run_after, lease_owner, lease_expires_at, last_error, result_json,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
        )
        .run(
          input.id,
          input.queue,
          input.idempotencyKey,
          JSON.stringify(input.payload ?? null),
          maxAttempts,
          runAfter,
          input.now,
          input.now,
        );
    } catch (error) {
      // Two instances can enqueue the same key concurrently; the unique index
      // is the arbiter, and the loser reports the winner's job.
      const raced = await this.findByIdempotencyKey(input.queue, input.idempotencyKey);
      if (raced) return { job: raced, created: false };
      throw error;
    }

    const job = await this.find(input.id);
    if (!job) throw new Error(`Job ${input.id} vanished immediately after enqueue.`);
    return { job, created: true };
  }

  async find(jobId: string): Promise<BackgroundJob | null> {
    const row = this.database
      .prepare("SELECT * FROM background_jobs WHERE id = ?")
      .get(jobId) as Row | undefined;
    return row ? toJob(row) : null;
  }

  async findByIdempotencyKey(queue: string, idempotencyKey: string) {
    const row = this.database
      .prepare("SELECT * FROM background_jobs WHERE queue = ? AND idempotency_key = ?")
      .get(queue, idempotencyKey) as Row | undefined;
    return row ? toJob(row) : null;
  }

  async claim(input: ClaimJobInput): Promise<BackgroundJob | null> {
    const claimed = this.database.transaction(() => {
      const row = this.database
        .prepare(
          `SELECT * FROM background_jobs
             WHERE queue = ? AND status = 'queued' AND run_after <= ?
             ORDER BY run_after, id
             LIMIT 1`,
        )
        .get(input.queue, input.now) as Row | undefined;
      if (!row) return null;

      // The status predicate makes the claim atomic: a second worker running
      // the same select gets zero changes and moves on.
      const result = this.database
        .prepare(
          `UPDATE background_jobs
              SET status = 'running',
                  attempts = attempts + 1,
                  lease_owner = ?,
                  lease_expires_at = ?,
                  updated_at = ?
            WHERE id = ? AND status = 'queued'`,
        )
        .run(
          input.workerId,
          input.now + input.leaseMs,
          new Date(input.now).toISOString(),
          row.id,
        );
      if (result.changes !== 1) return null;

      return this.database
        .prepare("SELECT * FROM background_jobs WHERE id = ?")
        .get(row.id) as Row;
    })();

    return claimed ? toJob(claimed) : null;
  }

  async heartbeat(jobId: string, workerId: string, leaseExpiresAt: number) {
    const result = this.database
      .prepare(
        `UPDATE background_jobs
            SET lease_expires_at = ?
          WHERE id = ? AND status = 'running' AND lease_owner = ?`,
      )
      .run(leaseExpiresAt, jobId, workerId);
    return result.changes === 1;
  }

  async complete(input: CompleteJobInput) {
    const result = this.database
      .prepare(
        `UPDATE background_jobs
            SET status = 'succeeded',
                result_json = ?,
                lease_owner = NULL,
                lease_expires_at = NULL,
                last_error = NULL,
                updated_at = ?
          WHERE id = ? AND status = 'running' AND lease_owner = ?`,
      )
      .run(JSON.stringify(input.result ?? null), input.now, input.jobId, input.workerId);
    return result.changes === 1;
  }

  async fail(input: FailJobInput) {
    return this.database.transaction(() => {
      const row = this.database
        .prepare(
          "SELECT attempts, max_attempts FROM background_jobs WHERE id = ? AND status = 'running' AND lease_owner = ?",
        )
        .get(input.jobId, input.workerId) as
        | { attempts: number; max_attempts: number }
        | undefined;
      if (!row) return false;

      const exhausted = row.attempts >= row.max_attempts;
      return (
        this.database
          .prepare(
            `UPDATE background_jobs
                SET status = ?,
                    last_error = ?,
                    run_after = ?,
                    lease_owner = NULL,
                    lease_expires_at = NULL,
                    updated_at = ?
              WHERE id = ? AND status = 'running' AND lease_owner = ?`,
          )
          .run(
            exhausted ? "failed" : "queued",
            input.error,
            input.retryAfter,
            input.now,
            input.jobId,
            input.workerId,
          ).changes === 1
      );
    })();
  }

  async recoverExpiredLeases(now: number, nowIso: string): Promise<RecoveryOutcome> {
    return this.database.transaction(() => {
      // A job whose attempt budget is already spent must not spin forever;
      // abandoning it keeps the failure visible instead of hiding it in a loop.
      const abandoned = this.database
        .prepare(
          `UPDATE background_jobs
              SET status = 'abandoned',
                  last_error = COALESCE(last_error, 'Lease expired and no attempts remained.'),
                  lease_owner = NULL,
                  lease_expires_at = NULL,
                  updated_at = ?
            WHERE status = 'running'
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at <= ?
              AND attempts >= max_attempts`,
        )
        .run(nowIso, now).changes;

      const requeued = this.database
        .prepare(
          `UPDATE background_jobs
              SET status = 'queued',
                  last_error = COALESCE(last_error, 'Recovered after the worker lease expired.'),
                  run_after = ?,
                  lease_owner = NULL,
                  lease_expires_at = NULL,
                  updated_at = ?
            WHERE status = 'running'
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at <= ?`,
        )
        .run(now, nowIso, now).changes;

      return { requeued, abandoned };
    })();
  }

  async listByStatus(queue: string, status: JobStatus, limit = 100) {
    const rows = this.database
      .prepare(
        `SELECT * FROM background_jobs
           WHERE queue = ? AND status = ?
           ORDER BY updated_at DESC, id DESC
           LIMIT ?`,
      )
      .all(queue, status, limit) as Row[];
    return rows.map(toJob);
  }
}
