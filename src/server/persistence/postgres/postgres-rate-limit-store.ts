import type {
  RateLimitDecision,
  RateLimitPolicy,
  RateLimitStore,
} from "@/platform/http/rate-limit";
import { decisionFor, windowStart } from "@/platform/http/rate-limit";
import type { PostgresDatabase } from "./connection";

/**
 * The shared rate limiter that makes scaled mode possible (#25).
 *
 * One statement, so concurrent instances contend on the row rather than racing
 * a read against a write. This is the difference between a limit of N and a
 * limit of N times however many pods are running.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly database: PostgresDatabase) {}

  async consume(
    key: string,
    policy: RateLimitPolicy,
    now: number,
  ): Promise<RateLimitDecision> {
    const startedAt = windowStart(now, policy.windowMs);
    const [row] = await this.database.query<{ hit_count: number }>(
      `INSERT INTO rate_limit_windows(bucket_key, window_started_at, hit_count, expires_at)
         VALUES ($1, $2, 1, $3)
       ON CONFLICT (bucket_key, window_started_at)
         DO UPDATE SET hit_count = rate_limit_windows.hit_count + 1
       RETURNING hit_count`,
      [key, startedAt, startedAt + policy.windowMs],
    );
    return decisionFor(row.hit_count, policy, startedAt, now);
  }

  async sweep(now: number): Promise<void> {
    await this.database.execute("DELETE FROM rate_limit_windows WHERE expires_at <= $1", [now]);
  }
}
