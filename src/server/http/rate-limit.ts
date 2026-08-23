import { PlatformError } from "@/platform/projects/errors";
import type { ProjectOwner } from "@/platform/projects/types";

type Window = { count: number; resetsAt: number };
const windows = new Map<string, Window>();

export function assertRateLimit(
  bucket: string,
  owner: ProjectOwner,
  options: { limit: number; windowMs: number },
) {
  const now = Date.now();
  const key = `${bucket}:${owner.type}:${owner.id}`;
  const current = windows.get(key);
  if (!current || current.resetsAt <= now) {
    windows.set(key, { count: 1, resetsAt: now + options.windowMs });
    return;
  }
  current.count += 1;
  if (current.count > options.limit) {
    throw new PlatformError(
      "RATE_LIMITED",
      "Too many requests. Wait a moment and try again.",
      429,
      { retryAfterSeconds: Math.max(1, Math.ceil((current.resetsAt - now) / 1_000)) },
    );
  }
}

