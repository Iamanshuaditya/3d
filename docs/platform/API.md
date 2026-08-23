# Platform API

Status: version 1 exposes the project and artwork surface. Project DTOs are now bound to immutable product versions/resolved configurations. Public product resolution, templates, and production endpoints will be added behind the same `/api/v1` boundary.

## Conventions

- JSON unless an upload endpoint specifies multipart form data.
- Owner identity comes from an HTTP-only guest cookie or future auth provider.
- Responses use `Cache-Control: no-store`, except authorized asset bytes which are private-cacheable.
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

## Compatibility and evolution

API DTOs are defined in `src/platform/projects/types.ts`, separate from repository rows and `ProductConfig`. Project and summary DTOs expose `productVersionId`, `configurationId`, and validated `optionSelection`; they do not expose the internal version snapshot or storage rows. Additive v1 changes remain possible; incompatible public changes require a new version or an explicit compatibility period.

Not yet exposed: guest claim, project revision history, permanent deletion, production artifacts, templates, public product option resolution, signed object-store URLs, and admin publishing.
