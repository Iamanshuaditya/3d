# Architecture

## 1. What kind of system this is

A **modular monolith** on Next.js 16 (App Router, React 19, TypeScript strict),
deployed as a single Node process. There is no separate API server, no message
broker, no Redis, no external queue. Everything runs in one process against one
SQLite file and one object store.

```text
                        Browser (Studio / Library / Templates / Admin / Embed frame)
                                     │
                                     │ fetch, same-origin, cookie credentials
                                     ▼
                      ┌──────────────────────────────┐
   proxy.ts  ────────▶│  Next.js App Router (nodejs) │◀──── instrumentation.ts
   (security headers, │   src/app/**/route.ts        │      (startup config gate)
    frame-ancestors)  │   src/app/**/page.tsx (RSC)  │
                      └───────────────┬──────────────┘
                                      │ withOwner / withPublicApi / withAdminApi
                                      ▼
                      ┌──────────────────────────────┐
                      │  src/server/**  (adapters)   │  containers = lazy singletons
                      │  services + SQLite repos     │
                      └───────┬──────────────┬───────┘
                              │              │
             ┌────────────────┘              └─────────────────┐
             ▼                                                 ▼
   ┌────────────────────┐                          ┌────────────────────────┐
   │ src/platform/**    │  pure domain contracts   │ src/lib/**             │
   │ types, resolvers,  │  (no React, no DB, no    │ structural engine,     │
   │ interfaces, errors │   Next imports)          │ print, configurator,   │
   └────────────────────┘                          │ embroidery, provenance │
             │                                     └────────────────────────┘
             ▼
   ┌────────────────────┐   ┌───────────────────┐   ┌─────────────────────────┐
   │ better-sqlite3     │   │ ObjectStore       │   │ product-onboarding/     │
   │ .data/vortex.sqlite│   │ filesystem | S3   │   │ Python 3.13 CLI (spawn) │
   └────────────────────┘   └───────────────────┘   └─────────────────────────┘
```

**No outbound network calls except two:** the S3-compatible object store (only
when `VORTEX_OBJECT_STORE=s3`) and Google Fonts at build time via
`next/font/google` in `src/app/layout.tsx`. VERIFIED.

## 2. Layering, and the one rule that must not be broken

Dependencies run strictly one way:

```text
src/app  →  src/server  →  src/platform  →  src/lib  →  src/types
```

- **`src/lib/structure` must never import from `src/lib/configurator`.**
  Stated in `README.md` and holds in this commit. The structural engine knows
  nothing about React, the database or products.
- `src/platform/**` is the pure domain: types, interfaces, validators, resolvers.
  It contains no I/O. Its only Next.js touch point is `PlatformError` carrying
  an HTTP status number.
- `src/server/**` is the adapter layer: services, SQLite repositories, object
  store, auth, containers. Everything in `src/server` may be swapped for another
  backend without touching `src/platform`.
- `src/app/**` is transport only. Route handlers validate the request shape,
  authorize, rate limit and delegate. They contain no business logic — the
  single exception is `src/app/api/v1/admin/product-drafts/[draftId]/route.ts`,
  which assembles a draft document patch inline (see `KNOWN_RISKS.md`).

## 3. Repository structure (the parts that matter architecturally)

```text
src/app/                 Next.js routes. 49 route.ts API handlers + 11 pages.
                         Every API route: `export const runtime = "nodejs"` and
                         `export const dynamic = "force-dynamic"`.
src/proxy.ts             Next.js middleware ("proxy"). Security headers +
                         per-request frame-ancestors for the embed surface.
src/instrumentation.ts   register(): validates deployment config before the
                         server accepts a request. Throws to refuse startup.

src/platform/            Pure domain. Sub-domains:
  products/              Option schema, configuration resolver, drafts, catalog
                         reader interface.
  projects/              DesignDocument parsing/validation, project types,
                         repository interface, PlatformError hierarchy.
  templates/             Template types, personalization parsing/merging.
  personalization/       Bulk personalization repository interface + DTOs.
  production/            Exporter/repository/font interfaces, preflight error.
  pricing/               Provider interface, quote types, limits.
  onboarding/            GLB onboarding job types + repository interface.
  storage/               ObjectStore interface (put/get/copy/delete).
  http/rate-limit.ts     RateLimitStore contract + fixed-window maths.
  jobs/                  Durable job queue contract + JobWorker (see caveat).
  embed/                 Embed client contract + fail-closed resolver.
  operators/             Operator grant repository interface.
  presentation/          Studio presentation resolution.

src/server/              Adapters and services.
  persistence/database.ts  THE SQLite schema. 17 numbered migrations.
  persistence/postgres/    PostgreSQL foundation (pool, migrate, 2 repos only).
  auth/                    Better Auth wiring + guest cookie codec + owner ctx.
  http/                    withOwner/withPublicApi/withAdminApi, rate limiting.
  projects/ products/ templates/ personalization/ production/ pricing/
  onboarding/ operators/ storage/ embed/ rendering/
                           Each has a `container.ts` exporting lazy singletons.

src/lib/                 Engines. No database, no Next.js.
  structure/             Canonical vector domain, PDF/SVG/DXF import, planar
                         topology, panel extraction, meshes, hinge rig, gates,
                         golden-reference recreation. ~10.5k lines.
  configurator/          Product definitions/specs, unfold plan + hinge motion,
                         carton/pouch geometry, editor state, texture manager.
  print/                 Printer profiles, preflight, PDF/X-4 + manufacturing SVG.
  provenance/            Manufacturing-fact ledger and claim gating.
  embroidery/            Visual stitch simulation (NOT machine digitization).
  qa/                    Product-experience diagnostics and gates.
  pacdora-lab/           Research prototype reachable at /test.

src/types/               Shared contracts: configurator, carton, pouch, unfold,
                         embroidery, provenance.

product-onboarding/      Python 3.13 CLI turning an arbitrary GLB into a
                         customizable product (inspect / build / validate /
                         integrate). Invoked by spawn() from the Node process.
docs/platform/           Milestone and contract docs (pre-existing).
docs/structural-engine/  Engine contracts and golden-reference acceptance.
fixtures/                SHA-256 manifests for private reference sources.
tests/                   node:test suites. 484 tests, 475 pass, 9 skipped.
scripts/                 Verification, capture, packaging, smoke tooling.
```

## 4. Entry points

| Entry point | File | Notes |
|---|---|---|
| Startup gate | `src/instrumentation.ts` | `register()`; only runs when `NEXT_RUNTIME === "nodejs"`. Throws `DeploymentConfigError` to refuse startup. |
| Middleware | `src/proxy.ts` | Matcher excludes `_next/static`, `_next/image`, `favicon.ico`. |
| Root layout | `src/app/layout.tsx` | Geist fonts, `suppressHydrationWarning` on `<body>`. |
| Product library (home) | `src/app/page.tsx` | RSC; lists published+public product definitions. |
| Studio | `src/app/studio/page.tsx` | RSC resolves the configuration, renders `StudioShell`. |
| Template chooser | `src/app/templates/page.tsx` | |
| My designs | `src/app/designs/page.tsx` | |
| Operator console | `src/app/admin/products/page.tsx` | Requires `products:read`; 401 → redirect to `/sign-in`, otherwise `notFound()`. |
| Embedded configurator | `src/app/embed/[clientId]/[productId]/page.tsx` | Fail-closed; `robots: noindex`. |
| Golden reference studio | `src/app/studio/golden-reference/page.tsx` | Disabled when `NODE_ENV=production` (`golden-preview.ts:77`). |
| Research prototype | `src/app/test/page.tsx` | `PacdoraLab`. Not part of the product. |
| Auth catch-all | `src/app/api/auth/[...all]/route.ts` | Delegates to Better Auth `handler`. |
| Liveness / readiness | `src/app/api/health`, `src/app/api/ready` | See `DEPLOYMENT_AND_RUNTIME.md`. |
| Node server (prod) | `.next/standalone/server.js` | `npm start`; built by `next build` + `scripts/package-standalone.mjs`. |
| CLI verification | `scripts/verify-golden-local.ts`, `verify-golden-reference-recreation.ts`, `finalize-golden-reference.ts`, `capture-golden-reference.ts` | Require the private reference PDF. |
| Python onboarding | `product-onboarding/onboard.py` | `inspect` / `build` / `validate` / `integrate`. |

## 5. Architectural boundaries actually in use

**Customer API path**

```text
route.ts  →  withOwner(request, handler)
                 ├─ resolveOwnerContext()   Better Auth session, else signed guest cookie
                 ├─ assertSameOriginMutation(request)   (mutations only)
                 ├─ assertRateLimit(bucket, owner, policy)
                 ├─ readJson(request)  (5 MB cap) or request.formData()
                 └─ get<X>Service()  →  domain service  →  SQLite repository
                                                        └→ ObjectStore
             ←  applyOwnerCookie(response, context, isSecureRequest(request))
```

**Operator API path**

```text
route.ts  →  withAdminApi(handler)
                 ├─ assertSameOriginMutation(request)   (mutations only)
                 ├─ getOperatorAuthorizationService().require(headers, permission)
                 └─ service  →  repository (+ audit event in the same transaction)
```

**Public catalogue path**

```text
route.ts  →  withPublicApi(handler)  →  service  →  repository
```
No identity, no rate limit. Used by `/api/v1/products*`, `/api/v1/templates*`,
`/api/v1/products/:id/configurations/resolve`, and `/api/v1/session/claim`
(which does its own identity work).

**Container pattern.** Every `src/server/<domain>/container.ts` exports
`get<Service>()` holding a module-level `let singleton`. Singletons are lazy and
process-local; they are never reset in production. This is why `src/lib` engines
must stay pure — the containers are the only place composition happens.

## 6. Cross-cutting concerns

| Concern | Where | Notes |
|---|---|---|
| **Authentication** | `src/server/auth/better-auth.ts`, `create-auth.ts`, `owner-context.ts` | Better Auth email+password. Guest identity = HMAC-signed UUID cookie `vortex_guest`. See `AUTH_AND_PERMISSIONS.md`. |
| **Authorization** | `src/server/operators/operator-authorization-service.ts` | 9 permissions with an implication lattice. Customer resources are owner-scoped in SQL (`OWNER_SQL` in `sqlite-project-repository.ts`). |
| **Validation** | `src/platform/**` parsers | `parseDesignDocument`, `parseOptionSelection`, `parsePersonalizationData`, `validateProductVersion`, `validateImageUpload`. Every route additionally rejects **unknown request fields** by key-set comparison. |
| **Error handling** | `src/server/http/api.ts` | `PlatformError` → `{error:{code,message,details?}}` with its own status. `ProductDomainError`/`TemplateDomainError` → status inferred from the code substring in `adminDomainStatus()`. Anything else → 500 `INTERNAL_ERROR`, message never leaked. |
| **Logging** | `console.info/warn/error` with JSON | Every line: `{"scope":"vortex-platform","event":"<domain>.<event>",...}`. There is **no** logging library, log level, correlation id or trace id. |
| **Rate limiting** | `src/server/http/rate-limit.ts` + `rate-limit-stores.ts` | Fixed window, SQLite-backed (`rate_limit_windows`), keyed `bucket:ownerType:ownerId`. 13 call sites; see `BUSINESS_RULES.md`. |
| **Idempotency** | Three separate mechanisms — see `BACKGROUND_JOBS.md` | project `creation_key`, price-quote `request_key`+fingerprint, personalization `Idempotency-Key`, background_jobs `idempotency_key`. |
| **Optimistic concurrency** | `expectedRevision` compare-and-swap | Projects (`ConflictError`, 409 `REVISION_CONFLICT`), product drafts, template drafts. |
| **Caching** | Minimal and deliberate | All JSON responses `Cache-Control: no-store` (`json()` in `api.ts`). Project asset content: `private, max-age=3600, immutable` + `Vary: Cookie`. Template preview: `public, immutable` when a version is pinned, else 300s SWR. |
| **Feature flags** | Two only | `VORTEX_ENABLE_DEVELOPMENT_PRICING`, and per-embed-client `EmbedFeatures` (all default `false`). |
| **Retries** | Personalization jobs (`max_attempts` 3); `background_jobs` (exponential backoff, ceiling 60 s) | No HTTP retry logic anywhere. |
| **i18n** | None | `lang="en"` hardcoded; `Intl.DateTimeFormat("en", …)` in the admin page. |
| **Timezones** | UTC only | Every timestamp is `new Date().toISOString()`; SQLite defaults use `strftime('%Y-%m-%dT%H:%M:%fZ','now')`. Retention arithmetic uses `setUTCDate`. |
| **Security headers** | `src/proxy.ts` | `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS when the forwarded proto is https, and `Content-Security-Policy: frame-ancestors …`. There is **no** `script-src`/`default-src` CSP. |

## 7. What is deliberately *not* here

- No payment, CRM, analytics, email, SMS or AI-provider integration.
- No webhooks in either direction.
- No message broker, Redis, or external queue.
- No multi-tenancy beyond `ProjectOwner` (guest|user) and embed clients;
  no organizations/workspaces table.
- No horizontal scale: `VORTEX_DEPLOYMENT_MODE=scaled` fails closed at startup.
- No PostgreSQL runtime: `VORTEX_DATABASE=postgresql` fails closed
  (`src/server/persistence/backend.ts`).
- No Cloudflare Workers deployment: retained as `experimental:*` npm scripts and
  `wrangler.jsonc`, explicitly unsupported (`better-sqlite3` and `sharp` are
  native modules).
