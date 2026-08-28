import assert from "node:assert/strict";
import test from "node:test";
import { PostgresDatabase, postgresSettings } from "@/server/persistence/postgres/connection";
import { currentSchemaVersion, migratePostgres } from "@/server/persistence/postgres/migrate";
import { PostgresRateLimitStore } from "@/server/persistence/postgres/postgres-rate-limit-store";
import { PostgresJobQueueRepository } from "@/server/persistence/postgres/postgres-job-queue-repository";
import { JobWorker } from "@/platform/jobs/worker";
import { SCHEMA_VERSION } from "@/server/persistence/database";

/**
 * These run against a real PostgreSQL, or not at all.
 *
 * A mocked database would prove nothing here: every claim in this file is about
 * behaviour PostgreSQL provides — ON CONFLICT atomicity, FOR UPDATE SKIP
 * LOCKED, transaction isolation. Skipping loudly is more honest than passing
 * against a fake.
 *
 *   docker run -d -e POSTGRES_PASSWORD=vortex -e POSTGRES_DB=vortex -p 55499:5432 postgres:17
 *   VORTEX_POSTGRES_TEST_URL=postgresql://postgres:vortex@127.0.0.1:55499/vortex npm test
 */
const TEST_URL = process.env.VORTEX_POSTGRES_TEST_URL?.trim();
const describe = TEST_URL ? test : test.skip;

async function freshDatabase(label: string) {
  const settings = postgresSettings({
    ...process.env,
    VORTEX_POSTGRES_URL: TEST_URL,
    // A local test container has no certificate to verify.
    VORTEX_POSTGRES_SSL: "disable",
  });
  const database = new PostgresDatabase(settings);
  // Each test gets an empty public schema so ordering between tests cannot
  // silently become part of what they assert.
  await database.execute(`DROP SCHEMA IF EXISTS public CASCADE`);
  await database.execute(`CREATE SCHEMA public`);
  await migratePostgres(database);
  return { database, label };
}

const POLICY = { limit: 3, windowMs: 60_000 };
const NOW_ISO = "2026-08-29T00:00:00.000Z";
const NOW = Date.parse(NOW_ISO);

describe("the target schema applies cleanly and reports the runtime's version", async (t) => {
  const { database } = await freshDatabase("schema");
  t.after(() => database.close());

  assert.equal(await currentSchemaVersion(database), SCHEMA_VERSION);

  // Applying against an already-migrated database is a no-op, not an error:
  // every instance runs this on boot.
  assert.deepEqual(await migratePostgres(database), {
    applied: false,
    version: SCHEMA_VERSION,
  });

  const tables = await database.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  const names = tables.map((row) => row.table_name);
  for (const required of [
    "design_projects",
    "project_revisions",
    "project_assets",
    "production_artifacts",
    "rate_limit_windows",
    "background_jobs",
  ]) {
    assert.ok(names.includes(required), `${required} must exist`);
  }
});

describe("a database newer than the runtime is refused rather than used", async (t) => {
  const { database } = await freshDatabase("version-guard");
  t.after(() => database.close());

  await database.execute("INSERT INTO schema_migrations(version) VALUES ($1)", [
    SCHEMA_VERSION + 1,
  ]);
  await assert.rejects(
    () => migratePostgres(database),
    /newer than this runtime/,
  );
});

describe("rate limits are shared across instances", async (t) => {
  const { database } = await freshDatabase("rate-limit");
  t.after(() => database.close());

  // Two stores over the same database stand in for two app instances.
  const instanceOne = new PostgresRateLimitStore(database);
  const instanceTwo = new PostgresRateLimitStore(database);

  assert.equal((await instanceOne.consume("shared", POLICY, NOW)).remaining, 2);
  assert.equal((await instanceTwo.consume("shared", POLICY, NOW)).remaining, 1);
  assert.equal((await instanceOne.consume("shared", POLICY, NOW)).remaining, 0);

  const blocked = await instanceTwo.consume("shared", POLICY, NOW);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);

  // A different key is unaffected, and the next window starts clean.
  assert.equal((await instanceOne.consume("other", POLICY, NOW)).allowed, true);
  assert.equal(
    (await instanceTwo.consume("shared", POLICY, NOW + POLICY.windowMs)).allowed,
    true,
  );
});

describe("concurrent consumption never exceeds the limit", async (t) => {
  const { database } = await freshDatabase("rate-limit-race");
  t.after(() => database.close());

  const store = new PostgresRateLimitStore(database);
  const attempts = 40;
  const policy = { limit: 10, windowMs: 60_000 };
  const decisions = await Promise.all(
    Array.from({ length: attempts }, () => store.consume("race", policy, NOW)),
  );

  // This is the whole point of doing it in one statement: a read-then-write
  // limiter lets concurrent requests through well past the limit.
  assert.equal(decisions.filter((decision) => decision.allowed).length, policy.limit);
  assert.equal(decisions.filter((decision) => !decision.allowed).length, attempts - policy.limit);
});

describe("enqueue is idempotent under concurrency", async (t) => {
  const { database } = await freshDatabase("job-idempotency");
  t.after(() => database.close());

  const queue = new PostgresJobQueueRepository(database);
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      queue.enqueue({
        id: `job-${index}`,
        queue: "render",
        idempotencyKey: "project-1:revision-2",
        payload: { projectId: "project-1" },
        now: NOW_ISO,
      }),
    ),
  );

  assert.equal(results.filter((result) => result.created).length, 1);
  const ids = new Set(results.map((result) => result.job.id));
  assert.equal(ids.size, 1, "every caller must observe the same job");
  assert.equal((await queue.listByStatus("render", "queued")).length, 1);
});

describe("concurrent workers each claim a different job", async (t) => {
  const { database } = await freshDatabase("job-claim");
  t.after(() => database.close());

  const queue = new PostgresJobQueueRepository(database);
  for (let index = 0; index < 6; index += 1) {
    await queue.enqueue({
      id: `job-${index}`,
      queue: "render",
      idempotencyKey: `key-${index}`,
      payload: { index },
      now: NOW_ISO,
    });
  }

  // SKIP LOCKED is what makes this work: without it these serialise on the
  // head of the queue or collide on the same row.
  const claims = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      queue.claim({ queue: "render", workerId: `w${index}`, leaseMs: 30_000, now: NOW }),
    ),
  );

  const claimedIds = claims.map((job) => job?.id).filter(Boolean);
  assert.equal(claimedIds.length, 6);
  assert.equal(new Set(claimedIds).size, 6, "no job may be claimed twice");
  assert.equal(
    await queue.claim({ queue: "render", workerId: "late", leaseMs: 30_000, now: NOW }),
    null,
  );
});

describe("a job survives the instance that was running it", async (t) => {
  const { database } = await freshDatabase("job-recovery");
  t.after(() => database.close());

  const queue = new PostgresJobQueueRepository(database);
  await queue.enqueue({
    id: "job-1",
    queue: "render",
    idempotencyKey: "k",
    payload: { work: true },
    now: NOW_ISO,
  });
  await queue.claim({ queue: "render", workerId: "crashed", leaseMs: 1_000, now: NOW });

  // The instance dies here: nothing calls complete or fail.
  const after = NOW + 5_000;
  assert.deepEqual(await queue.recoverExpiredLeases(after, NOW_ISO), {
    requeued: 1,
    abandoned: 0,
  });

  const requeued = await queue.claim({
    queue: "render",
    workerId: "healthy",
    leaseMs: 30_000,
    now: after,
  });
  assert.equal(requeued?.id, "job-1");
  assert.equal(requeued?.attempts, 2);
  assert.deepEqual(requeued?.payload, { work: true });

  // The dead worker waking up must not be able to overwrite the live run.
  assert.equal(
    await queue.complete({
      jobId: "job-1",
      workerId: "crashed",
      result: { stale: true },
      now: NOW_ISO,
    }),
    false,
  );
  assert.equal((await queue.find("job-1"))?.leaseOwner, "healthy");
});

describe("a worker runs, retries and terminally fails against PostgreSQL", async (t) => {
  const { database } = await freshDatabase("job-worker");
  t.after(() => database.close());

  const queue = new PostgresJobQueueRepository(database);
  await queue.enqueue({
    id: "ok",
    queue: "render",
    idempotencyKey: "ok",
    payload: { input: 21 },
    now: NOW_ISO,
  });

  let now = NOW;
  const succeeding = new JobWorker(
    queue,
    async (job) => ({ doubled: (job.payload as { input: number }).input * 2 }),
    { queue: "render", workerId: "w1", clock: () => now },
  );
  assert.equal((await succeeding.runOnce()).kind, "succeeded");
  const done = await queue.find("ok");
  assert.equal(done?.status, "succeeded");
  assert.deepEqual(done?.result, { doubled: 42 });

  await queue.enqueue({
    id: "bad",
    queue: "render",
    idempotencyKey: "bad",
    payload: {},
    maxAttempts: 2,
    now: NOW_ISO,
  });
  const failing = new JobWorker(
    queue,
    async () => {
      throw new Error("downstream unavailable");
    },
    { queue: "render", workerId: "w1", clock: () => now },
  );

  assert.equal((await failing.runOnce()).kind, "failed");
  let job = await queue.find("bad");
  assert.equal(job?.status, "queued");
  assert.ok((job?.runAfter ?? 0) > now, "backoff must hold the retry back");

  now = (job?.runAfter ?? now) + 1;
  assert.equal((await failing.runOnce()).kind, "failed");
  job = await queue.find("bad");
  assert.equal(job?.status, "failed");
  assert.equal(job?.attempts, 2);
  assert.equal(job?.lastError, "downstream unavailable");
});

describe("a transaction rolls back completely on failure", async (t) => {
  const { database } = await freshDatabase("transaction");
  t.after(() => database.close());

  const queue = new PostgresJobQueueRepository(database);
  await assert.rejects(() =>
    database.transaction(async (executor) => {
      await executor.execute(
        `INSERT INTO background_jobs(
           id, queue, idempotency_key, payload_json, status, attempts, max_attempts,
           run_after, created_at, updated_at
         ) VALUES ('t1', 'render', 'tx', '{}'::jsonb, 'queued', 0, 3, 0, $1, $1)`,
        [NOW_ISO],
      );
      throw new Error("work failed after the insert");
    }),
  );

  // Compare-and-swap, guest claiming and atomic publication all depend on this
  // being all-or-nothing.
  assert.equal(await queue.find("t1"), null);
});
