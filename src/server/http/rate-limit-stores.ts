import type {
  RateLimitDecision,
  RateLimitPolicy,
  RateLimitStore,
} from "@/platform/http/rate-limit";
import { decisionFor, windowStart } from "@/platform/http/rate-limit";
import type { VortexDatabase } from "@/server/persistence/database";

/**
 * Single-process store (#25).
 *
 * Correct and fast for the supported single-node deployment, and deliberately
 * useless across instances — which is why scaled mode refuses to start unless
 * a shared store is configured.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<
    string,
    { count: number; startedAt: number; expiresAt: number }
  >();

  async consume(
    key: string,
    policy: RateLimitPolicy,
    now: number,
  ): Promise<RateLimitDecision> {
    const startedAt = windowStart(now, policy.windowMs);
    const current = this.windows.get(key);
    const count = current && current.startedAt === startedAt ? current.count + 1 : 1;
    this.windows.set(key, { count, startedAt, expiresAt: startedAt + policy.windowMs });
    return decisionFor(count, policy, startedAt, now);
  }

  async sweep(now: number): Promise<void> {
    for (const [key, window] of this.windows) {
      // A window is only ever consulted while `now` falls inside it, so one
      // that has already expired is unreachable and safe to drop.
      if (window.expiresAt <= now) this.windows.delete(key);
    }
  }
}

/**
 * Database-backed store shared by every instance pointed at the same database.
 *
 * Deliberately not Redis: the database is already the deployment's coordination
 * point, and a rate limiter is not worth a second piece of infrastructure to
 * run, secure and back up. Redis would be faster; at packaging-configurator
 * request volumes that difference does not buy anything.
 *
 * The upsert is one statement so two instances contend on the row rather than
 * racing a read against a write.
 */
export class SqliteRateLimitStore implements RateLimitStore {
  constructor(private readonly database: VortexDatabase) {}

  async consume(
    key: string,
    policy: RateLimitPolicy,
    now: number,
  ): Promise<RateLimitDecision> {
    const startedAt = windowStart(now, policy.windowMs);
    const row = this.database
      .prepare(
        `INSERT INTO rate_limit_windows(bucket_key, window_started_at, hit_count, expires_at)
           VALUES (?, ?, 1, ?)
         ON CONFLICT(bucket_key, window_started_at)
           DO UPDATE SET hit_count = hit_count + 1
         RETURNING hit_count`,
      )
      .get(key, startedAt, startedAt + policy.windowMs) as { hit_count: number };
    return decisionFor(row.hit_count, policy, startedAt, now);
  }

  async sweep(now: number): Promise<void> {
    this.database.prepare("DELETE FROM rate_limit_windows WHERE expires_at <= ?").run(now);
  }
}
