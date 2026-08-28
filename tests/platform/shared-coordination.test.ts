import assert from "node:assert/strict";
import test from "node:test";
import { openVortexDatabase } from "@/server/persistence/database";
import {
  InMemoryRateLimitStore,
  SqliteRateLimitStore,
} from "@/server/http/rate-limit-stores";
import { assertRateLimit, setRateLimitStore } from "@/server/http/rate-limit";
import { SqliteJobQueueRepository } from "@/server/jobs/sqlite-job-queue-repository";
import { JobWorker } from "@/platform/jobs/worker";
import type { RateLimitStore } from "@/platform/http/rate-limit";
import { PlatformError } from "@/platform/projects/errors";

const POLICY = { limit: 3, windowMs: 60_000 };

function memoryDatabase() {
  return openVortexDatabase(":memory:");
}

for (const [name, make] of [
  ["in-memory", () => new InMemoryRateLimitStore()],
  ["sqlite", () => new SqliteRateLimitStore(memoryDatabase())],
] as const) {
  test(`${name} rate limit store counts a fixed window deterministically`, async () => {
    const store: RateLimitStore = make();
    const now = 1_700_000_000_000;

    for (let hit = 1; hit <= POLICY.limit; hit += 1) {
      const decision = await store.consume("k", POLICY, now);
      assert.equal(decision.allowed, true, `hit ${hit} should be allowed`);
      assert.equal(decision.remaining, POLICY.limit - hit);
    }

    const blocked = await store.consume("k", POLICY, now);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);
  });

  test(`${name} rate limit store isolates keys and resets on the next window`, async () => {
    const store: RateLimitStore = make();
    const now = 1_700_000_000_000;

    for (let hit = 0; hit < POLICY.limit + 1; hit += 1) await store.consume("a", POLICY, now);
    assert.equal((await store.consume("a", POLICY, now)).allowed, false);
    // A different key must be entirely unaffected by another key's exhaustion.
    assert.equal((await store.consume("b", POLICY, now)).allowed, true);

    const nextWindow = now + POLICY.windowMs;
    assert.equal((await store.consume("a", POLICY, nextWindow)).allowed, true);
  });
}

test("the sqlite store shares one counter across independent store instances", async () => {
  // This is the actual point of the change: two app instances against the same
  // database must contend on one counter, not keep private ones.
  const database = memoryDatabase();
  const instanceOne = new SqliteRateLimitStore(database);
  const instanceTwo = new SqliteRateLimitStore(database);
  const now = 1_700_000_000_000;

  assert.equal((await instanceOne.consume("shared", POLICY, now)).allowed, true);
  assert.equal((await instanceTwo.consume("shared", POLICY, now)).remaining, 1);
  assert.equal((await instanceOne.consume("shared", POLICY, now)).remaining, 0);
  assert.equal((await instanceTwo.consume("shared", POLICY, now)).allowed, false);
});

test("a durable rate limit is not reset by restarting the process", async () => {
  const database = memoryDatabase();
  const now = 1_700_000_000_000;
  const before = new SqliteRateLimitStore(database);
  for (let hit = 0; hit <= POLICY.limit; hit += 1) await before.consume("k", POLICY, now);

  // A fresh store object stands in for a restarted instance reattaching to the
  // same database. An in-process counter would have forgotten everything.
  const after = new SqliteRateLimitStore(database);
  assert.equal((await after.consume("k", POLICY, now)).allowed, false);
});

test("sweeping drops only windows that have already expired", async () => {
  const database = memoryDatabase();
  const store = new SqliteRateLimitStore(database);
  // Windows are floor-aligned to the policy width, so an aligned instant keeps
  // the arithmetic here exact rather than approximately right.
  const now = 1_700_000_040_000;
  assert.equal(now % POLICY.windowMs, 0);
  await store.consume("k", POLICY, now);

  await store.sweep(now + POLICY.windowMs - 1);
  assert.equal((await store.consume("k", POLICY, now)).remaining, 1);

  await store.sweep(now + POLICY.windowMs);
  assert.equal((await store.consume("k", POLICY, now)).remaining, POLICY.limit - 1);
});

test("assertRateLimit reports a retry delay callers can act on", async () => {
  setRateLimitStore(new InMemoryRateLimitStore());
  const owner = { type: "guest", id: "guest-1" } as const;
  try {
    for (let hit = 0; hit < 5; hit += 1) {
      await assertRateLimit("test-bucket", owner, { limit: 2, windowMs: 60_000 });
    }
    assert.fail("Expected the limit to be enforced.");
  } catch (error) {
    assert.ok(error instanceof PlatformError);
    assert.equal(error.code, "RATE_LIMITED");
    assert.equal(error.status, 429);
    assert.ok(Number(error.details?.retryAfterSeconds) >= 1);
  } finally {
    setRateLimitStore(null);
  }
});

test("two owners never share a rate-limit budget", async () => {
  setRateLimitStore(new InMemoryRateLimitStore());
  const policy = { limit: 1, windowMs: 60_000 };
  await assertRateLimit("bucket", { type: "guest", id: "a" }, policy);
  // Same bucket, different owner: must not inherit the first owner's usage.
  await assertRateLimit("bucket", { type: "guest", id: "b" }, policy);
  await assertRateLimit("bucket", { type: "user", id: "a" }, policy);
  setRateLimitStore(null);
});

// ---- job queue -------------------------------------------------------------

const NOW_ISO = "2026-08-29T00:00:00.000Z";

function jobQueue() {
  return new SqliteJobQueueRepository(memoryDatabase());
}

test("enqueue is idempotent, so a retried request cannot run work twice", async () => {
  const queue = jobQueue();
  const first = await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "project-1:revision-2",
    payload: { projectId: "project-1" },
    now: NOW_ISO,
  });
  const second = await queue.enqueue({
    id: "job-2",
    queue: "render",
    idempotencyKey: "project-1:revision-2",
    payload: { projectId: "project-1" },
    now: NOW_ISO,
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.job.id, "job-1");
  assert.equal((await queue.listByStatus("render", "queued")).length, 1);
});

test("only one worker can claim a job", async () => {
  const queue = jobQueue();
  await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "k",
    payload: {},
    now: NOW_ISO,
  });
  const now = Date.parse(NOW_ISO);

  const claimedByOne = await queue.claim({ queue: "render", workerId: "w1", leaseMs: 1_000, now });
  const claimedByTwo = await queue.claim({ queue: "render", workerId: "w2", leaseMs: 1_000, now });

  assert.equal(claimedByOne?.id, "job-1");
  assert.equal(claimedByOne?.leaseOwner, "w1");
  assert.equal(claimedByOne?.attempts, 1);
  assert.equal(claimedByTwo, null);
});

test("a job survives the process that was running it", async () => {
  const queue = jobQueue();
  await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "k",
    payload: { work: true },
    now: NOW_ISO,
  });
  const now = Date.parse(NOW_ISO);
  await queue.claim({ queue: "render", workerId: "crashed-worker", leaseMs: 1_000, now });

  // The worker dies here. Nothing calls complete or fail.
  const afterLease = now + 5_000;
  const recovery = await queue.recoverExpiredLeases(afterLease, NOW_ISO);
  assert.deepEqual(recovery, { requeued: 1, abandoned: 0 });

  const requeued = await queue.claim({
    queue: "render",
    workerId: "healthy-worker",
    leaseMs: 1_000,
    now: afterLease,
  });
  assert.equal(requeued?.id, "job-1");
  assert.equal(requeued?.attempts, 2);
  assert.deepEqual(requeued?.payload, { work: true });
});

test("a worker that lost its lease cannot overwrite the run that replaced it", async () => {
  const queue = jobQueue();
  await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "k",
    payload: {},
    now: NOW_ISO,
  });
  const now = Date.parse(NOW_ISO);
  await queue.claim({ queue: "render", workerId: "stalled", leaseMs: 1_000, now });
  await queue.recoverExpiredLeases(now + 5_000, NOW_ISO);
  await queue.claim({ queue: "render", workerId: "healthy", leaseMs: 60_000, now: now + 5_000 });

  // The stalled worker wakes up and reports success for a job it no longer owns.
  const stolen = await queue.complete({
    jobId: "job-1",
    workerId: "stalled",
    result: { wrong: true },
    now: NOW_ISO,
  });
  assert.equal(stolen, false);

  const job = await queue.find("job-1");
  assert.equal(job?.status, "running");
  assert.equal(job?.leaseOwner, "healthy");
  assert.equal(job?.result, null);
});

test("a failing job retries with backoff and then fails terminally", async () => {
  const queue = jobQueue();
  await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "k",
    payload: {},
    maxAttempts: 2,
    now: NOW_ISO,
  });
  let now = Date.parse(NOW_ISO);
  const worker = new JobWorker(
    queue,
    async () => {
      throw new Error("dependency unavailable");
    },
    { queue: "render", workerId: "w1", leaseMs: 60_000, clock: () => now },
  );

  const first = await worker.runOnce();
  assert.equal(first.kind, "failed");
  let job = await queue.find("job-1");
  assert.equal(job?.status, "queued");
  assert.equal(job?.attempts, 1);
  // Backoff must actually hold the job back, or a broken dependency is hammered.
  assert.ok((job?.runAfter ?? 0) > now);
  assert.equal(await worker.runOnce().then((outcome) => outcome.kind), "idle");

  now = (job?.runAfter ?? now) + 1;
  const second = await worker.runOnce();
  assert.equal(second.kind, "failed");
  job = await queue.find("job-1");
  assert.equal(job?.status, "failed");
  assert.equal(job?.attempts, 2);
  assert.equal(job?.lastError, "dependency unavailable");
});

test("a succeeding job records its result and stops being claimable", async () => {
  const queue = jobQueue();
  await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "k",
    payload: { input: 2 },
    now: NOW_ISO,
  });
  const now = Date.parse(NOW_ISO);
  const worker = new JobWorker(
    queue,
    async (job) => ({ doubled: (job.payload as { input: number }).input * 2 }),
    { queue: "render", workerId: "w1", clock: () => now },
  );

  assert.equal((await worker.runOnce()).kind, "succeeded");
  const job = await queue.find("job-1");
  assert.equal(job?.status, "succeeded");
  assert.deepEqual(job?.result, { doubled: 4 });
  assert.equal(job?.leaseOwner, null);
  assert.equal((await worker.runOnce()).kind, "idle");
});

test("a job recovered past its attempt budget is abandoned, not looped forever", async () => {
  const queue = jobQueue();
  await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "k",
    payload: {},
    maxAttempts: 1,
    now: NOW_ISO,
  });
  const now = Date.parse(NOW_ISO);
  await queue.claim({ queue: "render", workerId: "w1", leaseMs: 1_000, now });

  const recovery = await queue.recoverExpiredLeases(now + 5_000, NOW_ISO);
  assert.deepEqual(recovery, { requeued: 0, abandoned: 1 });
  const job = await queue.find("job-1");
  assert.equal(job?.status, "abandoned");
  assert.ok(job?.lastError);
});

test("heartbeating extends a lease, and only for the worker holding it", async () => {
  const queue = jobQueue();
  await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "k",
    payload: {},
    now: NOW_ISO,
  });
  const now = Date.parse(NOW_ISO);
  const claimed = await queue.claim({ queue: "render", workerId: "w1", leaseMs: 1_000, now });

  assert.equal(await queue.heartbeat("job-1", "w1", now + 60_000), true);
  assert.equal(await queue.heartbeat("job-1", "impostor", now + 999_000), false);

  // The extended lease must now survive a recovery sweep that would previously
  // have reclaimed the job.
  assert.deepEqual(await queue.recoverExpiredLeases(now + 5_000, NOW_ISO), {
    requeued: 0,
    abandoned: 0,
  });
  assert.equal((await queue.find("job-1"))?.leaseExpiresAt, now + 60_000);
  assert.ok(claimed);
});

test("a queue only hands out its own jobs", async () => {
  const queue = jobQueue();
  await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "k",
    payload: {},
    now: NOW_ISO,
  });
  const now = Date.parse(NOW_ISO);
  assert.equal(
    await queue.claim({ queue: "personalization", workerId: "w1", leaseMs: 1_000, now }),
    null,
  );
});
