# Background Jobs

## The single most important fact in this document

There are **three separate asynchronous mechanisms** in this repository, and the
most sophisticated one is **not wired to anything**.

| Mechanism | Durable? | Used in production code? | Where |
|---|---|---|---|
| `PersonalizationRunner` | Row state in `personalization_jobs`; scheduling is in-process | **Yes** | `src/server/personalization/` |
| `OnboardingRunner` | Row state in `onboarding_jobs`; scheduling is in-process | **Yes** | `src/server/onboarding/` |
| `JobWorker` + `background_jobs` table | Fully durable, leased, idempotent, backoff | **No — tests only** | `src/platform/jobs/`, `src/server/jobs/`, `src/server/persistence/postgres/postgres-job-queue-repository.ts` |

VERIFIED by exhaustive grep: `SqliteJobQueueRepository`, `JobWorker`,
`JobQueueRepository` and `recoverExpiredLeases` appear **only** in
`tests/platform/shared-coordination.test.ts` and
`tests/platform/postgres-integration.test.ts`. Nothing in `src/app` or
`src/server` enqueues, claims or drains a `background_jobs` row. The migration-17
table is created on every database and stays empty.

**Implication for a future agent:** do not "reuse the existing queue" without
first deciding whether you are migrating the two live runners onto it. Today the
two live runners duplicate — differently and less safely — what `JobWorker`
already implements correctly.

---

## Job 1 — Bulk personalization generation (LIVE)

```text
Job name          personalization job (no queue name; each job is a table row)
Purpose           Expand a template + CSV dataset into an NDJSON stream of
                  per-row design variants.
Producer          PersonalizationService.createJob()   ← POST /api/v1/personalization-jobs
                  PersonalizationService.retry()       ← POST …/:jobId/retry
                  PersonalizationService.recover()     ← on container construction
Queue             SQLite table `personalization_jobs` (status column), plus an
                  in-process `Set<string>` of pending ids inside the runner.
Consumer          PersonalizationRunner.run()  src/server/personalization/personalization-runner.ts
Payload           { jobId } → the runner reloads the job and dataset from storage
Trigger           runner.schedule(jobId) → queueMicrotask(() => drain())
Scheduling        MAX_CONCURRENT_JOBS = 2, process-local. FIFO over a Set.
Retry             max_attempts = 3 (hardcoded in createJob). Retry is MANUAL —
                  the customer calls /retry. There is no automatic retry and no
                  backoff.
Recovery          getPersonalizationService() calls service.recover() once,
                  fire-and-forget, on first use of the container. It purges
                  expired datasets and calls recoverInterruptedJobs(), which
                  moves every 'running' row to 'queued' (progress reset to 0)
                  unless attempt >= max_attempts, in which case it becomes
                  'failed' with PERSONALIZATION_WORKER_INTERRUPTED.
Failure handling  Any throw: the partial output object is deleted, then
                  finishJob(status='failed', errorCode). Codes matching
                  /^PERSONALIZATION_[A-Z0-9_]+$/ are preserved; everything else
                  becomes PERSONALIZATION_GENERATION_FAILED.
Idempotency       Client Idempotency-Key → UNIQUE index on personalization_jobs.
                  A duplicate key against a different dataset is 409.
Cancellation      Cooperative. The runner re-reads the job row before EVERY row
                  and aborts (deleting the output object) if status became
                  'cancelled'.
DB state          personalization_jobs.status/processed/failed/attempt/
                  output_* /error_code/started_at/completed_at/updated_at
Objects           personalization/jobs/<jobId>.ndjson  (application/x-ndjson)
Limits            output ≤ 64 MiB (MAX_PERSONALIZATION_OUTPUT_BYTES),
                  progress written every 25 rows (PROGRESS_INTERVAL),
                  dataset ≤ 10 000 rows, CSV ≤ 5 MiB
External systems  None.
Files             src/server/personalization/personalization-runner.ts
                  src/server/personalization/personalization-service.ts
                  src/server/personalization/sqlite-personalization-repository.ts
                  src/server/personalization/container.ts
                  src/platform/personalization/{types,repository}.ts
```

**Concurrency hazard (VERIFIED, documented in `KNOWN_RISKS.md`).** `markRunning`
is a guarded compare-and-swap (`WHERE status='queued' AND attempt < max_attempts`),
so two runners cannot both start the same job. But there is **no lease**: if the
process dies mid-run, the row stays `running` until the *next process start*
calls `recover()`. In a single-node deployment that is the same thing; with more
than one instance it is not, which is one reason `scaled` mode fails closed.

---

## Job 2 — GLB product onboarding (LIVE, spawns a subprocess)

```text
Job name          onboarding job
Purpose           Run product-onboarding/onboard.py over an operator-supplied
                  GLB to produce a customizable product asset set.
Producer          OnboardingService.create()  ← POST /api/v1/admin/onboarding/jobs
Queue             SQLite table `onboarding_jobs` + an in-process string array
Consumer          OnboardingRunner.run()  src/server/onboarding/onboarding-runner.ts
Trigger           runner.schedule(jobId) → synchronous drain()
Scheduling        maxConcurrent = 2, process-local, FIFO array
Retry             NONE. A failed onboarding job is terminal; the operator
                  uploads again.
Recovery          NONE. A job left 'running' by a restart stays 'running'
                  forever — there is no recover() equivalent. (KNOWN_RISKS)
Timeout           VORTEX_ONBOARDING_TIMEOUT_MS, default 300 000 ms, clamped to
                  [10 000, 900 000]. On timeout the child is SIGKILLed and the
                  exit code is reported as 124 → ONBOARDING_TIMEOUT.
Subprocess        spawn(python, [onboard.py, <stage>, workDir], {
                    shell: false, windowsHide: true, stdio ignore/pipe/pipe,
                    env: { PATH, NODE_ENV, PYTHONHASHSEED:"0",
                           PYTHONDONTWRITEBYTECODE:"1" } })
                  Python binary: VORTEX_ONBOARDING_PYTHON, else
                  product-onboarding/.venv/bin/python
Stages            inspect → (build → validate) when a manifest was supplied.
                  Inspection-only runs PASS after `inspect`.
Output whitelist  outputDescriptor() accepts ONLY: inspection.json,
                  product-customizable.glb, product.json, regions.json,
                  diagnostic-<safe>.png, uv-template-<safe>.{png,svg}
Size limits       MAX_PROCESS_OUTPUT_BYTES 256 KiB (stdout/stderr, control chars
                  stripped by safeLog), MAX_OUTPUT_ASSET_BYTES 64 MiB per file,
                  MAX_TOTAL_OUTPUT_BYTES 160 MiB per job
Integrity         Input GLB and manifest bytes are re-hashed and compared to the
                  stored sha256 before being written into the work directory.
Workdir           <VORTEX_DATA_DIR>/onboarding-work/<jobId>, mode 0700, created
                  with recursive:false so a colliding id fails rather than
                  reusing a directory. Always rm -rf'd in `finally`.
DB state          onboarding_jobs.status/started_at/completed_at/report_asset_id
                  /error_code/stdout_text/stderr_text; onboarding_assets rows
External systems  The local Python 3.13 interpreter and its packages
                  (trimesh, numpy, pillow, pygltflib, scipy, networkx).
Files             src/server/onboarding/onboarding-runner.ts
                  src/server/onboarding/onboarding-service.ts
                  src/server/onboarding/sqlite-onboarding-job-repository.ts
                  product-onboarding/onboard.py
```

---

## Job 3 — The durable queue that nothing uses (DORMANT)

```text
Contract          src/platform/jobs/types.ts   JobQueueRepository, BackgroundJob
Worker            src/platform/jobs/worker.ts  JobWorker.runOnce()/drain()/heartbeat()
Adapters          src/server/jobs/sqlite-job-queue-repository.ts
                  src/server/persistence/postgres/postgres-job-queue-repository.ts
Table             background_jobs  (migration 17)
Statuses          queued → running → succeeded | failed | abandoned
Claim             One transaction: SELECT the oldest runnable row for the queue,
                  then UPDATE … WHERE id=? AND status='queued'. Zero changes ⇒
                  another worker won; return null.
Lease             leaseMs default DEFAULT_LEASE_MS = 30 000. lease_owner is part
                  of the predicate of every subsequent UPDATE, so a stalled
                  worker that wakes late cannot overwrite the recovered run.
Heartbeat         heartbeat(jobId, workerId, expiry) → false when the lease was
                  already lost.
Backoff           defaultBackoff(attempts) = min(60 000, 1000 * 2^(attempts-1))
Attempts          DEFAULT_MAX_ATTEMPTS = 3 (enqueue default)
Recovery          recoverExpiredLeases(now, nowIso) in one transaction:
                    attempts >= max_attempts → 'abandoned'
                    otherwise                → 'queued', run_after = now
                  Returns { requeued, abandoned }.
Idempotency       UNIQUE(queue, idempotency_key). enqueue() returns
                  { job, created:false } for a duplicate, and re-reads on a
                  unique-violation race rather than throwing.
Dead letter       'abandoned' is the terminal poison state. There is no separate
                  dead-letter queue and no alerting.
Scheduling loop   NONE EXISTS. drain() must be called by something; nothing
                  calls it outside tests.
Tests             tests/platform/shared-coordination.test.ts (SQLite)
                  tests/platform/postgres-integration.test.ts (real PostgreSQL,
                  skipped unless VORTEX_POSTGRES_TEST_URL is set)
```

---

## Other asynchronous behaviour that is easy to miss

| Behaviour | Where | Notes |
|---|---|---|
| **Catalogue self-seeding** | `ProductCatalogService.ensureSynchronized()`, `TemplateCatalogService` equivalent | A single memoised promise. The first catalogue read of a process publishes every code-defined product/template version into the database. A failure clears the memo so the next call retries. |
| **Personalization recovery** | `getPersonalizationService()` | `void service.recover().catch(log)` — a floating promise at container construction. Errors are logged as `personalization.recovery-failed` and otherwise ignored. |
| **Expired-dataset purge** | `PersonalizationService.purgeExpired()` | Called opportunistically at the head of `createDataset`, `listDatasets`, `createJob`, `listJobs`, `getJob`, `readOutput`. There is **no** cron or timer. A quiet system never purges. |
| **Rate-limit window sweep** | `RateLimitStore.sweep()` | Implemented for both stores; **never called** in `src/**`. `rate_limit_windows` grows without bound. |
| **Preview generation** | `useProjectSession.schedulePreview()` | Client-side `setTimeout` 1 500 ms after a save. Failures are deliberately swallowed. |
| **Autosave debounce** | `useProjectSession` | `AUTOSAVE_DELAY_MS = 700`. A save that lands while another is in flight is re-queued by sequence number. |
| **Embroidery stitch worker** | `src/lib/embroidery/worker-client.ts` + `stitch.worker.ts` | A browser Web Worker, one per session, lazily started, with a main-thread fallback when `OffscreenCanvas`/`Worker` is unavailable. Superseded requests settle and are dropped by signature. Not a server job. |
| **Client job polling** | `src/components/templates/BulkPersonalizationPanel.tsx:84` (1 000 ms), `src/components/admin/OnboardingPanel.tsx:32` (1 500 ms) | `window.setInterval` inside a `useEffect`, started only while the job status is `queued`/`running` and cleared on unmount. These are the only progress mechanism — there is no SSE, WebSocket or push. |

## Timezones and clocks

Every runner and service takes an injectable `clock: () => string` defaulting to
`() => new Date().toISOString()`. All persisted timestamps are UTC ISO-8601.
Lease and rate-limit arithmetic uses epoch milliseconds (`Date.now()`).
There is no local-time handling anywhere, and no business hours logic.
