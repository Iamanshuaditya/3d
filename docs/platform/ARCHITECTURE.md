# Vortex platform architecture

Status: P0 project persistence, P1 versioned product configuration, P2 editable templates/personalization, and P3 page-aware Studio presentation are implemented on `feat/vortex-platform-p0-projects`. Server production remains the next target boundary.

## Invariants

1. `DesignDocument` is the only customer-design source of truth.
2. The 2D editor mutates that document; 3D, previews, and production derive from it.
3. Uploaded artwork is identified by stable `assetId`, never by a browser object URL.
4. Physical product dimensions govern 2D scale and production output. Screen pixels do not.
5. A successful project update creates a new immutable revision.
6. Published product versions are immutable; approved production artifacts will be immutable.
7. Public DTOs never contain filesystem paths, storage keys, or secrets.
8. Published template versions target exact immutable product configurations.
9. Template instantiation creates a normal project; previews and personalization never become a second design model.
10. A page is navigation metadata referencing an editable surface; it is not a mesh or a second design document.
11. Studio Preview reads live design state. It is not an immutable production artifact.

## Modular-monolith boundaries

```text
ProductDefinition + immutable ProductVersion + OptionSelection
                    │
                    ▼
       ResolvedProductConfiguration / ProductConfig
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
DesignTemplateVersion     blank document
          │                   │
          └──── instantiate ──┘
                    │
                    ▼
DesignProject ── DesignDocument ── stable ProjectAsset references
      │                 │
      │                 ├── page/surface navigation → 2D editor
      │                 ├── CanvasTexture → Three.js preview
      │                 ├── chrome-free Studio Preview
      │                 ├── server preview cache
      │                 └── print normalization
      │
      ├── immutable project revisions
      ├── owner-scoped API
      └── future production snapshots
```

The current platform stays inside the Next.js application. Domain contracts live in `src/platform`, server implementations in `src/server`, versioned HTTP adapters in `src/app/api/v1`, and Studio clients in `src/lib/projects`. React components do not call SQLite or object storage.

## Implemented P0 modules

| Boundary | Contract | Current adapter |
| --- | --- | --- |
| Project persistence | `ProjectRepository` | SQLite in `src/server/persistence` |
| Artwork bytes | `ObjectStore` | Atomic local filesystem store |
| Ownership | `ProjectOwner`, `AuthenticationProvider` | Signed guest identity; auth-provider seam |
| Application logic | `ProjectService` | Create/open/save/list/duplicate/archive/claim/preview |
| Public API | `/api/v1/projects/*` | Next.js Node route handlers |
| Studio persistence | `useProjectSession` | Debounced, ordered, revision-CAS autosave |
| Product catalogue | `ProductCatalogRepository` | SQLite definitions and immutable version snapshots |
| Option resolution | `ProductOption`, `ProductConfigurationProvider` | Deterministic central resolver + legacy static adapter |
| Version binding | `productVersionId`, `configurationId` | Exact-version project create/save/duplicate/preview |
| Template catalogue | `DesignTemplateDefinition`, immutable `DesignTemplateVersion` | SQLite + checked code fixtures |
| Personalization | explicit element binding + bounded `PersonalizationData` | Materialized into the same `DesignDocument` |
| Template application | `TemplateService` | Exact-configuration, owner-scoped, idempotent project creation |
| Studio presentation | `ResolvedStudioPresentation` | Page/print-area/web navigation + capability-driven layout |
| Live Preview | Same `DesignDocument` and renderer contracts | Read-only 2D proof or existing live 3D/unfold view |

SQLite and local filesystem storage are intentionally development/single-node adapters. The domain interfaces permit PostgreSQL and S3/R2 adapters without changing Studio or `DesignDocument`.

## Runtime data

Development data defaults to `.data/`:

- `.data/vortex.sqlite`: projects/revisions plus immutable product and template catalogues.
- `.data/objects/`: artwork and preview bytes plus content-type metadata.
- `.data/guest-cookie-secret`: a generated local signing secret.

Set `VORTEX_DATA_DIR` to relocate all development data. Production requires `VORTEX_GUEST_COOKIE_SECRET`, containing at least 32 random bytes encoded as base64url. Production deployments must mount durable storage or replace the local adapters.

## Security boundaries

- Every repository lookup includes owner type and owner ID; a UUID alone is never authorization.
- Guest IDs are random UUIDs in signed, HTTP-only, SameSite cookies.
- Mutations enforce same-origin checks and owner-scoped rate-limit buckets.
- Uploads require a bounded request length and are fully decoded with pixel/byte limits.
- MIME type, dimensions, and checksum come from server decoding, not client claims.
- Filesystem keys are generated from UUIDs and checked against traversal.
- Revision compare-and-swap rejects stale writers with HTTP 409.

The in-memory rate limiter is a boundary, not a multi-instance production solution. A shared limiter should replace it when horizontally scaling.

## Next boundaries

P4 moves production artifact generation behind immutable server snapshots. P5 then extends authoritative structural geometry into manufacturing SVG and, only if the researched specification is implementable without guessing, CFF2. Template artwork later adds a platform-owned asset scope rather than weakening project ownership. These extend the graph above; they do not create parallel design engines.
