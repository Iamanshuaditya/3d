# Known Risks

Findings from reading the repository at commit `616e26f`. **Nothing here has
been changed.** Each entry is grounded in a file the reader can open.

Several of these are already acknowledged by the project (`README.md`
"Known limitations", `quality-report.json` `blockingEvidence`,
`docs/platform/POSTGRESQL.md`). Those are marked *acknowledged* and are included
because a future agent needs them in one place, not because they are news.

---

## Per-owner rate limits are bypassable by discarding the cookie

**Severity:** High
**Confidence:** Verified
**Area:** HTTP / abuse control

**Evidence.** `withOwner()` calls `resolveOwnerContext()` first, which issues a
**brand-new** guest identity when no valid `vortex_guest` cookie is present
(`src/server/auth/owner-context.ts:174`). Only afterwards does the handler call
`assertRateLimit(bucket, owner, policy)`, and the key is
`` `${bucket}:${owner.type}:${owner.id}` `` (`src/server/http/rate-limit.ts:33`).
There is no IP-based, network-based or global limiter anywhere in the codebase.

**Why it matters.** Every rate limit in the system — including
`production-generation` (10/min), `asset-upload` (20/min) and
`personalization-job` (20/min) — is scoped to an identity the caller can mint for
free by simply not sending a cookie. Those buckets guard the most expensive
operations in the app: `sharp` rasterisation at 300 PPI, PDF generation, and
`personalization` runs of up to 10 000 rows.

**Potential failure scenario.** A script issues cookieless
`POST /api/v1/projects` requests in a loop. Each one creates a new guest, a new
project row and a new `project_revisions` row, and never hits a limit. Storage
and CPU grow without bound; nothing throttles or alerts.

**Relevant files.** `src/server/http/api.ts:57` (`withOwner`),
`src/server/auth/owner-context.ts:174`, `src/server/http/rate-limit.ts`,
every route listed under "Rate limits" in `BUSINESS_RULES.md`.

**Suggested investigation.** Decide whether an unauthenticated, cookieless
request should be limited on a network key (`x-forwarded-for`) in addition to the
owner key, and whether project creation should require an established session
cookie rather than issuing one inline.

---

## `rate_limit_windows` grows without bound

**Severity:** Medium
**Confidence:** Verified
**Area:** Persistence / operations

**Evidence.** `RateLimitStore.sweep()` is implemented by both
`InMemoryRateLimitStore` and `SqliteRateLimitStore`
(`src/server/http/rate-limit-stores.ts`) and the table has
`rate_limit_windows_expiry_idx` on `expires_at`. Grep across `src/**` finds
**zero** callers; the only calls are in
`tests/platform/shared-coordination.test.ts:89,92`.

**Why it matters.** One row is written per `(bucket_key, window_started_at)`.
With a fresh guest per cookieless request (see the finding above), the row count
grows roughly with request volume and is never reclaimed. The SQLite file is on
the same volume as customer uploads.

**Potential failure scenario.** A long-running single-node deployment
accumulates millions of dead window rows; the volume fills, and the first
symptom is a failed artwork upload rather than an obvious database problem.

**Relevant files.** `src/server/http/rate-limit-stores.ts`,
`src/server/http/rate-limit.ts`, `src/server/persistence/database.ts` (migration 17).

**Suggested investigation.** Where should the sweep be driven from, given there
is no scheduler? Options include an opportunistic sweep on a sampled fraction of
`consume()` calls, or a `setInterval` owned by the container.

---

## A durable job queue is implemented but wired to nothing

**Severity:** Medium
**Confidence:** Verified
**Area:** Background processing / dead code with live-looking surface

**Evidence.** `background_jobs` (migration 17), `JobQueueRepository`,
`JobWorker`, `SqliteJobQueueRepository` and `PostgresJobQueueRepository` are
complete, leased, idempotent and backoff-aware. Grep shows their only consumers
are `tests/platform/shared-coordination.test.ts` and
`tests/platform/postgres-integration.test.ts`. The two runners that actually run
work (`PersonalizationRunner`, `OnboardingRunner`) each implement their own
in-process scheduler instead.

**Why it matters.** An agent reading the repository will reasonably conclude
there is a durable queue and reuse it, or will "fix" the runners by pointing them
at it without realising nothing drains the queue. Conversely, an agent may add a
new async feature on the runner pattern and inherit its weaknesses (no lease, no
backoff, no dead-letter state).

**Potential failure scenario.** A new feature enqueues into `background_jobs`.
No worker loop exists, so the jobs sit at `queued` forever and the feature
silently never runs.

**Relevant files.** `src/platform/jobs/worker.ts`,
`src/platform/jobs/types.ts`, `src/server/jobs/sqlite-job-queue-repository.ts`,
`src/server/personalization/personalization-runner.ts`,
`src/server/onboarding/onboarding-runner.ts`.

**Suggested investigation.** Is the intended direction to migrate both runners
onto `JobWorker` (which would also unblock scaled mode), or to delete the queue?
The current state is the worst of both.

---

## Onboarding jobs are never recovered after a restart

**Severity:** Medium
**Confidence:** Verified
**Area:** Background processing

**Evidence.** `PersonalizationService.recover()` is invoked from
`getPersonalizationService()` and calls `recoverInterruptedJobs()`, which
requeues `running` rows. `getOnboardingService()`
(`src/server/onboarding/container.ts`) has **no equivalent**, and
`SqliteOnboardingJobRepository` exposes no recovery method.

**Why it matters.** An onboarding run can legitimately take up to 15 minutes
(`VORTEX_ONBOARDING_TIMEOUT_MS` clamp). A deploy or crash during that window
leaves the row `running` permanently, with no timeout, no retry and no operator
action that resets it.

**Potential failure scenario.** An operator uploads a GLB, the app is redeployed
two minutes later, and the job shows "running" in the admin console forever.
The `onboarding-work/<jobId>` directory also leaks on disk because the
`finally` block never executes.

**Relevant files.** `src/server/onboarding/container.ts`,
`src/server/onboarding/onboarding-runner.ts`,
`src/server/onboarding/sqlite-onboarding-job-repository.ts`.

---

## The reference container cannot run onboarding at all

**Severity:** Medium
**Confidence:** Verified
**Area:** Deployment

**Evidence.** The `Dockerfile` runtime stage installs only `ca-certificates` and
`curl`, and copies only `.next/standalone`, `.next/static` and `public`. Neither
a Python interpreter nor the `product-onboarding/` directory reaches the image.
`OnboardingRunner` resolves `onboardingRoot = join(process.cwd(),
"product-onboarding")` and defaults the interpreter to
`product-onboarding/.venv/bin/python`.

**Why it matters.** `POST /api/v1/admin/onboarding/jobs` accepts the upload and
returns 202, then the job fails with `ONBOARDING_EXECUTION_FAILED` because
`spawn` cannot find the binary. The API contract implies the feature works.

**Potential failure scenario.** A production operator uploads a 60 MB GLB and
gets a generic failure with no indication that the deployment simply lacks the
toolchain.

**Relevant files.** `Dockerfile`, `docker-compose.yml`,
`src/server/onboarding/container.ts`, `src/server/onboarding/onboarding-runner.ts`.

**Suggested investigation.** Either install Python 3.13 plus
`product-onboarding/requirements.txt` in the runtime stage and copy the
directory, or make the service report a clear `ONBOARDING_UNAVAILABLE` at job
creation when the interpreter or script is absent.

---

## `/api/ready` discloses configuration detail to anonymous callers

**Severity:** Medium
**Confidence:** Verified
**Area:** Information disclosure

**Evidence.** `src/app/api/ready/route.ts` returns, per check, the caught
`error.message`. For the `configuration` check that message is
`DeploymentConfigError.message`, which enumerates **every** misconfigured
variable by name with an explanatory `detail`. The database and object-store
checks similarly surface raw driver/filesystem error text. The route has no
authentication.

**Why it matters.** An unauthenticated caller can learn which storage backend is
configured, which variables are missing or malformed, and often the shape of the
underlying error.

**Potential failure scenario.** A partially misconfigured deployment publishes,
to anyone who curls `/api/ready`, that (for example) `VORTEX_S3_BUCKET` is unset
and the object store is unreachable.

**Relevant files.** `src/app/api/ready/route.ts`,
`src/server/config/environment.ts` (`DeploymentConfigError`).

**Suggested investigation.** Return per-check booleans publicly and keep the
`detail` strings behind an operator check or a private port.

---

## Forwarded host and protocol headers are trusted unconditionally

**Severity:** Medium
**Confidence:** Likely
**Area:** CSRF / transport

**Evidence.** `assertSameOriginMutation()` builds its allowed-origin set from
`request.headers.get("x-forwarded-host")` and
`request.headers.get("x-forwarded-proto")`
(`src/server/http/api.ts:16-31`). `isSecureRequest()` derives HSTS emission and
the `SameSite=None; Secure; Partitioned` cookie decision from
`x-forwarded-proto` alone (`src/server/http/request-security.ts`).

**Why it matters.** Both headers are client-controllable unless the reverse proxy
overwrites them. A deployment whose proxy merely *appends* forwarded headers, or
which is reached directly, lets a caller add an arbitrary origin to the allowed
set and defeat the same-origin mutation check.

**Potential failure scenario.** The app is exposed directly (the Dockerfile
binds `0.0.0.0:3000`) behind a misconfigured load balancer. A cross-site request
carrying `Origin: https://evil.example` and
`X-Forwarded-Host: evil.example` passes `assertSameOriginMutation`.

**Relevant files.** `src/server/http/api.ts`,
`src/server/http/request-security.ts`, `Dockerfile`, `docker-compose.yml`.

**Suggested investigation.** Decide whether to trust forwarding headers only
when an explicit `VORTEX_TRUSTED_PROXY` setting is present, and document the
proxy requirement in `docs/platform/DEPLOYMENT.md`.

---

## Guest claiming does not transfer price quotes

**Severity:** Low
**Confidence:** Verified
**Area:** Data ownership consistency

**Evidence.** `claimAll()` rewrites the owner columns of `design_projects`,
`personalization_datasets` and `personalization_jobs`
(`src/server/persistence/sqlite-project-repository.ts:368-411`). `price_quotes`
also has `owner_type`/`owner_id` and is **not** included.

**Why it matters.** After signing in, a customer's projects follow them but the
quotes they generated as a guest become permanently unreachable — the guest
cookie is cleared in the same response, so no future request will ever present
that owner again.

**Potential failure scenario.** A customer configures a product, gets a quote,
signs in to save the design, and the quote 404s.

**Relevant files.** `src/server/persistence/sqlite-project-repository.ts`,
`src/server/pricing/sqlite-price-quote-repository.ts`,
`src/app/api/v1/session/claim/route.ts`.

---

## `PersonalizationRunner` re-reads the job row once per output row

**Severity:** Low
**Confidence:** Verified
**Area:** Performance

**Evidence.** Inside the variant loop,
`const current = await this.repository.findJobInternal(job.id)` runs before every
row (`src/server/personalization/personalization-runner.ts`). Datasets may hold
up to 10 000 rows.

**Why it matters.** A maximum-size job issues 10 000 extra synchronous SQLite
queries on top of the 400 progress writes. `better-sqlite3` is synchronous, so
each one blocks the single Node thread that is also serving HTTP.

**Potential failure scenario.** Two concurrent 10 000-row jobs (the runner's
`MAX_CONCURRENT_JOBS` is exactly 2) noticeably degrade request latency for every
other user on the instance.

**Suggested investigation.** Poll for cancellation every `PROGRESS_INTERVAL`
rows instead of every row — the cancellation contract is already cooperative and
best-effort.

---

## Whole objects are read into memory on every access

**Severity:** Low
**Confidence:** Verified
**Area:** Memory / scalability

**Evidence.** `ObjectStore.get()` returns `{bytes: Uint8Array}`
(`src/platform/storage/object-store.ts`); both implementations buffer the entire
object. `FilesystemObjectStore.copy()` reads then writes the full buffer. Route
handlers then call `Buffer.from(...)` or `.slice()`, copying again. Ceilings
are 64 MiB (personalization output, onboarding GLB) and 20 MiB (artwork).

**Why it matters.** A handful of concurrent 64 MiB downloads can hold several
hundred megabytes of copies. There is no streaming path.

**Relevant files.** `src/platform/storage/object-store.ts`,
`src/server/storage/{filesystem,s3}-object-store.ts`, every `/content` route.

---

## No S3 timeout or retry

**Severity:** Low
**Confidence:** Verified
**Area:** External dependency resilience

**Evidence.** `S3ObjectStore.request()` calls `this.fetcher(url, …)` with no
`AbortSignal` and no retry (`src/server/storage/s3-object-store.ts`).

**Why it matters.** A hung object store hangs the request indefinitely; Node's
default `fetch` has no timeout. `/api/ready` performs an object-store `get()`,
so a hung store also hangs the readiness probe rather than failing it.

---

## `duplicate()` can leave an archived project with dangling asset rows

**Severity:** Low
**Confidence:** Verified
**Area:** Data consistency

**Evidence.** `ProjectService.duplicate()` copies every artwork object, creates
the destination project, then inserts asset rows in a loop. Its `catch` archives
the destination and deletes **all** copied storage keys — including those whose
`project_assets` row was already committed
(`src/server/projects/project-service.ts`).

**Why it matters.** The archived duplicate holds asset rows whose bytes no longer
exist. Impact is contained because the project is archived and unreachable for
editing, but a future "restore archived project" feature would surface it.

---

## Uploaded artwork is never reclaimed

**Severity:** Low
**Confidence:** Verified
**Area:** Storage growth

**Evidence.** `project_assets` of kind `artwork` are only ever inserted. Archiving
a project does not delete them (`archive()` sets a status). Only superseded
`preview` assets are deleted, in `generatePreview()`. There is no per-project
asset count or byte quota — only the 20/min upload rate limit.

---

## `.env.example` documents a variable the code does not read

**Severity:** Low
**Confidence:** Verified
**Area:** Configuration

**Evidence.** `.env.example` contains `VORTEX_DATABASE_URL=`. Grep across `src`,
`scripts`, `tests` and `docs` finds no reference. The PostgreSQL layer reads
`VORTEX_POSTGRES_URL` (`src/server/persistence/postgres/connection.ts:20`).

**Why it matters.** Anyone following the example when the PostgreSQL port lands
will set a variable that is silently ignored, and `postgresSettings()` will throw
"VORTEX_POSTGRES_URL is required".

---

## The `/test` research prototype ships in production

**Severity:** Low
**Confidence:** Verified
**Area:** Surface area

**Evidence.** `src/app/test/page.tsx` renders `PacdoraLab` with no environment
guard, unlike `/studio/golden-reference`, which refuses when
`NODE_ENV=production` (`golden-preview.ts:77`).

**Why it matters.** It is an unfinished research surface (`src/lib/pacdora-lab`,
`src/components/pacdora-lab`) publicly reachable on any deployment, and it is
indexable.

---

## No admin route is rate limited

**Severity:** Low
**Confidence:** Verified
**Area:** Abuse control

**Evidence.** All 13 `assertRateLimit` call sites are customer routes. No file
under `src/app/api/v1/admin/**` calls it — including
`POST /api/v1/admin/onboarding/jobs` (64 MiB uploads that spawn subprocesses),
`POST /api/v1/admin/template-assets` and `POST /api/v1/admin/production-fonts`.

**Mitigation in place.** Every admin route requires an authenticated operator
grant, so the blast radius is limited to trusted accounts.

---

## Operator grants have no management surface

**Severity:** Low
**Confidence:** Verified
**Area:** Operations

**Evidence.** `operator_grants` is only ever **read**
(`SqliteOperatorGrantRepository.listPermissions`). No route, service or script
inserts a row. The only way to grant operator access is
`VORTEX_BOOTSTRAP_OPERATOR_USER_IDS`, which is captured once at service
construction and needs a restart to change.

---

## Admin domain errors map to HTTP status by substring

**Severity:** Low
**Confidence:** Verified
**Area:** API contract

**Evidence.** `adminDomainStatus()` in `src/server/http/api.ts` matches on the
error code containing `NOT_FOUND`, `CONFLICT`, `STALE`, `IMMUTABLE`, `EXISTS`,
`ALREADY_PUBLISHED` or `FORBIDDEN`, and otherwise returns 400.

**Why it matters.** A new domain error code silently gets 400 unless its name
happens to contain one of those tokens. Naming is load-bearing.

---

## 429 responses carry no `Retry-After` header

**Severity:** Low
**Confidence:** Verified
**Area:** API contract

**Evidence.** `assertRateLimit` throws `PlatformError("RATE_LIMITED", …, 429,
{retryAfterSeconds})`. Grep finds no `Retry-After` header anywhere. Standard HTTP
clients and proxies cannot back off correctly.

---

## No content CSP on application pages

**Severity:** Low
**Confidence:** Verified
**Area:** XSS defence in depth

**Evidence.** `src/proxy.ts` sets only `frame-ancestors`. There is no
`default-src` / `script-src` / `style-src` policy. React escaping is the sole
defence. `dangerouslySetInnerHTML` appears exactly once, at
`src/app/studio/golden-reference/capture/page.tsx:95`, injecting SVG that the
structural engine generated from the local reference PDF on a route that is
disabled in production — so this is defence in depth rather than an active hole.

---

## `setAuthenticationProvider` is exported from production code

**Severity:** Low
**Confidence:** Verified
**Area:** Test seam exposed at runtime

**Evidence.** `src/server/auth/owner-context.ts` exports
`setAuthenticationProvider()` / `resetAuthenticationProvider()` which mutate a
module-level variable, with no `NODE_ENV` guard. The same pattern exists for
`setRateLimitStore()` and `setEmbedClientRegistry()`.

**Why it matters.** Any server module that imports and calls it replaces
authentication process-wide. Today only tests do. It is a footgun, not a
vulnerability.

---

## `next.config.ts` fires an unawaited import at module scope

**Severity:** Low
**Confidence:** Verified
**Area:** Build/runtime hygiene

**Evidence.** The last line of `next.config.ts` is
`import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());`
— a floating promise with no `.catch`, executed every time the config module
loads, on a deployment target the project documents as unsupported.

---

## Acknowledged limitations (already documented by the project)

These are recorded here so a future agent does not rediscover them as findings.

| Limitation | Severity | Where acknowledged |
|---|---|---|
| PostgreSQL is a foundation only: 12 domain repositories and the Better Auth adapter are unported, so `VORTEX_DATABASE=postgresql` fails closed | High for scale | `README.md`, `docs/platform/POSTGRESQL.md`, `src/server/persistence/backend.ts` |
| `VORTEX_DEPLOYMENT_MODE=scaled` fails closed; SQLite on a local volume cannot be shared | High for scale | `src/server/config/environment.ts` |
| Cloudflare Workers is impossible (`better-sqlite3`, `sharp` are native) yet the config and scripts remain | Medium | `README.md`, `docs/platform/DEPLOYMENT.md` |
| Manufacturing construction is **not certified**; hidden lock-bottom diagonals, glue and tuck destinations and board caliper need converter evidence | High for correctness claims | `quality-report.json` `blockingEvidence`, gate G9 |
| Embroidery is a visual simulation; machine output is deliberately unsupported and blocked at preflight | Medium | `README.md`, `preflight.ts` |
| Pricing is a development estimate, disabled in production by default | Medium | `README.md`, `src/server/pricing/container.ts` |
| Arbitrary dielines and GLBs are not promised to fold automatically | Medium | `README.md`, `AGENTS.md` |
| The `cancelled` status on `onboarding_jobs` has no code path | Low | this document; `src/platform/onboarding/types.ts` |
