# Production lifecycle

Status: P4 immutable server production artifacts and P5 authoritative manufacturing SVG are implemented. PDF normalization, physical preflight, PDF/X-oriented metadata, ICC output intent, and vector cut/crease layers remain the existing Vortex Print Engine; server adapters provide stable artwork and ICC bytes.

## Authoritative workflow

```text
owner-authorized project + exact immutable revision
                         │
                         ▼
exact ProductVersion + deterministic configuration
                         │
                         ▼
asset ownership / MIME / length / SHA-256 verification
                         │
                         ▼
normalizePrintJob() → preflightPrintJob()
                         │
                         ▼
ProductionExporter
  ├── PDF
  │   ├── Sharp artwork renderer at profile PPI
  │   ├── integrity-checked ICC loader
  │   └── existing PDF/X + technical-layer generator
  └── SVG
      └── normalized structural cut/crease/bleed paths in mm
                         │
                         ▼
object store bytes + SHA-256 + immutable SQLite metadata
                         │
                         ▼
owner-authorized ProductionArtifact DTO/download
```

The server ignores browser `src` values and resolves every image through its stable project-owned `assetId`. Original dimensions, MIME type, and name are canonicalized from server metadata before effective-PPI checks. The stored bytes must still match that metadata and checksum at generation time.

## Artifact contract

`ProductionArtifact` records:

- opaque artifact and project IDs;
- exact project revision;
- exact product version and configuration identity;
- format/MIME type and customer filename;
- byte size and SHA-256;
- the complete preflight report used for generation;
- server-only storage key and creation time.

Public DTOs omit `storageKey` and expose an owner-authorized `downloadUrl`. Artifact metadata has a unique `(projectId, projectRevision, kind)` constraint. Repeating or racing generation for the same revision returns the one existing artifact; losing concurrent object writes are removed.

PDF and SVG are distinct immutable artifacts for the same revision. Schema v6 permits one of each and enforces the matching kind/MIME pair in SQLite. Artifact downloads use attachment disposition, no-store caching, `nosniff`, same-origin resource policy, and a sandbox CSP.

## Immutability and status

Generating artifact A from revision 10 does not lock the project. A later edit creates revision 11 and resets `ready_for_preflight` or `production_ready` to `draft`. Artifact A remains byte-for-byte unchanged and downloadable. Generating revision 11 creates artifact B.

Successful preflight can transition the matching current revision to `ready_for_preflight`. Successful artifact persistence transitions only the still-current matching revision to `production_ready`. Historical generation never changes the current project's status. Archived projects retain authorized artifact access for future reprint workflows.

The server verifies stored artifact MIME type, length, and SHA-256 again before download. A missing or corrupt immutable artifact fails closed; it is never silently replaced under the same record.

## Rendering adapters

`generateProductionPdf()` still owns PDF construction. It accepts environment adapters but independently reruns core preflight, so an injected report cannot bypass geometry/PPI checks.

- Browser canvas rendering remains available to internal callers for compatibility.
- Server project previews and production artwork share one SVG/object renderer over `SurfaceDesign`.
- Sharp renders production artwork at the profile's physical PPI and applies the existing section `textureRotation` contract.
- JPEG/WebP artwork is decoded, oriented, and normalized before server composition.
- Relative public ICC assets are read from the constrained public root and verified by configured length/SHA-256; remote profiles require HTTPS and reject redirects.

## Manufacturing SVG

`normalizeManufacturingGeometry()` is the shared physical intermediate for manufacturing formats. It reads the exact version-resolved `CartonSpec`, preserves semantic `cut`, `crease`, and `bleed` operations, keeps open/closed paths explicit, validates finite in-bounds millimetre coordinates, and refuses any mismatch between the structural blank and resolved print surface.

The SVG exporter emits deterministic, unit-explicit geometry:

- `width`/`height` in `mm` with a matching millimetre `viewBox`;
- separate semantic groups for cut, crease, and bleed;
- product, version, configuration, surface, unit, and sheet-size metadata;
- profile-defined technical line widths;
- no customer artwork, JavaScript, external resources, or provider paths.

The exporter currently supports exact one-sheet carton structures. It is deliberately hidden/rejected for non-structural products and for historical configs whose surface size does not match their structural spec.

## Safety boundaries

- Product ID/version/configuration, dimensions, PPI, profile, and status are resolved server-side.
- Project, revision, assets, metadata, and artifact content are owner scoped; UUID knowledge is not authorization.
- Generation and preflight mutations require same-origin context and separate rate-limit buckets.
- Visual embroidery treatment fails production preflight explicitly. Vortex does not claim DST/PES or machine-ready embroidery output.
- Generic/simulated printer profiles remain warnings until a receiving factory approves the physical workflow.
- Editable text currently renders through host font resolution. An authenticated operator can register immutable private TTF/OTF assets with SHA-256 and licensing provenance, but those assets are not yet bound into the renderer and artifact provenance. Missing assets receive `SERVER_FONT_APPROVAL_REQUIRED`; registered families receive `SERVER_FONT_RENDERER_BINDING_REQUIRED`. Both warnings remain until deterministic renderer binding is proven—registration alone does not claim reproducibility.

## Export boundary and remaining limits

`ProductionExporter` is format-neutral and now registers PDF and SVG. CFF2 remains gated by the documented interoperability requirements in `docs/research/CF2.md`; without real receiving-CAD fixtures and partner line-type profiles it is neither implemented nor presented to customers.

Generation is synchronous in the initial modular monolith. It is bounded and rate limited, but large production work will eventually need a durable job adapter with retries/timeouts; no distributed queue is introduced prematurely. SQLite and the filesystem object store remain single-node development adapters.
