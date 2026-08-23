# Vortex platform architecture

Status: P0 project persistence and P1 versioned product configuration are implemented on `feat/vortex-platform-p0-projects`. Template and server-production domains remain target boundaries.

## Invariants

1. `DesignDocument` is the only customer-design source of truth.
2. The 2D editor mutates that document; 3D, previews, and production derive from it.
3. Uploaded artwork is identified by stable `assetId`, never by a browser object URL.
4. Physical product dimensions govern 2D scale and production output. Screen pixels do not.
5. A successful project update creates a new immutable revision.
6. Published product versions are immutable; approved production artifacts will be immutable.
7. Public DTOs never contain filesystem paths, storage keys, or secrets.

## Modular-monolith boundaries

```text
ProductDefinition + immutable ProductVersion + OptionSelection
                    │
                    ▼
       ResolvedProductConfiguration / ProductConfig
                    │
                    ▼
DesignProject ── DesignDocument ── stable ProjectAsset references
      │                 │
      │                 ├── 2D editor
      │                 ├── CanvasTexture → Three.js preview
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

SQLite and local filesystem storage are intentionally development/single-node adapters. The domain interfaces permit PostgreSQL and S3/R2 adapters without changing Studio or `DesignDocument`.

## Runtime data

Development data defaults to `.data/`:

- `.data/vortex.sqlite`: projects/revisions plus product definitions and immutable product versions.
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

P2 adds editable templates and explicit semantic bindings to the same `DesignDocument`. P3 adds page/presentation modes without equating pages to meshes. P4 moves production artifact generation behind immutable server snapshots. These extend the graph above; they do not create parallel design engines.
