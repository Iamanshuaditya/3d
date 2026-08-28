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
import type { PostgresDatabase } from "./connection";

type Row = {
  id: string;
  queue: string;
  idempotency_key: string;
  payload_json: unknown;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string | number;
  lease_owner: string | null;
  lease_expires_at: string | number | null;
  last_error: string | null;
  result_json: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

/** `bigint` arrives as a string from pg, because it can exceed a JS number. */
function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === "number" ? value : Number(value);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toJob(row: Row): BackgroundJob {
  return {
    id: row.id,
    queue: row.queue,
    idempotencyKey: row.idempotency_key,
    payload: row.payload_json,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: toNumber(row.run_after)!,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: toNumber(row.lease_expires_at),
    lastError: row.last_error,
    result: row.result_json ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const DEFAULT_MAX_ATTEMPTS = 3;
const COLUMNS = `id, queue, idempotency_key, payload_json, status, attempts, max_attempts,
                 run_after, lease_owner, lease_expires_at, last_error, result_json,
                 created_at, updated_at`;

/**
 * Distributed job queue (#25).
 *
 * `FOR UPDATE SKIP LOCKED` is the whole reason this works across instances:
 * concurrent workers each take a different row instead of serialising on the
 * head of the queue or colliding on the same job. Every state transition is
 * still guarded by `lease_owner`, so a worker whose lease expired cannot
 * overwrite the run that recovered its job.
 */
export class PostgresJobQueueRepository implements JobQueueRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async enqueue(input: EnqueueJobInput): Promise<EnqueueResult> {
    const runAfter = input.runAfter ?? Date.now();
    const rows = await this.database.query<Row>(
      `INSERT INTO background_jobs(
         id, queue, idempotency_key, payload_json, status, attempts, max_attempts,
         run_after, created_at, updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, 'queued', 0, $5, $6, $7, $7)
       ON CONFLICT (queue, idempotency_key) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.queue,
        input.idempotencyKey,
        JSON.stringify(input.payload ?? null),
        input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        runAfter,
        input.now,
      ],
    );
    if (rows.length) return { job: toJob(rows[0]), created: true };

    // DO NOTHING means an existing job already owns this idempotency key, which
    // is the intended outcome for a retried enqueue rather than an error.
    const existing = await this.findByIdempotencyKey(input.queue, input.idempotencyKey);
    if (!existing) {
      throw new Error(
        `Job ${input.idempotencyKey} on ${input.queue} was neither inserted nor found.`,
      );
    }
    return { job: existing, created: false };
  }

  async find(jobId: string): Promise<BackgroundJob | null> {
    const rows = await this.database.query<Row>(
      `SELECT ${COLUMNS} FROM background_jobs WHERE id = $1`,
      [jobId],
    );
    return rows.length ? toJob(rows[0]) : null;
  }

  async findByIdempotencyKey(queue: string, idempotencyKey: string) {
    const rows = await this.database.query<Row>(
      `SELECT ${COLUMNS} FROM background_jobs WHERE queue = $1 AND idempotency_key = $2`,
      [queue, idempotencyKey],
    );
    return rows.length ? toJob(rows[0]) : null;
  }

  async claim(input: ClaimJobInput): Promise<BackgroundJob | null> {
    return this.database.transaction(async (executor) => {
      const candidates = await executor.query<{ id: string }>(
        `SELECT id FROM background_jobs
           WHERE queue = $1 AND status = 'queued' AND run_after <= $2
           ORDER BY run_after, id
           LIMIT 1
           FOR UPDATE SKIP LOCKED`,
        [input.queue, input.now],
      );
      if (!candidates.length) return null;

      const updated = await executor.query<Row>(
        `UPDATE background_jobs
            SET status = 'running',
                attempts = attempts + 1,
                lease_owner = $2,
                lease_expires_at = $3,
                updated_at = $4
          WHERE id = $1 AND status = 'queued'
          RETURNING ${COLUMNS}`,
        [
          candidates[0].id,
          input.workerId,
          input.now + input.leaseMs,
          new Date(input.now).toISOString(),
        ],
      );
      return updated.length ? toJob(updated[0]) : null;
    });
  }

  async heartbeat(jobId: string, workerId: string, leaseExpiresAt: number) {
    const changed = await this.database.execute(
      `UPDATE background_jobs
          SET lease_expires_at = $3
        WHERE id = $1 AND status = 'running' AND lease_owner = $2`,
      [jobId, workerId, leaseExpiresAt],
    );
    return changed === 1;
  }

  async complete(input: CompleteJobInput) {
    const changed = await this.database.execute(
      `UPDATE background_jobs
          SET status = 'succeeded',
              result_json = $3::jsonb,
              lease_owner = NULL,
              lease_expires_at = NULL,
              last_error = NULL,
              updated_at = $4
        WHERE id = $1 AND status = 'running' AND lease_owner = $2`,
      [
        input.jobId,
        input.workerId,
        JSON.stringify(input.result ?? null),
        input.now,
      ],
    );
    return changed === 1;
  }

  async fail(input: FailJobInput) {
    const changed = await this.database.execute(
      `UPDATE background_jobs
          SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
              last_error = $3,
              run_after = $4,
              lease_owner = NULL,
              lease_expires_at = NULL,
              updated_at = $5
        WHERE id = $1 AND status = 'running' AND lease_owner = $2`,
      [input.jobId, input.workerId, input.error, input.retryAfter, input.now],
    );
    return changed === 1;
  }

  async recoverExpiredLeases(now: number, nowIso: string): Promise<RecoveryOutcome> {
    return this.database.transaction(async (executor) => {
      const abandoned = await executor.execute(
        `UPDATE background_jobs
            SET status = 'abandoned',
                last_error = COALESCE(last_error, 'Lease expired and no attempts remained.'),
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = $2
          WHERE status = 'running'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at <= $1
            AND attempts >= max_attempts`,
        [now, nowIso],
      );
      const requeued = await executor.execute(
        `UPDATE background_jobs
            SET status = 'queued',
                last_error = COALESCE(last_error, 'Recovered after the worker lease expired.'),
                run_after = $1,
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = $2
          WHERE status = 'running'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at <= $1`,
        [now, nowIso],
      );
      return { requeued, abandoned };
    });
  }

  async listByStatus(queue: string, status: JobStatus, limit = 100) {
    const rows = await this.database.query<Row>(
      `SELECT ${COLUMNS} FROM background_jobs
         WHERE queue = $1 AND status = $2
         ORDER BY updated_at DESC, id DESC
         LIMIT $3`,
      [queue, status, limit],
    );
    return rows.map(toJob);
  }
}
