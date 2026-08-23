# Vortex platform architecture

Status: the modular monolith now supports authenticated customers, signed guests and atomic guest claiming, immutable catalogue artwork/templates, an authenticated operator control plane, bounded GLB onboarding, private filesystem or S3-compatible object storage, durable bulk-personalization jobs, and a production-font registry boundary. `DesignDocument`, immutable product versions, and immutable project revisions remain the platform's central contracts.

## Invariants

1. `DesignDocument` is the only customer-design source of truth. The 2D editor mutates it; 3D, previews, personalization, and production derive from it.
2. Published `ProductVersion` and `DesignTemplateVersion` rows never change in place.
3. Every successful project save creates a new immutable revision through compare-and-swap.
4. Production binds `projectId + projectRevision + productVersionId + configurationId` and re-resolves all authoritative inputs server-side.
5. Browser identity, role, price, dimensions, configuration, readiness, asset metadata, checksums, and approvals are untrusted claims.
6. Stable private asset IDs replace browser object URLs and arbitrary remote URLs.
7. Public DTOs never contain storage keys, filesystem paths, provider internals, credentials, or wholesale engine configuration.
8. Template and bulk variants remain ordinary editable `DesignDocument` values rather than parallel render models.

## Resulting modular monolith

```text
Customer
   │
Better Auth session ── or ── signed guest cookie
   │                              │
   └──────── ProjectOwner ────────┘
                    │
                    ▼
ProjectService ─────────────── ObjectStore
     │                         filesystem | private S3/R2
     │
DesignDocument + immutable revision
     ├── 2D editor
     ├── Three.js preview
     └── production preflight/export
             ├── PDF
             └── manufacturing SVG

Operator
   │
Better Auth session + server-side grants
   │
Admin APIs/UI
   ├── product drafts → validate → immutable ProductVersion
   ├── template assets/drafts → validate → immutable TemplateVersion
   ├── production font registry
   └── onboarding jobs
          │
          ▼
    existing Python CLI
          │
          ▼
    immutable reports/artifacts + publication provenance
```

Domain contracts live under `src/platform`, server adapters under `src/server`, versioned HTTP adapters under `src/app/api/v1`, and customer integration code under `src/lib`. React components do not access SQLite, private object storage, or operator grants directly.

## Implemented boundaries

| Boundary | Contract | Adapter/state |
| --- | --- | --- |
| Customer authentication | `AuthenticationProvider` → `ProjectOwner` | Better Auth email/password sessions; provider IDs remain behind the owner projection |
| Guest identity and claim | signed opaque guest + authenticated owner | HMAC cookie; transactional project/dataset/job transfer and claim ledger |
| Operator authorization | explicit permission grants | SQLite grants plus explicit bootstrap IDs; roles are never read from request JSON |
| Project persistence | `ProjectRepository` | SQLite projects and immutable revisions |
| Private bytes | `ObjectStore` | atomic filesystem or AWS SigV4 S3/R2-compatible adapter |
| Product catalogue/publishing | catalogue, drafts, validation, audit | SQLite immutable versions and atomic publish transaction |
| Template catalogue/publishing | catalogue assets, drafts, validation, audit | private immutable assets and immutable template versions |
| Onboarding | durable job/service/runner boundary | bounded argument-array subprocesses over the existing Python tooling |
| Bulk personalization | owner-scoped datasets and jobs | private normalized dataset objects, durable job records, bounded manifest runner |
| Production fonts | immutable approved asset registry | private checksummed TTF/OTF records; renderer binding deliberately gated |
| Production | exporter/artifact repository | exact-revision PDF/SVG, private bytes, SHA-256 verification |
| Pricing | provider boundary and quote repository | server-resolved immutable quotes; development estimate disabled in production by default |
| PostgreSQL | target schema and verification harness | documented and fail-closed; runtime repositories are not yet ported |

## Runtime persistence

SQLite schema v16 stores projects/revisions/assets, auth sessions, owner-claim records, products/templates and drafts/audit events, onboarding jobs/assets, bulk datasets/jobs, quotes, production artifacts, operator grants, and production font metadata. Development defaults to `.data/vortex.sqlite` and `.data/objects`; filesystem bytes can be replaced with private S3/R2 through `VORTEX_OBJECT_STORE` without changing domain services.

SQLite remains the only runnable database adapter. `VORTEX_DATABASE=postgresql` fails closed until all transaction-sensitive repositories and Better Auth have real PostgreSQL implementations. See `POSTGRESQL.md`.

## Security and resource boundaries

- Authenticated user IDs come from server-verified sessions. Guest IDs come only from an HMAC-signed `HttpOnly`, `SameSite=Lax` cookie.
- Claiming requires both identities from the same request, is same-origin/rate-limit protected, uses a claim ledger, and clears the guest cookie after success.
- Owner-scoped reads include owner type and ID; knowing a UUID is not authorization.
- Operator routes require a server-resolved permission and return structured 401/403 errors without exposing catalogue metadata.
- JSON and multipart routes allowlist fields, enforce byte limits, and reject unsafe/unknown values.
- Artwork is fully decoded and bounded by bytes/pixels. GLBs are magic-checked, size bounded, run with argument arrays in per-job directories, and have bounded time/output capture.
- Private object-store credentials and keys remain server-only. Provider ETags never replace application SHA-256 checks.
- Production re-resolves exact immutable state and verifies every stored object before export/download.
- Structured events contain stable IDs and durations, never credentials, cookies, image bytes, or CSV values.

The current rate limiter and job runners are in-process boundaries. Horizontal deployment requires a shared rate limiter and external worker/lease implementation. This limitation is explicit; requests do not silently perform unbounded work.

## Remaining infrastructure gates

- Complete and exercise the PostgreSQL repositories before selecting that backend.
- Bind approved registered font bytes into server rendering and artifact provenance before removing font reproducibility warnings.
- Replace development pricing with real supplier pricing before checkout.
- Validate CFF2 and manufacturing formats against receiving-partner fixtures before advertising them.
- Supply production secrets, private bucket policy, database/volume deployment, and shared worker/rate-limit infrastructure.
- Configure the documented GitHub `main` branch protection rules if repository administration cannot be performed by the delivery environment.
