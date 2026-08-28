import { PlatformError } from "@/platform/projects/errors";
import type { ProjectOwner } from "@/platform/projects/types";
import type { RateLimitPolicy, RateLimitStore } from "@/platform/http/rate-limit";
import { getVortexDatabase } from "@/server/persistence/database";
import { InMemoryRateLimitStore, SqliteRateLimitStore } from "./rate-limit-stores";

/**
 * Rate limiting entry point (#25).
 *
 * The store is durable by default rather than in-process: a restart used to
 * reset every limit, so an abusive client only had to wait for a deploy. It is
 * also the seam that lets scaled mode share one counter across instances.
 */
let store: RateLimitStore | null = null;

export function getRateLimitStore(): RateLimitStore {
  store ??= new SqliteRateLimitStore(getVortexDatabase());
  return store;
}

/** Test seam. Passing null restores the configured store. */
export function setRateLimitStore(next: RateLimitStore | null) {
  store = next;
}

export function rateLimitKey(bucket: string, owner: ProjectOwner) {
  return `${bucket}:${owner.type}:${owner.id}`;
}

export async function assertRateLimit(
  bucket: string,
  owner: ProjectOwner,
  policy: RateLimitPolicy,
  now = Date.now(),
) {
  const decision = await getRateLimitStore().consume(
    rateLimitKey(bucket, owner),
    policy,
    now,
  );
  if (!decision.allowed) {
    throw new PlatformError(
      "RATE_LIMITED",
      "Too many requests. Wait a moment and try again.",
      429,
      { retryAfterSeconds: decision.retryAfterSeconds },
    );
  }
}

export { InMemoryRateLimitStore, SqliteRateLimitStore };
