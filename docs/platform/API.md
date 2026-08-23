# Platform API

Status: version 1 exposes products/configuration resolution, projects, artwork, editable templates, server preflight, and immutable PDF/manufacturing-SVG artifacts. Project/artifact DTOs are bound to immutable product versions and resolved configurations.

## Conventions

- JSON unless an upload endpoint specifies multipart form data.
- Owner identity comes from an HTTP-only guest cookie or future auth provider.
- Owner data uses `Cache-Control: no-store`; authorized asset bytes are private-cacheable and immutable-version template previews are public immutable-cacheable.
- Mutations require same-origin browser context.
- Public DTOs contain authorized read URLs, never storage keys.
- Public product DTOs are explicit projections; they never serialize `ProductConfig`, provider identifiers, GLB URLs, mesh names, carton internals, ICC paths, or production-only option values.

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

The project client completes this read before its first create mutation. This prevents React remounts from racing two initial mutations before a fresh browser has received its signed guest cookie. Blank/template actions still carry an idempotency UUID; the cookie defines ownership and the UUID only deduplicates a mutation within that owner.

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

The server independently resolves product identity/configuration, validates compatibility and placeholders, and creates a normal project. The mutation is owner scoped, same-origin checked, rate limited, and idempotent. Image-backed template instantiation currently fails explicitly until the platform-owned template asset adapter exists.

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

API DTOs are defined in `src/platform/products/public-types.ts`, `src/platform/projects/types.ts`, `src/platform/templates/types.ts`, and `src/platform/production/types.ts`, separate from repository rows and `ProductConfig`. Project and artifact DTOs expose immutable provenance but not internal version snapshots or storage rows. Additive v1 changes remain possible; incompatible public changes require a new version or an explicit compatibility period.

Not yet exposed: guest claim, project revision history, permanent deletion, signed object-store URLs, authenticated template/product admin mutations, artifact approval/order linkage, pricing, and bulk personalization jobs. The internal product draft/validate/publish service and audit transaction are implemented, but deliberately have no HTTP route until an operator identity provider is connected.
