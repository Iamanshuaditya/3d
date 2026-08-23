# P3 milestone report — presentation modes, pages, and Preview

Date: 2026-08-23

Branch: `feat/vortex-platform-p0-projects`

Baseline: `main` at `c88b3fd`

## 1. What the repository already provided

`DesignDocument.surfaces` already supported independent artwork areas, while `EditableSurface.sections` correctly mapped one continuous packaging web into multiple physical panels/meshes. `SurfaceSelector` could switch technical surfaces, and `resolveProductPresentation` plus `useUnfold` already described real mechanical open/unfold behavior. The Studio, however, discarded P1's resolved presentation mode, always reserved a split 3D pane, had no explicit viewing experience, and did not distinguish page navigation from print areas or continuous webs.

The repository has no real flat/front-back customer SKU. T-shirt has only one authored `front-chest` surface. Those facts constrained P3: add the platform contract and capability-driven composition without fabricating unsupported surfaces or reinterpreting packaging panels as pages.

## 2. Architecture chosen and why

- Optional `EditableSurface.presentation` describes a surface as an explicitly ordered page, independent print area, or continuous production web.
- `ResolvedStudioPresentation` is derived navigation/UI metadata. It references existing surface IDs and never creates a second design model.
- Legacy surfaces infer only facts already in their geometry: sections imply a continuous web; otherwise they remain print areas. Pages require explicit authoring.
- P1's immutable product-version presentation mode is now the Studio layout authority.
- `2d-first` renders a full-width editor and a read-only 2D artwork proof; other modes retain the proven 2D/3D path.
- Preview consumes the active customizer, existing `DesignEditor`/`Product3DViewer`, textures, treatment maps, and unfold state. It is not a flattened image or production artifact.

This preserves both primary invariants: one document drives every view, and page identity never becomes mesh identity.

## 3. Exact files added or changed

Domain and resolution:

- `src/types/configurator.ts`
- `src/platform/presentation/types.ts`
- `src/platform/presentation/resolve-studio-presentation.ts`

Studio and renderers:

- `src/app/studio/page.tsx`
- `src/components/studio/StudioShell.tsx`
- `src/components/studio/StudioTopBar.tsx`
- `src/components/studio/StudioPreview.tsx`
- `src/components/configurator/DesignEditor.tsx`
- `src/components/configurator/SurfaceSelector.tsx`
- `src/lib/configurator/use-customizer.ts`

Tests and documentation:

- `tests/platform/studio-presentation.test.ts`
- `docs/platform/PRESENTATION.md`
- `docs/platform/ARCHITECTURE.md`
- `docs/platform/PRODUCTS.md`
- `docs/platform/AUDIT-2026-08-23.md`
- `docs/platform/MILESTONE-P3-PRESENTATION.md`

## 4. Working end to end

- The exact resolved product-version mode reaches Studio instead of being discarded.
- Existing split, packaging, garment, embroidery, texture, and unfolding paths remain intact.
- A capability-driven Preview action removes editing chrome and suspends editing shortcuts.
- 2D-first configurations show a read-only proof from the same design state.
- 3D configurations show the same live texture/material treatment and authoritative mechanical presentation.
- Page/print-area/web navigation is ordered independently from mesh names.
- Preview is keyboard-contained, Escape-closeable, and restores focus to the initiating control.

## 5. Tests executed and results

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 101 passed, 0 failed.
- Full `npm run check`: passed, including the production Next.js build and every versioned project/template route.
- Chrome on localhost:8082:
  - opened the persisted T-shirt project, entered Preview, verified editing controls were absent, and returned with the same layers/design intact;
  - opened Mailer Box, entered Preview, advanced the real unfold control from step 1 to step 2, and observed the model change;
  - browser console contained only the repository's pre-existing Three.js deprecation warnings.

## 6. Remaining limitations and risks

- There is no real front/back product fixture. Synthetic resolver coverage proves the model, but visual acceptance awaits an onboarded flat product with authoritative surfaces.
- Preview is a live customer view, not a server-frozen production proof; its wording deliberately avoids claiming otherwise.
- Explicit presentation metadata changes a published product contract and therefore requires a new immutable product version when first added to a real SKU.
- Product surface migrations need explicit artwork mapping; P3 does not silently remap an older project.
- Existing T-shirt, pouch, carton, bottle, counter-display, static GLB, embroidery, and unfolding capabilities remain bounded by their already documented product/onboarding constraints.

## 7. Next highest-value milestone

P4: move production authority behind the server. Freeze an exact owner-authorized project revision, validate its stored product version/configuration and assets, run normalization/preflight, generate and checksum an immutable artifact, persist its report/metadata, and expose an owner-scoped API. Browser `Download PDF` must no longer be the production system of record.
