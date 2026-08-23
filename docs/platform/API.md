# Platform API

Status: version 1 exposes projects, artwork, and the public editable-template catalogue. Project DTOs are bound to immutable product versions/resolved configurations and carry optional template provenance. Public product resolution and production endpoints remain later boundaries.

## Conventions

- JSON unless an upload endpoint specifies multipart form data.
- Owner identity comes from an HTTP-only guest cookie or future auth provider.
- Owner data uses `Cache-Control: no-store`; authorized asset bytes are private-cacheable and immutable-version template previews are public immutable-cacheable.
- Mutations require same-origin browser context.
- Public DTOs contain authorized read URLs, never storage keys.

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

## Compatibility and evolution

API DTOs are defined in `src/platform/projects/types.ts` and `src/platform/templates/types.ts`, separate from repository rows and `ProductConfig`. Project and summary DTOs expose `productVersionId`, `configurationId`, validated `optionSelection`, and provenance; they do not expose internal version snapshots or storage rows. Additive v1 changes remain possible; incompatible public changes require a new version or an explicit compatibility period.

Not yet exposed: guest claim, project revision history, permanent deletion, production artifacts, public product option resolution, signed object-store URLs, template/product admin publishing, and bulk personalization jobs.
