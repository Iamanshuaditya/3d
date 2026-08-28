import type { BackgroundJob, JobQueueRepository } from "./types";

export type JobHandler = (job: BackgroundJob) => Promise<unknown>;

export type JobWorkerOptions = {
  queue: string;
  workerId: string;
  /** How long a claim is held before recovery may take the job back. */
  leaseMs?: number;
  /** Backoff before a failed job becomes claimable again. */
  retryBackoffMs?: (attempts: number) => number;
  clock?: () => number;
};

const DEFAULT_LEASE_MS = 30_000;

/** Exponential with a ceiling: a broken dependency should not be hammered. */
function defaultBackoff(attempts: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

export type JobRunOutcome =
  | { kind: "idle" }
  | { kind: "succeeded"; job: BackgroundJob }
  | { kind: "failed"; job: BackgroundJob; error: string }
  | { kind: "lease-lost"; job: BackgroundJob };

/**
 * Runs persisted jobs one at a time (#25).
 *
 * Deliberately a pull loop over a shared table rather than an in-process
 * scheduler: work already committed to the database survives the process that
 * enqueued it, and any instance can pick it up. `runOnce` is the whole unit of
 * work so the loop stays trivial and the semantics stay testable without timers.
 */
export class JobWorker {
  private readonly leaseMs: number;
  private readonly backoff: (attempts: number) => number;
  private readonly clock: () => number;

  constructor(
    private readonly queue: JobQueueRepository,
    private readonly handler: JobHandler,
    private readonly options: JobWorkerOptions,
  ) {
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.backoff = options.retryBackoffMs ?? defaultBackoff;
    this.clock = options.clock ?? (() => Date.now());
  }

  async runOnce(): Promise<JobRunOutcome> {
    const now = this.clock();
    const job = await this.queue.claim({
      queue: this.options.queue,
      workerId: this.options.workerId,
      leaseMs: this.leaseMs,
      now,
    });
    if (!job) return { kind: "idle" };

    try {
      const result = await this.handler(job);
      const completed = await this.queue.complete({
        jobId: job.id,
        workerId: this.options.workerId,
        result,
        now: new Date(this.clock()).toISOString(),
      });
      // Losing the lease mid-run means recovery already requeued this job and
      // another worker owns it. Reporting success here would be a lie.
      return completed ? { kind: "succeeded", job } : { kind: "lease-lost", job };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await this.queue.fail({
        jobId: job.id,
        workerId: this.options.workerId,
        error: message,
        retryAfter: this.clock() + this.backoff(job.attempts),
        now: new Date(this.clock()).toISOString(),
      });
      return failed
        ? { kind: "failed", job, error: message }
        : { kind: "lease-lost", job };
    }
  }

  /** Drains everything currently runnable. Returns what happened to each job. */
  async drain(maxJobs = 100): Promise<JobRunOutcome[]> {
    const outcomes: JobRunOutcome[] = [];
    for (let index = 0; index < maxJobs; index += 1) {
      const outcome = await this.runOnce();
      if (outcome.kind === "idle") break;
      outcomes.push(outcome);
    }
    return outcomes;
  }

  /** Extends this worker's lease on a long-running job. */
  async heartbeat(jobId: string): Promise<boolean> {
    return this.queue.heartbeat(
      jobId,
      this.options.workerId,
      this.clock() + this.leaseMs,
    );
  }
}
