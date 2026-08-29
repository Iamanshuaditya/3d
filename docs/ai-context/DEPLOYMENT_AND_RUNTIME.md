# Deployment and Runtime

## The supported target — one shape, deliberately

```text
                 HTTPS terminator / reverse proxy  (required, not provided here)
                                  │
                                  ▼
                 ┌──────────────────────────────────┐
                 │  ONE Node 24 process             │
                 │  node .next/standalone/server.js │
                 │  PORT 3000, HOSTNAME 0.0.0.0     │
                 └───────────────┬──────────────────┘
                                 │
        ┌────────────────────────┼──────────────────────────┐
        ▼                        ▼                          ▼
  /data/vortex.sqlite      /data/objects            /data/onboarding-work
  (WAL, foreign_keys ON)   (or S3/R2 instead)       (transient, 0700)
```

- **One process.** Not horizontally scaled.
  `VORTEX_DEPLOYMENT_MODE=scaled` refuses to start.
- **SQLite only.** `VORTEX_DATABASE=postgresql` refuses to start.
- **One persistent volume** holds the database and, by default, every uploaded
  byte. Without a real volume, every customer design is lost on restart — the
  `Dockerfile` declares `VOLUME ["/data"]` and the startup gate requires
  `VORTEX_DATA_DIR` in production with filesystem storage for exactly this reason.
- **HTTPS in front is mandatory.** `VORTEX_AUTH_URL` must be an `https://` origin
  in production; sessions and partitioned embed cookies both require TLS.

Reference documents: `docs/platform/DEPLOYMENT.md` (168 lines, authoritative),
`README.md` "What is and is not certified".

---

## Build

```bash
npm ci
npm run build              # next build, output: "standalone"
npm run build:standalone   # scripts/package-standalone.mjs
npm start                  # node .next/standalone/server.js
```

`next build` with `output: "standalone"` emits a server plus only its actual
dependency closure, but **deliberately does not copy `.next/static` or
`public`**. Without `build:standalone` the server starts, serves HTML and 404s
every script — a failure that reads like an application bug. That is the entire
reason `scripts/package-standalone.mjs` exists; it copies both directories into
`.next/standalone/` and honours `NEXT_DIST_DIR`.

`next.config.ts`:
```ts
output: "standalone"
serverExternalPackages: ["better-sqlite3", "sharp"]   // native, must not be bundled
distDir: process.env.NEXT_DIST_DIR   // when set
```

`next build` requires network access — `next/font/google` downloads Geist and
Geist Mono to self-host them.

---

## Container

`Dockerfile`, three stages:

| Stage | Base | Does |
|---|---|---|
| `deps` | `node:24-bookworm-slim` | installs `python3 make g++ ca-certificates`, then `npm ci` (better-sqlite3 compiles from source when no prebuild matches) |
| `build` | `node:24-bookworm-slim` | `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`, `npm run build`. The comment notes the build runs before secrets exist, so it must not trip the startup gate. |
| `runtime` | `node:24-bookworm-slim` | `ca-certificates curl`; a non-root `vortex` user (uid 1001); `/data` owned by it; copies `.next/standalone`, `.next/static`, `public`; `VOLUME ["/data"]`; `CMD ["node","server.js"]` |

```text
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
```

Liveness only, by design: readiness (`/api/ready`) is the *orchestrator's* traffic
gate, so a database blip drains the instance instead of restarting it.

**Note (see `KNOWN_RISKS.md`):** the runtime stage installs no Python and copies
no `product-onboarding/` directory. The Dockerfile does **not** run
`npm run build:standalone` either — it copies `.next/static` and `public`
manually, which is equivalent.

`docker-compose.yml` is the reference single-node deployment: one service, a
named `vortex-data` volume mounted at `/data`, `restart: unless-stopped`, and
`${VAR:?message}` guards that refuse to start without `VORTEX_AUTH_SECRET`,
`VORTEX_GUEST_COOKIE_SECRET` and `VORTEX_AUTH_URL`.

---

## Startup sequence

```text
1. Node loads .next/standalone/server.js
2. Next.js runs instrumentation.register()   [NEXT_RUNTIME === "nodejs" only]
     validateDeploymentConfig(process.env)
       ok    → console.info {"event":"deployment.configured", mode, database,
                             objectStore, production}
       throw → console.error {"event":"deployment.misconfigured", problems:[…]}
               + the human-readable message, then rethrow → the process refuses
                 to accept requests
3. First request touching the database:
     getVortexDatabase()
       configuredPersistenceBackend()   throws unless VORTEX_DATABASE=sqlite
       open the file, mkdir -p its directory
       pragma foreign_keys=ON, busy_timeout=5000, journal_mode=WAL
       migrate() — applies any of migrations 1..17 not yet recorded
4. First catalogue read:
     ProductCatalogService.ensureSynchronized() publishes every code-defined
     product version; TemplateCatalogService does the same for templates.
5. First personalization container use:
     PersonalizationService.recover() — purge expired datasets, requeue
     interrupted jobs. Fire and forget.
```

Everything else is lazy: `container.ts` singletons are created on first call.

---

## Probes

| Endpoint | Semantics | Checks |
|---|---|---|
| `GET /api/health` | Liveness | The process only. Always 200 if Node is alive. |
| `GET /api/ready` | Readiness | `configuration` (re-runs the startup gate), `database` (`SELECT 1`), `object-store` (`get()` on a random key). 200 `ready` / 503 `not-ready`, per-check `detail`. |

Wire the orchestrator's *liveness* probe to `/api/health` and its *readiness*
probe to `/api/ready`. Swapping them turns a transient dependency failure into a
crash loop.

---

## Runtime characteristics an operator should know

| Property | Value |
|---|---|
| Node | `>=24` (`package.json` engines, `.nvmrc`) |
| Process model | Single process, single thread. `better-sqlite3` is **synchronous**, so every query blocks the event loop. |
| Concurrency ceilings | Personalization: 2 jobs. Onboarding: 2 subprocesses. Both process-local. |
| CPU hot spots | `sharp` rasterisation at `renderPpi` 300 (up to 100 MP per surface), PDF assembly, and the structural engine's boundary comparison. |
| Memory | Whole objects are buffered; ceilings are 64 MiB (personalization output, onboarding GLB) and 20 MiB (artwork). |
| Graceful shutdown | **None implemented.** No `SIGTERM` handler, no in-flight drain, no `database.close()`. A rolling restart can interrupt a personalization job (recoverable) or an onboarding job (not recoverable). |
| Logging | Single-line JSON to stdout/stderr, `{"scope":"vortex-platform","event":…}`. No levels, no correlation ids, no sampling, no external sink. |
| Metrics | None. No Prometheus endpoint, no OpenTelemetry, no APM. |
| Error tracking | None. |
| Scheduler | None. No cron, no `setInterval` on the server. Every "periodic" task is opportunistic. |
| Secrets at rest | Read from the environment. In development only, missing secrets are auto-generated into `<VORTEX_DATA_DIR>/{auth-secret,guest-cookie-secret}` with mode 0600 and `flag: "wx"`. |

---

## Backup and recovery

Not automated anywhere in this repository. What must be backed up together, and
consistently:

1. `<VORTEX_DATA_DIR>/vortex.sqlite` **plus its WAL and shm sidecars** (or a
   `.backup`/`VACUUM INTO` snapshot — copying the main file alone under WAL can
   capture a torn state).
2. `<VORTEX_DATA_DIR>/objects/**` when using filesystem storage, or the S3/R2
   bucket otherwise.
3. `<VORTEX_DATA_DIR>/auth-secret` and `guest-cookie-secret` **if** they were
   auto-generated in a non-production deployment. Losing them invalidates every
   session and every guest identity.

Restoring the database without its objects (or vice versa) produces rows whose
integrity checks fail — every `/content` route re-verifies bytes against the
stored sha256 and will return a hard error rather than serve a mismatch.

---

## CI/CD

There is **no deployment automation** — no publish step, no registry push, no
environment promotion. Both workflows are verification only.

- `.github/workflows/ci.yml` — `quality` (lint, typecheck, tests with a real
  `postgres:17` service, onboarding manifest validation, build) and `deployment`
  (build the shipping artifact, start it, smoke test it with Playwright).
- `.github/workflows/structural-quality.yml` — lint, typecheck, test, build,
  with concurrency cancellation.

`quality-report.json` records that both workflows must be observed green on the
same SHA before the quality record may change, and
`tests/platform/quality-record-consistency.test.ts` fails the build if
`quality-report.json`, `QUALITY_STATE.md` and `quality-run-log.md` disagree.
Branch protection expectations are described in
`docs/platform/BRANCH-PROTECTION.md`.

---

## Scaling: what actually blocks it

Stated by the code itself in `src/server/config/environment.ts` and
`src/server/persistence/backend.ts`:

```text
Done       target PostgreSQL schema (docs/platform/postgresql/schema.sql)
           pooled connections with bounded timeouts and transactions
           shared rate-limit store (PostgresRateLimitStore)
           distributed job queue (PostgresJobQueueRepository), lease-recovered

Not done   12 domain repositories: project, product, product-draft, template,
           template-draft, template-asset, pricing, production-artifact,
           production-font, onboarding, personalization, operator-grant
           the Better Auth adapter (SQLite-only today)
           object storage must move to S3/R2 (already supported)
           the two live runners must move onto JobWorker
```

Until those land, a second instance would silently diverge — separate SQLite
files, separate in-process runners — which is why `scaled` fails closed rather
than degrading.

---

## Cloudflare Workers: present, and explicitly not a path

`@opennextjs/cloudflare`, `wrangler`, `open-next.config.ts`, `wrangler.jsonc`,
`.dev.vars` and the `experimental:cloudflare-*` scripts all exist.
`README.md` and `docs/platform/DEPLOYMENT.md` state the conclusion plainly:
`better-sqlite3` and `sharp` are native modules that cannot execute on Workers at
any bundle size. The 13.69 MiB build is a symptom, not the cause; a larger plan
limit would not make it run. A viable Workers target would need D1 or Hyperdrive
instead of SQLite and image work moved off the Worker.

---

## Local development

```bash
npm ci
python -m pip install -r product-onboarding/requirements.txt   # only for onboarding
npm run dev          # http://localhost:3000

# Development conveniences (never available in production):
#   secrets auto-generated into .data/
#   pricing enabled by default
#   /studio/golden-reference works when VORTEX_GOLDEN_REFERENCE_PDF points at
#   the authorized local file (checksum-locked in fixtures/)
```

`npm run check` = `lint && typecheck && test && build`. Run it before proposing
any change.
