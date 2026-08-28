/**
 * Shared rate limiting contract (#25).
 *
 * Process-local counters give N instances N times the limit, which is not a
 * rate limit — it is a rate limit divided by however many pods happen to be
 * running. The decision therefore moves behind a store that can be shared, and
 * the limits themselves stay declarative and testable.
 */

export type RateLimitDecision = {
  allowed: boolean;
  /** Hits still available in the current window. Zero once blocked. */
  remaining: number;
  /** Whole seconds until the window resets. At least 1 when blocked. */
  retryAfterSeconds: number;
};

export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export interface RateLimitStore {
  /**
   * Counts one hit against `key` and reports the decision.
   *
   * Must be atomic: two instances consuming concurrently have to observe each
   * other, or the limit is advisory. Implementations are expected to use a
   * single round trip rather than read-then-write.
   */
  consume(key: string, policy: RateLimitPolicy, now: number): Promise<RateLimitDecision>;

  /** Drops expired windows. Safe to call concurrently and to skip entirely. */
  sweep?(now: number): Promise<void>;
}

/**
 * Fixed-window counting.
 *
 * A sliding window is more accurate at the boundary, but a fixed window is
 * exactly reproducible from a key and a clock, which is what makes these
 * limits testable rather than approximately observed.
 */
export function windowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function decisionFor(
  count: number,
  policy: RateLimitPolicy,
  windowStartedAt: number,
  now: number,
): RateLimitDecision {
  const resetsAt = windowStartedAt + policy.windowMs;
  const allowed = count <= policy.limit;
  return {
    allowed,
    remaining: Math.max(0, policy.limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetsAt - now) / 1_000)),
  };
}
