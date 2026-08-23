# Studio presentation, pages, and previews

Status: P3 is implemented. Product presentation now controls Studio layout, editable surfaces can carry explicit customer-navigation semantics, and Preview reads the same live `DesignDocument` as editing and 3D.

## The four identities

These concepts are related but deliberately not interchangeable:

| Concept | Owns | Does not imply |
| --- | --- | --- |
| Page | Customer navigation order such as front/back or page 1/page 2 | A Three.js mesh |
| Editable surface | One independently editable `SurfaceDesign` in `DesignDocument.surfaces` | A physical page or a single panel |
| Surface section | A measured rectangle within a shared production web | Independent design state |
| Mesh | A 3D texture consumer or interaction target | Page order or document ownership |

A front and back card can therefore expose two page-role surfaces even if its preview implementation uses differently named meshes. A pouch can expose one continuous-web surface containing front, back, and gusset sections consumed by several meshes. No second page document or 3D-owned artwork state is created.

## Contracts

`EditableSurface.presentation` is optional to preserve every existing `ProductConfig`:

```ts
type EditableSurfacePresentation =
  | { kind: "page"; pageNumber: number; side?: "front" | "back" | "inside" | "outside" }
  | { kind: "print-area"; order?: number }
  | { kind: "continuous-web"; order?: number };
```

`resolveStudioPresentation(config, mode)` creates ordered `EditorTarget` navigation metadata. Every target references an existing `surfaceId`; it never contains a second `SurfaceDesign`. It validates page numbers and explicit order values, and rejects duplicate page numbers.

Legacy inference is intentionally conservative:

- a surface with measured `sections` is a continuous production web;
- any other surface is an independent print area;
- pages are never inferred, because front/back semantics must be authored explicitly.

## Capability-driven modes

The immutable `ProductVersion.presentation.mode` is resolved with the product and passed into Studio:

- `2d-first`: the working canvas uses the available width and Preview renders a chrome-free, read-only 2D artwork proof;
- `2d-3d-split`: editor and live 3D preview remain side by side;
- `packaging`: split editing plus the product's authoritative open/unfold controls;
- `garment`: split editing plus the supported print or visual-treatment capabilities.

The mode selects UX composition. Structural presentation in `src/lib/configurator/presentation.ts` separately describes mechanical open/close or progressive unfolding. Keeping those contracts separate avoids treating every 3D product as a carton.

## Preview invariant

`StudioPreview` receives the active customizer state. It does not serialize, clone, flatten, or own a document:

- 2D proofs use `DesignEditor` in read-only mode;
- product previews use the same `Product3DViewer`, canvas textures, material maps, and unfold plan;
- surface/page changes update the existing active surface;
- editing shortcuts are suspended, background editing UI is inert, focus is trapped, and Escape returns to editing;
- the ordinary split-view WebGL renderer is temporarily unmounted to avoid duplicate rendering contexts.

Preview is a customer viewing experience, not an immutable production record. P4 server artifacts remain separately named and lifecycle-controlled.

## Current limits

- No registered customer product currently has an authored `2d-first` front/back page definition. The contract is covered with a synthetic flat-card test; a real SKU must be onboarded before exposing that workflow to customers.
- The current T-shirt truthfully exposes only `front-chest`; P3 does not invent back or sleeve areas.
- Focus containment is implemented, but a later shared application-modal primitive should consolidate this behavior if more full-screen dialogs appear.
- Server-generated preview artifacts remain raster catalogue/library previews. The Studio Preview is live and client-rendered.

