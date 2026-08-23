# Platform API

Status: version 1 exposes authenticated/guest owner sessions, products/configuration resolution, owner-scoped immutable price quotes, projects, artwork, editable templates and private catalogue artwork, durable bulk personalization, protected operator product/template/onboarding APIs, server preflight, and immutable PDF/manufacturing-SVG artifacts. Project, quote, template, and artifact DTOs remain bound to immutable versions and resolved configurations.

## Conventions

- JSON unless an upload endpoint specifies multipart form data.
- Owner identity comes from a verified Better Auth session or an HMAC-signed HTTP-only guest cookie. Provider user IDs are translated to the existing user-owner model at the request boundary.
- Owner data uses `Cache-Control: no-store`; authorized asset bytes are private-cacheable and immutable-version template previews are public immutable-cacheable.
- Mutations require same-origin browser context.
- Public DTOs contain authorized read URLs, never storage keys.
- Public product DTOs are explicit projections; they never serialize `ProductConfig`, provider identifiers, GLB URLs, mesh names, carton internals, ICC paths, or production-only option values.
- Money is represented as integer minor units plus an ISO-style three-letter currency code. Browser-provided prices and totals are never accepted.

Errors use:

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "This project was updated by another request. Reload before saving again.",
    "details": { "currentRevision": 7 }
  }
}
```

## Owner session endpoint

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/session` | Establish/refresh the signed owner context without exposing its opaque ID |
| `POST` | `/api/v1/session/claim` | Atomically claim this signed guest's projects/datasets/jobs into the current authenticated account |

The project client completes this read before its first create mutation. This prevents React remounts from racing two initial mutations before a fresh browser has received its signed guest cookie. Blank/template actions still carry an idempotency UUID; the cookie defines ownership and the UUID only deduplicates a mutation within that owner.

Email/password sign-up, sign-in, session, and sign-out use the Better Auth handler mounted at `/api/auth/*`. The claim route accepts no identity body: it requires a server-verified authenticated session and a separately valid current guest cookie, enforces same origin/rate limits, commits ownership and a claim ledger transactionally, and clears the guest cookie. The same-user retry is harmless; cross-user reuse fails with a conflict.

## Product endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/products` | List current public published products and customer-facing option schemas |
| `GET` | `/api/v1/products/:productId` | Read current product metadata, capabilities, version references, and template compatibility |
| `GET` | `/api/v1/products/:productId?version=:versionId` | Read one immutable historical public version while identifying the current version |
| `POST` | `/api/v1/products/:productId/configurations/resolve` | Validate options and return one authoritative resolved configuration DTO |

Resolution body:

```json
{
  "productVersionId": "mailer-box-001@3",
  "optionSelection": {
    "length": 200,
    "width": 150,
    "depth": 70,
    "board_thickness": 1.5
  }
}
```

The response contains validated customer values, deterministic `configurationId`, physical surface dimensions in millimetres, surface/page navigation, render capabilities, production format availability, and version-bound Studio/template links. It does not expose the internal engine config. The server re-runs option dependency, bounds, provider, and manufacturability validation; clients must not derive or assert production dimensions themselves.

Unlisted/hidden registry products do not appear in the public list and direct public detail/resolve calls return 404. Internal project reopening continues through the exact owner-authorized project/product-version path, not through this discovery API.

## Price quote endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/products/:productId/quotes` | Resolve configuration server-side and persist an owner-scoped immutable quote |
| `GET` | `/api/v1/price-quotes/:quoteId` | Read owner-authorized immutable quote terms and current active/expired status |

Create body:

```json
{
  "productVersionId": "tshirt@2",
  "optionSelection": {},
  "quantity": 10,
  "clientRequestId": "b201c748-51d3-4c57-9746-4ceefaf62cdd"
}
```

The server resolves the exact product version and deterministic `configurationId`, then sends that trusted configuration and quantity to `PricingProvider`. It validates currency, expiry, unique line codes, safe-integer amounts, and every `quantity × unitAmountMinor = amountMinor` relationship before storage. The public DTO includes immutable line items, total, tax/shipping inclusion flags, pricing version, expiry, and resource links; it excludes owner IDs, provider identity/reference, idempotency keys, and request fingerprints.

Quote creation is same-origin checked, owner scoped, rate limited, and idempotent. Reusing a client request ID with different product/options/version/quantity returns 409. A product version published after the quote cannot mutate or float the saved quote. `status` is derived as `active` or `expired`; expiry never rewrites the immutable record.

The checked-in static provider is explicitly a development estimate for one exact T-shirt configuration. It is disabled in production unless `VORTEX_ENABLE_DEVELOPMENT_PRICING=true`. Unsupported configurations return `PRICING_UNAVAILABLE` rather than a fabricated price. A quote is not a cart reservation, checkout authorization, tax calculation, shipping promise, or order.

## Project endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/projects` | List current owner's active projects |
| `POST` | `/api/v1/projects` | Create an idempotent project |
| `GET` | `/api/v1/projects/:projectId` | Open and hydrate a project |
| `PATCH` | `/api/v1/projects/:projectId` | Revision-checked save/title/status update |
| `DELETE` | `/api/v1/projects/:projectId` | Soft-archive a project |
| `POST` | `/api/v1/projects/:projectId/duplicate` | Deep-copy project and artwork |
| `POST` | `/api/v1/projects/:projectId/preview` | Generate/update preview cache |

Create body:

```json
{
  "productId": "tshirt",
  "title": "Launch team shirts",
  "clientRequestId": "e7bc0298-6d21-41fb-bf31-992034579133",
  "optionSelection": {}
}
```

Save body:

```json
{
  "expectedRevision": 7,
  "design": { "productId": "tshirt", "surfaces": {} },
  "title": "Optional new title",
  "status": "draft"
}
```

Only `draft` and `ready_for_preflight` are accepted from Studio. The server owns production-state transitions.

## Asset endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/projects/:projectId/assets` | Multipart `file` upload |
| `GET` | `/api/v1/projects/:projectId/assets/:assetId/content` | Owner-authorized bytes |

The upload endpoint supports decoded PNG, JPEG, and WebP, one frame/page only. Limits are 20 MB and 40 million decoded pixels. The response includes stable metadata and `readUrl`.

## Template endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/templates` | List/search current published template versions |
| `GET` | `/api/v1/templates/:templateId` | Read editable published template metadata/document |
| `GET` | `/api/v1/templates/:templateId/preview` | Render/read PNG from the same template document |
| `POST` | `/api/v1/templates/:templateId/instantiate` | Create an owner-scoped project from an exact template version |

List filters include bounded `productId`, `productVersionId`, `configurationId`, `category`, and `search`. Customer selection uses all three product identity fields so the catalogue cannot float a template across structural versions.

Instantiation body:

```json
{
  "templateVersionId": "team-launch-shirt@1",
  "productId": "tshirt",
  "productVersionId": "tshirt@2",
  "optionSelection": {},
  "personalization": {
    "company": { "name": "Northstar", "tagline": "Build what matters" }
  },
  "clientRequestId": "599508f7-bf78-492c-98dc-aad218b62d39"
}
```

The server independently resolves product identity/configuration, validates compatibility, placeholders, and every declared template asset, then creates a normal project. Private immutable catalogue artwork is copied to new owner-scoped project assets and document IDs are rewritten before revision 1 is stored. The mutation is owner scoped, same-origin checked, rate limited, and idempotent.

## Bulk-personalization endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/personalization-datasets` | List the current owner's unexpired dataset records |
| `POST` | `/api/v1/personalization-datasets` | Upload/map a bounded CSV against one immutable template version |
| `GET` | `/api/v1/personalization-datasets/:datasetId/preview?row=0` | Render one of the first three normal-document variants |
| `GET` | `/api/v1/personalization-jobs` | List current owner's jobs/progress |
| `POST` | `/api/v1/personalization-jobs` | Idempotently queue a bounded manifest job |
| `GET` | `/api/v1/personalization-jobs/:jobId` | Read owner-scoped status/progress |
| `POST` | `/api/v1/personalization-jobs/:jobId/cancel` | Cancel a queued job |
| `POST` | `/api/v1/personalization-jobs/:jobId/retry` | Retry a failed job within the attempt bound |
| `GET` | `/api/v1/personalization-jobs/:jobId/output` | Download the private checksum-verified NDJSON result |

CSV input is multipart, at most 5 MiB/256 columns/10,000 rows/2,000 characters per cell, and all-or-nothing. Dataset and job DTOs omit storage keys and values. The output contains ordinary `DesignDocument` variants, not manufacturing approval; each production output still requires a normal immutable project revision and preflight.

## Operator endpoints

All routes below require a verified session plus a server-side permission grant. Mutations enforce same origin; admin DTOs omit storage keys and internal engine/provider objects.

| Method | Path | Permission and purpose |
| --- | --- | --- |
| `GET` | `/api/v1/admin/products` | `products:read`; safe product/version/validation inventory |
| `POST` | `/api/v1/admin/products/:productId/drafts` | `products:edit`; clone a current product into a revisioned draft |
| `GET` | `/api/v1/admin/product-drafts` | `products:read`; list safe draft DTOs |
| `GET/PATCH` | `/api/v1/admin/product-drafts/:draftId` | read or CAS-update a draft |
| `POST` | `/api/v1/admin/product-drafts/:draftId/validate` | `products:validate`; resolve and persist report |
| `POST` | `/api/v1/admin/product-drafts/:draftId/publish` | `products:publish`; atomically publish an immutable version |
| `GET` | `/api/v1/admin/product-drafts/:draftId/audit` | `products:read`; append-only history |
| `GET/POST` | `/api/v1/admin/template-assets` | list or `assets:upload` immutable private catalogue images |
| `GET/POST` | `/api/v1/admin/template-drafts` | list or create/clone revisioned template drafts |
| `GET/PATCH` | `/api/v1/admin/template-drafts/:draftId` | read or CAS-update a template draft |
| `POST` | `/api/v1/admin/template-drafts/:draftId/validate` | `templates:edit`; validate exact compatibility/assets |
| `POST` | `/api/v1/admin/template-drafts/:draftId/publish` | `templates:publish`; create an immutable template version |
| `GET` | `/api/v1/admin/template-drafts/:draftId/audit` | `templates:read`; append-only history |
| `POST` | `/api/v1/admin/onboarding/jobs` | `onboarding:run`; submit bounded GLB/manifest input |
| `GET` | `/api/v1/admin/onboarding/jobs/:jobId` | `onboarding:run`; status, report, and safe artifact URLs |
| `POST` | `/api/v1/admin/onboarding/jobs/:jobId/attach` | attach passed provenance to a matching product draft |
| `GET` | `/api/v1/admin/onboarding/jobs/:jobId/assets/:assetId/content` | authorized checksummed report/artifact bytes |
| `GET/POST` | `/api/v1/admin/production-fonts` | list or `assets:upload` approved immutable font records |

## Production endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/projects/:projectId/production/preflight` | Preflight an exact/current revision without generating bytes |
| `GET` | `/api/v1/projects/:projectId/production/artifacts` | List this owner's immutable project artifacts |
| `POST` | `/api/v1/projects/:projectId/production/artifacts` | Idempotently generate/store an exact revision PDF or supported manufacturing SVG |
| `GET` | `/api/v1/production-artifacts/:artifactId` | Read owner-authorized immutable metadata/report |
| `GET` | `/api/v1/production-artifacts/:artifactId/content` | Download checksum-verified immutable bytes |

Preflight/generation bodies accept only an optional positive `revision`; generation accepts `kind: "pdf" | "svg"` and defaults to PDF. SVG is rejected unless the resolved product contains an exact one-sheet structural contract whose physical bounds match its print surface. The server ignores client claims for product version, configuration, dimensions, PPI, profile, readiness, price, assets, checksum, and artifact identity.

Failed generation returns HTTP 422 with `PRODUCTION_PREFLIGHT_FAILED` and the structured report in `error.details.report`; unsupported format/product pairs return `PRODUCTION_FORMAT_UNSUPPORTED`. Successful DTOs expose project revision, product version/configuration, kind, MIME type, filename, size, SHA-256, full report, timestamp, and authorized download URL—never the storage key.

## Compatibility and evolution

API DTOs are defined in `src/platform/products/public-types.ts`, `src/platform/pricing/types.ts`, `src/platform/projects/types.ts`, `src/platform/templates/types.ts`, and `src/platform/production/types.ts`, separate from repository rows and `ProductConfig`. Project, quote, and artifact DTOs expose immutable provenance but not internal version snapshots, provider references, or storage rows. Additive v1 changes remain possible; incompatible public changes require a new version or an explicit compatibility period.

Not yet exposed: project revision-history browsing, permanent deletion, direct signed object-store URLs, artifact approval/order linkage, carts/orders/reprints, supplier-approved production pricing, and tax/shipping calculation. PostgreSQL is a target schema rather than a runnable API backing store. Registered production fonts are not yet renderer-bound, and bulk manifest outputs are not manufacturing artifacts.
