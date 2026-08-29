# API Map

All API routes live under `src/app/api/**/route.ts`. Every one declares
`export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`.
There is exactly one API version prefix, `/api/v1`, plus three unversioned
routes (`/api/auth/*`, `/api/health`, `/api/ready`).

## Shared conventions

| Concern | Mechanism |
|---|---|
| Success envelope | A single named key: `{ project }`, `{ products }`, `{ artifact }`, `{ job }`, … There is no generic `{ data }` wrapper. |
| Error envelope | `{ error: { code, message, details? } }` — built in `json()` / the three boundaries in `src/server/http/api.ts`. |
| Cache | `json()` always sets `Cache-Control: no-store`. |
| Identity boundary | `withOwner` (customer), `withPublicApi` (catalogue), `withAdminApi` (operator). |
| CSRF | `assertSameOriginMutation(request)` on **every** mutating route: rejects `Sec-Fetch-Site: cross-site` (403 `CROSS_SITE_REQUEST`) and any `Origin` not in {`nextUrl.origin`, `proto://host`, `proto://x-forwarded-host`} (403 `ORIGIN_MISMATCH`). |
| Body limit | `readJson()` caps at **5 MiB** (declared and actual), 400 `REQUEST_TOO_LARGE` / `INVALID_JSON`. |
| Unknown fields | Rejected by explicit key-set comparison in most handlers → 400 `INVALID_REQUEST`. |
| Pagination | **None anywhere.** Every list endpoint returns the full owner-scoped or catalogue-wide set. |
| API keys | **None.** There is no machine-to-machine authentication. |
| Versioning | Path prefix only. No content negotiation, no deprecation headers. |

---

## Operational

### `GET /api/health`
Liveness. Returns `{status:"ok", uptimeSeconds}`. **Deliberately touches
nothing** — a liveness probe that hit the database would restart a healthy app
during a transient blip. File: `src/app/api/health/route.ts`.

### `GET /api/ready`
Readiness for the load balancer. Runs three independent checks in parallel:
`configuration` (`validateDeploymentConfig()`), `database`
(`SELECT 1`), `object-store` (`get()` on a random key that cannot exist — proves
addressability without writing). 200 `{status:"ready", checks}` or 503
`{status:"not-ready", checks}` with a per-check `detail`.
File: `src/app/api/ready/route.ts`.

---

## Authentication

### `GET|POST /api/auth/[...all]`
Better Auth catch-all — sign-up, sign-in, sign-out, session. Delegates straight
to `getAuth().handler(request)`. Configured in
`src/server/auth/create-auth.ts`: email+password, min 10 / max 128 chars,
`revokeSessionsOnPasswordReset: true`, secure cookies in production.
No social providers, no email verification sender.

### `GET /api/v1/session`
Establishes the signed guest cookie. Returns `{owner:{type}}` only — the opaque
owner id is intentionally never exposed.

### `POST /api/v1/session/claim`
```text
Purpose        Transfer everything owned by a signed guest to the signed-in user.
Auth           Requires BOTH an authenticated session and a valid signed guest
               cookie; 401 AUTHENTICATION_REQUIRED / GUEST_IDENTITY_REQUIRED.
Boundary       withPublicApi (it resolves both identities itself).
Rate limit     "project-claim" 10 / 60 s, keyed on the USER owner.
Entities       design_projects, personalization_datasets, personalization_jobs
               (owner columns rewritten), project_owner_claims (inserted/updated)
Response       { claimedProjectCount }, and the guest cookie is CLEARED.
Errors         409 GUEST_ALREADY_CLAIMED when that guest_id already belongs to a
               different user.
Files          src/app/api/v1/session/claim/route.ts
               src/server/persistence/sqlite-project-repository.ts:368 claimAll()
```

---

## Public catalogue (no identity, no rate limit)

| Route | Purpose | Notes |
|---|---|---|
| `GET /api/v1/products` | List published, public products | `ProductApiService.list()` |
| `GET /api/v1/products/:productId?version=` | One product, optionally a pinned version | `productId` ≤ 128 chars, `version` ≤ 160 |
| `POST /api/v1/products/:productId/configurations/resolve` | Resolve an option selection to a `configurationId` + product config | Body keys limited to `productVersionId`, `optionSelection`. Errors surface `ProductDomainError` codes such as `OPTION_VALUE_INVALID`, `OPTION_UNAVAILABLE`, `CONFIGURATION_UNMANUFACTURABLE`. |
| `GET /api/v1/templates?productId&productVersionId&configurationId&category&search` | Filter templates | Every query value bounded to 160 chars → 400 `INVALID_QUERY` |
| `GET /api/v1/templates/:templateId?version=` | One template incl. `designDocumentTemplate` | |
| `GET /api/v1/templates/:templateId/preview?version=` | PNG preview | `public, max-age=31536000, immutable` when `version` is pinned; otherwise `max-age=300, stale-while-revalidate=3600`. The **only** publicly cacheable response in the app. |

---

## Projects (customer, owner-scoped)

### `GET /api/v1/projects` · `POST /api/v1/projects`
```text
POST body      { productId, title?, clientRequestId?, optionSelection? }
Rate limit     "project-mutation" 120 / 60 s
Validation     productId must be a string; clientRequestId must be a UUID when
               present (INVALID_CREATION_KEY); title normalised to <=120 chars
Idempotency    UNIQUE(owner_type, owner_id, creation_key). A replay returns the
               existing project; a replay with a DIFFERENT product or template
               is 400 CREATION_KEY_REUSED.
Response       201 { project: DesignProjectDto }
Errors         409 GUEST_IDENTITY_CLAIMED, 400 UNKNOWN_PRODUCT / OPTION_* /
               PRODUCT_MISMATCH
Files          src/app/api/v1/projects/route.ts
               src/server/projects/project-service.ts create()
```

### `GET|PATCH|DELETE /api/v1/projects/:projectId`
```text
PATCH body     { expectedRevision, design, title?, status? }
               status may ONLY be "draft" or "ready_for_preflight"
               (400 INVALID_STATUS otherwise) — the Studio cannot set
               production_ready or archived.
Rate limit     "project-mutation" 120 / 60 s (PATCH and DELETE)
Errors         404 NOT_FOUND · 409 REVISION_CONFLICT (details.currentRevision)
               400 INVALID_REVISION / INVALID_DESIGN / SURFACE_CONTRACT_MISMATCH
               / PRODUCT_MISMATCH / ASSET_NOT_OWNED / ASSET_NOT_PERSISTED
               / PROJECT_ARCHIVED / PROJECT_CONFIGURATION_MISMATCH
DELETE         Archives (soft). Returns { archived: true }.
```

### `POST /api/v1/projects/:projectId/duplicate`
Deep copy: new project row, artwork objects copied in the object store, asset
ids rewritten inside the design (`replaceAssetIds`). Rate limit
`"project-mutation"`. Response 201. On failure the destination is archived and
the copied objects deleted.

### `POST /api/v1/projects/:projectId/preview`
Renders a PNG preview server-side. Rate limit `"preview-generation"` 30 / 60 s.
Returns the updated `ProjectSummaryDto`.

### `POST /api/v1/projects/:projectId/assets`
Multipart artwork upload; the form field must be exactly `file`. Rate limit
`"asset-upload"` 20 / 60 s. `Content-Length` is **required** (400
`UPLOAD_LENGTH_REQUIRED`). 20 MiB / 40 MP ceilings. Full `sharp` decode.
Response 201 `{asset}`.

### `GET /api/v1/projects/:projectId/assets/:assetId/content`
Serves artwork bytes. `Cache-Control: private, max-age=3600, immutable`,
`Vary: Cookie`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`.

---

## Production

| Route | Auth | Rate limit | Notes |
|---|---|---|---|
| `POST /api/v1/projects/:id/production/preflight` | owner | `production-preflight` 30/min | Body `{revision?}`. Passing preflight promotes the project to `ready_for_preflight` for that revision. |
| `GET /api/v1/projects/:id/production/artifacts` | owner | — | Lists artifacts for the project. |
| `POST /api/v1/projects/:id/production/artifacts` | owner | `production-generation` 10/min | Body `{revision?, kind?}` where `kind ∈ {"pdf","svg"}`, default `pdf`. Anything else → 400 `PRODUCTION_FORMAT_UNSUPPORTED`. 201. Failing preflight raises `ProductionPreflightError` carrying the full report. |
| `GET /api/v1/production-artifacts/:artifactId` | owner | — | Metadata + `downloadUrl`. |
| `GET /api/v1/production-artifacts/:artifactId/content` | owner | — | Bytes, re-verified against sha256. Headers: `Content-Security-Policy: sandbox`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: private, no-store`, `ETag: "<sha256>"`, `Content-Disposition: attachment; filename*=UTF-8''…`. |

---

## Pricing

### `POST /api/v1/products/:productId/quotes`
```text
Body           { quantity, clientRequestId, productVersionId?, optionSelection? }
               quantity: integer 1..1 000 000
               clientRequestId: <=160 chars, /^[a-z0-9][a-z0-9._:-]{0,159}$/i
Rate limit     "price-quote" 60 / 60 s
Response       201 when created, 200 when replayed with an identical fingerprint
Errors         409 QUOTE_IDEMPOTENCY_CONFLICT (same key, different request)
               404 NOT_FOUND (unknown product, or visibility != "public")
               422 PRICING_UNAVAILABLE (no rule for this configuration)
               503 PRICING_PROVIDER_FAILED (provider threw, or returned an
                   invalid contract — deliberately indistinguishable to callers)
Files          src/app/api/v1/products/[productId]/quotes/route.ts
               src/server/pricing/pricing-service.ts
```

### `GET /api/v1/price-quotes/:quoteId`
Owner-scoped read. `status` is computed (`active` | `expired`) from `expires_at`
against the clock at read time.

---

## Templates and bulk personalization

| Route | Auth | Rate limit | Notes |
|---|---|---|---|
| `POST /api/v1/templates/:templateId/instantiate` | owner | `project-mutation` 120/min | Creates a project from a template; copies template artwork into project assets. 201. |
| `GET|POST /api/v1/personalization-datasets` | owner | `personalization-dataset` 20/min (POST) | Multipart `{templateId, templateVersionId, file, mapping?}`. `mapping` is a JSON string ≤ 64 KiB. CSV ≤ 5 MiB, 1..10 000 rows. Invalid CSV → 400 `PERSONALIZATION_DATASET_INVALID` with `details.report`. |
| `GET /api/v1/personalization-datasets/:datasetId/preview?row=N` | owner | — | PNG of row `N`; **only rows 0–2** (400 `PERSONALIZATION_PREVIEW_ROW_INVALID`). |
| `GET|POST /api/v1/personalization-jobs` | owner | `personalization-job` 20/min (POST) | POST requires header `Idempotency-Key` matching `/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,127}$/` → 400 `IDEMPOTENCY_KEY_INVALID`. Returns **202**. |
| `GET /api/v1/personalization-jobs/:jobId` | owner | — | Poll status/progress. |
| `POST /api/v1/personalization-jobs/:jobId/cancel` | owner | — | Only from `queued`/`running`. |
| `POST /api/v1/personalization-jobs/:jobId/retry` | owner | — | Only from `failed` **and** `attempt < max_attempts`; else 409 `PERSONALIZATION_JOB_NOT_RETRYABLE`. 202. |
| `GET /api/v1/personalization-jobs/:jobId/output` | owner | — | NDJSON download, re-verified against sha256 + byte size + content type. `Content-Security-Policy: sandbox`. |

---

## Operator / admin (`/api/v1/admin/**`)

Every route calls
`getOperatorAuthorizationService().require(request.headers, "<permission>")`.
401 `OPERATOR_AUTHENTICATION_REQUIRED` when unauthenticated, 403
`OPERATOR_FORBIDDEN` when the grant is missing. **No rate limiting is applied to
any admin route.**

### Products
| Route | Permission |
|---|---|
| `GET /api/v1/admin/products` | `products:read` |
| `POST /api/v1/admin/products/:productId/drafts` | `products:edit` |
| `GET /api/v1/admin/product-drafts` | `products:read` |
| `GET /api/v1/admin/product-drafts/:draftId` | `products:read` |
| `PATCH /api/v1/admin/product-drafts/:draftId` | `products:edit` — body keys limited to `expectedRevision`, `name`, `description`, `visibility` |
| `POST /api/v1/admin/product-drafts/:draftId/validate` | `products:validate` |
| `POST /api/v1/admin/product-drafts/:draftId/publish` | `products:publish` |
| `GET /api/v1/admin/product-drafts/:draftId/audit` | `products:read` |

### Templates
| Route | Permission |
|---|---|
| `GET|POST /api/v1/admin/template-drafts` | `templates:read` / `templates:edit` |
| `GET|PATCH /api/v1/admin/template-drafts/:draftId` | `templates:read` / `templates:edit` |
| `POST /api/v1/admin/template-drafts/:draftId/validate` | `templates:edit` |
| `POST /api/v1/admin/template-drafts/:draftId/publish` | `templates:publish` → 201 |
| `GET /api/v1/admin/template-drafts/:draftId/audit` | `templates:read` |
| `GET|POST /api/v1/admin/template-assets` | `templates:read` / `assets:upload` |

### Onboarding
| Route | Permission |
|---|---|
| `POST /api/v1/admin/onboarding/jobs` | `onboarding:run` → 202 |
| `GET /api/v1/admin/onboarding/jobs/:jobId` | `onboarding:run` |
| `GET /api/v1/admin/onboarding/jobs/:jobId/assets/:assetId/content` | `onboarding:run` |
| `POST /api/v1/admin/onboarding/jobs/:jobId/attach` | `onboarding:run` **and** `products:edit` (two sequential `require()` calls) |

### Fonts
| Route | Permission |
|---|---|
| `GET /api/v1/admin/production-fonts` | `products:read` |
| `POST /api/v1/admin/production-fonts` | `assets:upload` — multipart `{file, family, weight, style, licenseName, licenseReference}`; all six required. 201. |

---

## Admin error-status mapping (non-obvious)

`withAdminApi` maps `ProductDomainError` / `TemplateDomainError` to HTTP by
**substring match on the error code** (`adminDomainStatus()` in
`src/server/http/api.ts`):

```text
code contains "NOT_FOUND"                                     → 404
code contains CONFLICT | STALE | IMMUTABLE | EXISTS |
              ALREADY_PUBLISHED                               → 409
code contains "FORBIDDEN"                                     → 403
anything else                                                 → 400
```

A new domain error code therefore silently inherits 400 unless its name contains
one of those tokens. This is worth knowing before naming a new error.
