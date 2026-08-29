# Testing Map

## Framework and execution

| Aspect | Value |
|---|---|
| Runner | **`node:test`** via `tsx` — `npm test` runs `tsx --test "tests/**/*.test.ts"` |
| Assertions | `node:assert/strict` |
| Style | Flat top-level `test("…", …)` calls. No `describe` blocks, no BDD wrapper. |
| Mocking | **No mocking library.** Isolation is achieved with constructor injection and three exported test seams. |
| Result at `616e26f` | **484 tests, 475 pass, 0 fail, 9 skipped**, ~10.2 s (measured locally on this commit) |
| The 9 skipped | `tests/platform/postgres-integration.test.ts` — `const describe = TEST_URL ? test : test.skip;`. They run only when `VORTEX_POSTGRES_TEST_URL` is set. CI sets it against a `postgres:17` service container. |
| Coverage tooling | **None.** No `c8`, no `--experimental-test-coverage`, no threshold. |
| Browser/E2E | **No Playwright test suite.** `playwright` is a devDependency used only by `scripts/smoke-deployment.mjs`, `scripts/capture-*.ts` and the `product-onboarding/harness/*.mjs` capture scripts. |

## How isolation is achieved without mocks

```text
In-memory database   openVortexDatabase(":memory:")  — full migration chain runs
                     (skips WAL); used by nearly every platform test
Injected clock       every service takes  clock: () => string  (default now)
Injected ids         every service takes  generateId: () => string
Auth seam            setAuthenticationProvider(provider) / resetAuthenticationProvider()
                     src/server/auth/owner-context.ts
Rate-limit seam      setRateLimitStore(store | null)
                     src/server/http/rate-limit.ts
Embed seam           setEmbedClientRegistry(registry | null)
                     src/server/embed/embed-client-registry.ts
Object store         InMemory / temp-directory implementations built in the test
Subprocess           OnboardingCommandExecutor is an interface; tests supply a fake
                     instead of spawning Python
Env                  validateDeploymentConfig(env) is pure and env-injected
```

There are no fixture files for the platform tests — data is constructed inline.
The structural tests use `src/lib/structure/synthetic-carton.ts` to generate
dielines, and `fixtures/**/reference-manifest.json` to describe (never contain)
the private reference sources.

---

## Area → test mapping

### Identity, sessions, security (platform)
| Area | Tests |
|---|---|
| Better Auth wiring, session → owner | `tests/platform/authentication.test.ts` |
| Guest cookie HMAC, verification, attributes, claiming | `tests/platform/guest-identity.test.ts` |
| Same-origin mutation, headers, body limits | `tests/platform/http-security.test.ts` |
| Operator permission lattice, bootstrap ids | `tests/platform/operator-authorization.test.ts` |
| Upload validation (truncated files, animation, orientation, filenames) | `tests/platform/upload-security.test.ts` |

### Persistence and configuration
| Area | Tests |
|---|---|
| Backend selection, fail-closed PostgreSQL | `tests/platform/persistence-backend.test.ts` |
| Deployment config gate (all branches) | `tests/platform/deployment-config.test.ts` |
| Project CRUD, revisions, CAS conflicts, claiming | `tests/platform/project-persistence.test.ts` |
| ObjectStore contract (both implementations) | `tests/platform/object-store-contract.test.ts` |
| Shared rate limiter + durable job queue (SQLite) | `tests/platform/shared-coordination.test.ts` |
| Same, against real PostgreSQL | `tests/platform/postgres-integration.test.ts` *(skipped by default)* |

### Products, templates, pricing
| Area | Tests |
|---|---|
| Option resolution, conditions, units, configurationId | `tests/platform/product-configuration.test.ts` |
| Public product API DTOs and visibility | `tests/platform/product-api.test.ts` |
| Draft → validate → publish lifecycle, audit | `tests/platform/product-publishing.test.ts` |
| Template catalogue, instantiation, artwork copy | `tests/platform/template-system.test.ts` |
| Template draft lifecycle | `tests/platform/template-drafts.test.ts` |
| CSV import, variants, job lifecycle | `tests/platform/bulk-personalization.test.ts`, `tests/platform/personalization-lifecycle.test.ts` |
| Quote idempotency, provider contract, expiry | `tests/platform/pricing.test.ts` |
| Pouch catalogue integrity | `tests/platform/pouch-catalogue.test.ts` |

### Production and provenance
| Area | Tests |
|---|---|
| Preflight gates, artifact immutability, integrity | `tests/platform/production-artifact.test.ts` |
| Font registry | `tests/platform/production-fonts.test.ts` |
| Claim ledger, derivation soundness, refusals | `tests/platform/manufacturing-provenance.test.ts` |
| Guides must not leak into exported artwork | `tests/qa/export-guide-leak.test.ts` |

### Design document
| Area | Tests |
|---|---|
| `parseDesignDocument` bounds, element rules, personalization | `tests/platform/design-validation.test.ts` |

### Embed
| Area | Tests |
|---|---|
| Registry parsing, fail-closed resolution, frame-ancestors | `tests/platform/embed-contract.test.ts` |

### Onboarding
| Area | Tests |
|---|---|
| Job lifecycle with a fake executor, output whitelist, limits | `tests/platform/onboarding-jobs.test.ts` |

### Structural engine (21 suites — the densest coverage in the repo)
| Area | Tests |
|---|---|
| Canonical domain, operations, tolerances | `vector-domain`, `vector-math`, `vector-quality` |
| Importers | `svg-import`, `dxf-import`, `pdf-import`, `pdf-raw-authority` |
| Planar topology, panels, repair profiles | `topology`, `topology-profile`, `structural-tree` |
| Meshes, UV chirality | `structural-mesh`, `structural-chirality` |
| Hinge rig | `structural-rig` |
| Quality and acceptance gates | `structural-quality`, `structural-acceptance`, `structural-runtime-quality` |
| Reviewed authoring | `structural-authoring` |
| Generality beyond the golden carton | `synthetic-carton-generality` |
| Manufacturing routing uses the same geometry | `structural-manufacturing-integration` |
| Diagnostic continuity art | `diagnostic-art` |
| Golden reference lane | `golden-body-tube`, `golden-geometry-roles`, `golden-hinge-roles`, `golden-reference-behavior`, `golden-reference-recreation`, `golden-reviewed-construction`, `golden-visual-score` |

### Unfold / configurator
| Area | Tests |
|---|---|
| Plan derivation and authored steps | `unfold-plan` |
| Reducer and clamping | `unfold-state` |
| Timed motion, interruption safety | `unfold-motion`, `hinge-transition` |
| Flat pose equals the dieline | `flat-dieline` |
| Carton handedness | `carton-chirality` |
| Camera never coupled to fold | `camera-independence` |
| GLB articulation | `glb-articulation` |
| Structural carton end-to-end | `structural-carton-integration` |
| Editor interactions, crop, presentation | `tests/configurator/*` |

### Embroidery
`pipeline-contracts`, `stitch-math`, `worker-pipeline`.

### Repository self-consistency
`tests/platform/quality-record-consistency.test.ts` — fails the build if
`quality-report.json`, `QUALITY_STATE.md` and `quality-run-log.md` disagree.

---

## Uncovered or thinly covered areas (VERIFIED by the absence of a suite)

| Area | Status |
|---|---|
| **HTTP route handlers** | No test imports a file from `src/app/api/**`. Every platform test exercises the service beneath the route. Route-level validation (unknown-field rejection, `Content-Length` checks, status codes, headers) is only covered end-to-end by `scripts/smoke-deployment.mjs`. |
| **React components** | Zero component tests. `src/components/**` and `src/app/**/page.tsx` have no unit coverage. |
| **`useProjectSession` autosave** | The most intricate client logic in the repo — debounce, sequence re-queue, offline handling, `sessionStorage` creation keys — has no test. |
| **`src/proxy.ts` middleware** | Framing decisions are tested at the `resolveEmbedConfig`/`frameAncestors` level (`embed-contract.test.ts`), not through the middleware itself. |
| **`S3ObjectStore` SigV4 signing** | `object-store-contract.test.ts` covers the interface; there is no test asserting a canonical request or signature against a known vector. |
| **PDF/SVG exporter byte output** | `production-artifact.test.ts` covers the service. `scripts/validate-production-pdf.mjs` exists but is not part of `npm test`. |
| **`src/lib/pacdora-lab`** | Only `tests/pacdora-lab/solvers.test.ts`; the UI is untested. |
| **Rate-limit enforcement at the route level** | The store is tested; that a given route applies the right bucket and policy is not. |
| **Guest-claim interaction with price quotes** | Not covered — which is why the gap in `KNOWN_RISKS.md` went unnoticed. |
| **Onboarding recovery after restart** | Not covered, because no recovery exists. |

---

## CI

Two GitHub Actions workflows, both required, both on push and PR to `main`.

### `.github/workflows/ci.yml`

```text
job "quality"    (ubuntu-latest, 25 min, Node 24, Python 3.13)
  service        postgres:17 on 127.0.0.1:55432, pg_isready health check
  env            VORTEX_ONBOARDING_PYTHON=python
  steps          npm ci
                 pip install -r product-onboarding/requirements.txt
                 npm run lint
                 npm run typecheck
                 npm test   (VORTEX_POSTGRES_TEST_URL set → the 9 skips run)
                 validate every product-onboarding/products/*/manifest.json
                 npm run build

job "deployment" (ubuntu-latest, 25 min, Node 24)
  steps          npm ci
                 npx playwright install --with-deps chromium
                 npm run build && npm run build:standalone
                 start node .next/standalone/server.js with ephemeral secrets,
                   NODE_ENV=production, VORTEX_AUTH_URL=https://ci.invalid
                 poll /api/health for up to 60 s
                 npm run smoke:deployment -- http://127.0.0.1:3000
                 dump the server log on failure
```

The deployment job is the closest thing to an E2E suite: `smoke-deployment.mjs`
drives six steps against the artifact that actually ships: liveness, readiness,
session bootstrap (asserting a cookie was issued), project creation, a real PNG
artwork upload, project reopen, and a Chromium render check. The render check is
notably strict — it screenshots the composited canvas, downsamples to 64x64 and
requires more than 8 distinct colours, because a failed WebGL context otherwise
leaves a correctly sized blank canvas that a mere existence check would pass.

### `.github/workflows/structural-quality.yml`

`lint → typecheck → test → build` with concurrency cancellation. It duplicates
the `quality` job minus PostgreSQL and the manifest validation.
`quality-report.json` records that **both** workflows must be observed green on
the same SHA before the quality record may be updated.

### Not in CI

- `npm run verify:golden-local` / `verify:golden-reference` /
  `capture:golden-reference` / `finalize:golden-reference` — they require the
  authorized private PDF, which is never committed, so they can only run locally.
- `npm run validate:pdf` (`scripts/validate-production-pdf.mjs`).
- Any visual-regression or accessibility check.

---

## Running things locally

```bash
npm test                       # 484 tests, ~10 s
npx tsx --test tests/platform/pricing.test.ts    # one file
npm run check                  # lint + typecheck + test + build

# PostgreSQL integration tests (the 9 skips):
docker run -d -e POSTGRES_PASSWORD=vortex -e POSTGRES_DB=vortex -p 55499:5432 postgres:17
VORTEX_POSTGRES_TEST_URL=postgresql://postgres:vortex@127.0.0.1:55499/vortex npm test

# Deployment smoke test against a running instance:
npm run build && npm run build:standalone
node .next/standalone/server.js &
npm run smoke:deployment -- http://localhost:3000
```
