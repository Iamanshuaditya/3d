# Agent: Start Here

Read this whole file before touching code. It is ~5 minutes and it will save you
far more than that.

---

## 1. What this application is

**Vortex** — a 3D packaging configurator and structural carton engine.

A customer picks a product, designs its printable surfaces in a 2D editor, sees
it live on a folding 3D model, and exports a print-ready PDF/X-4 or manufacturing
SVG. Operators publish immutable product and template versions behind an
authenticated console. Manufacturers can embed the configurator on their own
website in an iframe.

The governing idea: **a production dieline is the single geometric authority.**
The same canonical geometry drives the 2D editor, the exact folding 3D model, the
artwork mapping and the manufacturing output. There is never a second,
separately maintained shape.

```text
fully flattened 3D structural geometry == canonical production dieline
```

> The repository directory is called `ai-website-cloner-template`. That is a
> leftover of the MIT template it was seeded from. It has nothing to do with what
> this code does. Ignore it.

---

## 2. Architecture in ten lines

- Next.js 16 App Router, React 19, TypeScript strict. **One Node process.**
- SQLite via `better-sqlite3` (synchronous, in-process). Schema version 17,
  17 forward-only migrations, all in `src/server/persistence/database.ts`.
- Objects (artwork, PDFs, NDJSON) live in a filesystem or S3-compatible store.
- Layers, strictly one-way:
  `src/app` → `src/server` → `src/platform` → `src/lib` → `src/types`.
- `src/platform` is pure domain (types, resolvers, validators, interfaces).
  `src/server` is adapters. `src/lib` is engines that know nothing about HTTP or
  the database.
- Composition happens only in `src/server/<domain>/container.ts` lazy singletons.
- Three HTTP boundaries: `withOwner` (customer), `withPublicApi` (catalogue),
  `withAdminApi` (operator) — all in `src/server/http/api.ts`.
- Identity is a `ProjectOwner`: `{type:"guest"|"user", id}`. Guests get an
  HMAC-signed cookie. There are no organizations or workspaces.
- **No webhooks, no payment provider, no message broker, no Redis, no cron.**
- `npm run check` = lint + typecheck + test + build. Run it.

---

## 3. The business concepts you must hold in your head

| Concept | One line |
|---|---|
| **Dieline** | The flat production plan. The geometric authority for everything. |
| **Panel / hinge / fold plan** | Panels come from closed cut cycles; hinges come from creases; a plan is an ordered list of hinge targets. |
| **DesignDocument** | The customer's design. The only customer-design source of truth. |
| **Revision** | Every save is a compare-and-swap that writes an immutable snapshot. |
| **ProductVersion** | An immutable, checksum-locked published product. Id `productId@n`. |
| **configurationId** | `` `${versionId}|k=t:v&…` `` — the identity of one exact configuration. A wire format. |
| **Preflight** | The gate a design must pass before production output. |
| **Provenance ledger** | Which manufacturing facts are `measured`/`derived`/`authored` (certifiable) versus `assumed`/`unresolved` (not). |
| **Claim** | An assertion the output makes. Built by *filtering* the ledger, never by hand. |
| **Operator** | An authenticated user holding one of 9 named permissions. |
| **Embed client** | A manufacturer registered in `VORTEX_EMBED_CLIENTS` with exact allowed origins. |

---

## 4. Files that are dangerous to modify casually

| File | Why |
|---|---|
| `src/server/persistence/database.ts` | Migrations are forward-only and already shipped. Add migration 18, bump `SCHEMA_VERSION`, mirror it in `docs/platform/postgresql/schema.sql`. Never edit an existing migration. |
| `src/platform/products/configuration-resolver.ts` | `configurationId()` is a wire format. Changing the encoding invalidates every stored project, quote, artifact and template match. |
| `src/lib/structure/structural-mesh.ts` | `sheetUv()` deliberately maps `u` straight through. "Fixing" it to match the legacy carton builder mirrors artwork on every assembled panel. Covered by `tests/structure/structural-chirality.test.ts`. |
| `src/lib/print/printer-profiles.ts` | `approval` is a manufacturing claim. It may only leave `"simulated-company"` after a named converter signs off a physical proof. |
| `src/lib/provenance/ledger.ts` | Derivation soundness is what stops a preview assumption entering certified output. |
| `src/server/auth/owner-context.ts` | Cookie signing, verification and CHIPS partitioning. |
| `src/proxy.ts` | Sets `frame-ancestors` per request from the embed registry. A mistake here either breaks every client's iframe or lets anyone frame the Studio. |
| `quality-report.json` / `QUALITY_STATE.md` / `quality-run-log.md` | A test fails the build if they disagree. CI green alone must never flip them to PASS. |
| `src/lib/configurator/product-config.ts` + `product-definitions.ts` | Products are defined in **code** and auto-published into the database on first catalogue read. Editing them changes production data. |

---

## 5. What to read for your task

| Task | Read |
|---|---|
| Any HTTP endpoint | `API_MAP.md` + `AUTH_AND_PERMISSIONS.md` |
| Database / repository work | `DATABASE_MAP.md` |
| Save, revision, or status behaviour | `STATE_MACHINES.md` + `DATA_FLOW.md` Flow 2 |
| Production / print output | `DATA_FLOW.md` Flow 3 + `BUSINESS_RULES.md` R13–R18 |
| Anything async | `BACKGROUND_JOBS.md` — read the first section before anything else |
| Embedded configurator | `THIRD_PARTY_INTEGRATIONS.md` §9 + `DATA_FLOW.md` Flow 7 |
| Structural / dieline engine | `ARCHITECTURE.md` + `BUSINESS_RULES.md` R28–R32 + `TESTING_MAP.md` |
| Config / env vars | `CONFIGURATION.md` |
| Deployment | `DEPLOYMENT_AND_RUNTIME.md` |
| Finding anything | `CODEBASE_MAP.md` |
| Vocabulary | `GLOSSARY.md` |
| Before proposing a change | `KNOWN_RISKS.md` |

---

## 6. Conventions to preserve

1. **Dependencies run one way.** `src/lib/structure` must never import
   `src/lib/configurator`. `src/platform` performs no I/O.
2. **Route handlers hold no business logic.** Validate shape, authorize, rate
   limit, delegate to a service from a `container.ts`.
3. **Reject unknown request fields explicitly** by key-set comparison. Every
   existing handler does; match it.
4. **Fail closed.** Unknown geometry, an unsupported backend, a missing secret,
   an unregistered origin — refuse with a message that names the variable or the
   fact, rather than guessing.
5. **Never trust client metadata about bytes.** Image dimensions, MIME types,
   checksums, sizes and prices are all re-derived server-side.
6. **Storage keys, provider references and owner ids never appear in a DTO.**
   The `*Dto` types omit them structurally, not by convention.
7. **Comments explain *why*, not *what*.** The existing comments are unusually
   good; match their register. Explain the failure a decision prevents.
8. **New behavioural facts are locked with a regression test that was confirmed
   to fail against the old behaviour.** This is stated in `AGENTS.md` and is how
   chirality, fold direction and handedness were settled.
9. **Immutability.** Published versions, project revisions and production
   artifacts are never mutated in place.
10. **Files under ~800 lines.** Extract modules rather than growing one.
11. **Named exports, PascalCase components, camelCase utils, 2-space indent,
    Tailwind utilities, no inline styles, no `any`.**

---

## 7. Known traps

1. **`background_jobs` is a fully working durable queue that nothing uses.**
   Enqueueing into it means your work never runs. The two live runners
   (`PersonalizationRunner`, `OnboardingRunner`) each have their own in-process
   scheduler. Read `BACKGROUND_JOBS.md` first.
2. **A webhook route added under `withOwner` or `withAdminApi` will 403 every
   provider POST** — `assertSameOriginMutation` rejects cross-site mutations.
3. **Admin error codes map to HTTP status by substring.** A new
   `ProductDomainError` silently gets 400 unless its code contains `NOT_FOUND`,
   `CONFLICT`, `STALE`, `IMMUTABLE`, `EXISTS`, `ALREADY_PUBLISHED` or
   `FORBIDDEN`. Naming is load-bearing (`adminDomainStatus()`).
4. **Adding a product in code writes rows to the database.**
   `ProductCatalogService.ensureSynchronized()` publishes every
   `CODE_PRODUCT_VERSIONS` entry on the first catalogue read of the process.
5. **`better-sqlite3` is synchronous.** Every query blocks the single event-loop
   thread that is also serving HTTP. Loops over thousands of rows are not free.
6. **There is no scheduler.** Expired-dataset purging happens opportunistically
   inside request handlers; the rate-limit sweep never happens at all. Do not
   assume anything runs "in the background" unless you can point at its caller.
7. **Preview generation failures are swallowed on purpose** so they cannot turn a
   successful save into a failed one. Do not "fix" that by propagating the error.
8. **The golden-reference routes and scripts need a private PDF** that is never
   committed. They are checksum-locked in `fixtures/` and disabled in production.
   You cannot run `verify:golden-*` without it, and that is intended.
9. **9 tests skip locally.** They are the PostgreSQL integration tests and need
   `VORTEX_POSTGRES_TEST_URL`. A local run of 475/484 is the healthy state.
10. **`sharp` and `better-sqlite3` are native modules.** They are why Cloudflare
    Workers cannot work, and why they appear in `serverExternalPackages`.
11. **Per-owner rate limits are bypassable by dropping the cookie** (see
    `KNOWN_RISKS.md`). Do not treat an existing rate limit as an abuse control
    when reasoning about a new expensive endpoint.

---

## 8. Assumptions never to make without checking the code

| Do not assume | Check |
|---|---|
| "There is a queue / cron / scheduler" | `BACKGROUND_JOBS.md`; grep for the caller |
| "There is a webhook / payment / analytics integration" | `WEBHOOKS.md` — there is none |
| "PostgreSQL works" | `src/server/persistence/backend.ts` — it fails closed |
| "It can scale horizontally" | `src/server/config/environment.ts` — `scaled` fails closed |
| "It deploys to Cloudflare Workers" | It does not; native modules |
| "There is an ORM" | Hand-written SQL only |
| "There are organizations / workspaces / roles" | Only `ProjectOwner` and 9 operator permissions |
| "Products live in the database" | They are defined in code and seeded from it |
| "The admin API is rate limited" | It is not |
| "Preflight warnings block export" | Only `severity: "error"` does |
| "Embroidery can be exported" | Blocked at preflight by design |
| "The manufacturing output is certified" | Reference recreation is; manufacturing construction is not |
| "An artifact can be regenerated" | It is immutable per `(project, revision, kind)` |
| "A logging/metrics/tracing system exists" | JSON to stdout, nothing else |
| "There is graceful shutdown" | There is no `SIGTERM` handler |
| "`.env.example` is accurate" | It documents `VORTEX_DATABASE_URL`, which nothing reads |

---

## 9. Before you finish

```bash
npm run lint
npm run typecheck
npm test          # expect 475 pass / 9 skipped
npm run build
# or all four:
npm run check
```

If you changed anything the quality record asserts, remember
`tests/platform/quality-record-consistency.test.ts` will fail the build if
`quality-report.json`, `QUALITY_STATE.md` and `quality-run-log.md` disagree — and
that CI passing is never, on its own, grounds to mark anything certified.
