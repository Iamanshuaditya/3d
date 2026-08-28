/**
 * Background job contract (#25).
 *
 * A process-local runner loses in-flight work on every restart and gives no
 * account of what was lost. Jobs here are persisted before they run, claimed
 * under a lease, and either complete, fail with a recorded reason, or are
 * recovered when their lease expires — never silently dropped.
 */

export type JobStatus =
  | "queued"
  | "running"
  /** Terminal success. `result` holds whatever the handler returned. */
  | "succeeded"
  /** Terminal failure after exhausting attempts. `lastError` says why. */
  | "failed"
  /** Terminal: recovered too many times, so the work is presumed poisonous. */
  | "abandoned";

export type BackgroundJob = {
  id: string;
  queue: string;
  /**
   * Deduplicates an enqueue. A retried HTTP request must not produce a second
   * run of the same work, so the queue treats this as unique per queue.
   */
  idempotencyKey: string;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  /** Epoch ms before which the job must not be claimed. Drives backoff. */
  runAfter: number;
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
  lastError: string | null;
  result: unknown;
  createdAt: string;
  updatedAt: string;
};

export type EnqueueJobInput = {
  id: string;
  queue: string;
  idempotencyKey: string;
  payload: unknown;
  maxAttempts?: number;
  /** Epoch ms; defaults to now, i.e. runnable immediately. */
  runAfter?: number;
  now: string;
};

export type EnqueueResult = {
  job: BackgroundJob;
  /** False when an existing job with the same idempotency key was returned. */
  created: boolean;
};

export type ClaimJobInput = {
  queue: string;
  /** Identifies the worker holding the lease, for diagnostics and recovery. */
  workerId: string;
  /** How long this worker promises to finish, or heartbeat, within. */
  leaseMs: number;
  now: number;
};

export type CompleteJobInput = {
  jobId: string;
  workerId: string;
  result: unknown;
  now: string;
};

export type FailJobInput = {
  jobId: string;
  workerId: string;
  error: string;
  /** Epoch ms for the retry, when attempts remain. */
  retryAfter: number;
  now: string;
};

export type RecoveryOutcome = {
  /** Jobs whose lease expired and which were returned to the queue. */
  requeued: number;
  /** Jobs recovered past their attempt budget and given up on. */
  abandoned: number;
};

export interface JobQueueRepository {
  enqueue(input: EnqueueJobInput): Promise<EnqueueResult>;
  find(jobId: string): Promise<BackgroundJob | null>;
  findByIdempotencyKey(queue: string, idempotencyKey: string): Promise<BackgroundJob | null>;
  /** Atomically claims one runnable job, or returns null. */
  claim(input: ClaimJobInput): Promise<BackgroundJob | null>;
  /** Extends a held lease. Returns false if the lease was already lost. */
  heartbeat(jobId: string, workerId: string, leaseExpiresAt: number): Promise<boolean>;
  complete(input: CompleteJobInput): Promise<boolean>;
  fail(input: FailJobInput): Promise<boolean>;
  /** Returns expired leases to the queue. This is what survives a restart. */
  recoverExpiredLeases(now: number, nowIso: string): Promise<RecoveryOutcome>;
  listByStatus(queue: string, status: JobStatus, limit?: number): Promise<BackgroundJob[]>;
}
