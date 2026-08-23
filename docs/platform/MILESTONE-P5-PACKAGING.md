# P5 milestone report — parameterized packaging and manufacturing SVG

Date: 2026-08-23

Branch: `feat/vortex-platform-p0-projects`

Baseline: `main` at `c88b3fd`

## 1. What the repository already provided

The existing carton system was already the right foundation: `CartonSpec` carried physical panel rectangles, a parent/hinge graph, authored progressive-unfold steps, optional manufacturing cut/crease/bleed paths, and board thickness. `carton-geometry.ts` derived the procedural folded model and UVs from it, while `resolve-dieline.ts` scaled its paths into the editor. The Mailer was a proven fixed 240×160×60 mm specification.

The platform gap was resolution and lifecycle. Mailer dimensions were fixed in `product-config.ts`; no customer option provider could generate a new structure. Several consumers looked up a global `cartonSpecId`, which could not represent an immutable per-configuration result. There was no manufacturing exporter outside the existing PDF technical layers.

The audit also found a real historical drift: Mailer v2's editor/PDF surface is 376×554 mm, while the fixed structural spec is 376×552 mm. Rewriting v2 would violate product-version reproducibility.

## 2. Architecture chosen and why

- Turn the existing Mailer spec into a pure parameterized `createMailerBoxSpec()` factory while retaining the exact legacy `mailer-box` export.
- Publish `mailer-box-001@3` with validated length, width, depth, and board-thickness options and a versioned `mailer-box-0427-v1` provider.
- Embed the complete generated `CartonSpec` in the resolved `ProductConfig`; retain `cartonSpecId` as a legacy fallback.
- Route editor dielines, physical rulers, procedural 3D, camera framing, progressive unfolding, PDF normalization, and manufacturing export through `resolveCartonSpec()`.
- Derive surface dimensions, editor scale, section mappings, and model/camera values from the one generated spec. Do not recalculate a separate blank in UI or production.
- Add a format-neutral `ManufacturingGeometry` in millimetres, then serialize it through a registered `SvgProductionExporter`.
- Refuse SVG when a resolved print surface and structural blank disagree. This preserves old projects without pretending their mismatched v2 geometry is manufacturing-safe.
- Store SVG through the same owner-scoped, revision-bound, checksummed, immutable artifact lifecycle as PDF.
- Keep CFF2 disabled. Research supports a writer, but production claims require real receiving-CAD fixtures and partner-specific line-type profiles.

## 3. Exact files added or changed

Parameterized product/structure:

- `src/lib/configurator/mailer-box-spec.ts`
- `src/lib/configurator/product-configuration-providers.ts`
- `src/lib/configurator/product-definitions.ts`
- `src/lib/configurator/carton-spec.ts`
- `src/types/configurator.ts`
- `src/server/products/product-catalog-service.ts`
- `src/platform/products/configuration-resolver.ts`

Existing structural consumers:

- `src/lib/configurator/resolve-dieline.ts`
- `src/lib/configurator/presentation.ts`
- `src/components/configurator/Product3DViewer.tsx`
- `src/components/gallery/Product3DPreview.tsx`
- `src/components/studio/StudioShell.tsx`

Manufacturing production:

- `src/lib/print/manufacturing-geometry.ts`
- `src/lib/print/generate-manufacturing-svg.ts`
- `src/server/production/svg-production-exporter.ts`
- `src/platform/production/exporter.ts`
- `src/platform/production/types.ts`
- `src/server/production/container.ts`
- `src/server/production/pdf-production-exporter.ts`
- `src/server/production/production-service.ts`
- `src/server/persistence/database.ts`
- `src/server/storage/filesystem-object-store.ts`
- `src/app/api/v1/projects/[projectId]/production/artifacts/route.ts`
- `src/app/api/v1/production-artifacts/[artifactId]/content/route.ts`
- `src/app/api/v1/session/route.ts`
- `src/lib/production/client.ts`

Customer flow, fixtures, tests, and documentation:

- `src/components/products/ProductOptionConfigurator.tsx`
- `src/app/page.tsx`
- `src/app/templates/page.tsx`
- `src/app/studio/page.tsx`
- `src/components/studio/StudioTopBar.tsx`
- `src/components/templates/TemplateBrowser.tsx`
- `src/lib/projects/client.ts`
- `src/lib/projects/use-project-session.ts`
- `src/lib/templates/fixtures.ts`
- `tests/platform/product-configuration.test.ts`
- `tests/platform/production-artifact.test.ts`
- `docs/platform/ARCHITECTURE.md`
- `docs/platform/PRODUCTS.md`
- `docs/platform/PRODUCTION.md`
- `docs/platform/API.md`
- `docs/platform/AUDIT-2026-08-23.md`
- `docs/platform/MILESTONE-P5-PACKAGING.md`

## 4. Working end to end

- A customer configures Mailer length/width/depth/board thickness on the template/start screen.
- The central resolver validates the selection and produces a stable configuration identity.
- Starting blank creates a project pinned to Mailer v3 and that exact option selection.
- Blank creation first establishes the signed guest context, deduplicates concurrent remount work, creates the project, and only then navigates to a Studio URL containing its immutable project ID.
- The generated structure drives measured 2D rulers/dieline, assembled 3D geometry, UV section mapping, and the authored six-stage unfolding sequence.
- Server PDF uses the exact structural sheet dimensions.
- Structural products expose a manufacturing-SVG action; unsupported products do not.
- SVG has explicit millimetre bounds, semantic cut/crease/bleed groups, and version/configuration metadata.
- PDF and SVG coexist as separate immutable artifacts for one revision and are independently checksummed.
- Existing fixed product configs remain compatible. Historical Mailer v2 remains unchanged and cannot silently opt into the unsafe SVG path.

The acceptance configuration 200×150×70 mm resolves to one 356×568 mm sheet. Its base panel is exactly `{x: 78, y: 277, w: 200, h: 150}` mm in the shared structure.

## 5. Tests executed and results

- Target parameterized-product/production/geometry suite: 21 passed, 0 failed.
- Full `npm run check`: passed — lint clean, strict TypeScript clean, 110 tests passed, and the Next.js production build completed successfully with every expected v1 route.
- Integration coverage proves the 200×150×70 selection produces the same 356×568 mm physical bounds in the editor contract, structural spec, normalized manufacturing geometry, PDF media box, and SVG viewport.
- The same test constructs the real Three.js carton tree, applies the final authored unfold stage, and verifies every printed panel reaches the flat plane.
- SVG assertions cover millimetre dimensions, semantic operation groups, immutable product-version metadata, MIME type, checksum, and coexistence with the PDF artifact.
- Chrome on localhost:8082 configured the custom dimensions, created the v3 project, displayed 35.6×56.8 cm rulers, rendered the assembled model, traversed all six authored steps to “Fully unfolded,” and generated/downloaded revision-1 SVG and PDF artifacts.
- SQLite/object-store inspection confirmed distinct PDF/SVG records for the same project revision, with matching version provenance, MIME types, byte sizes, storage keys, and SHA-256 values.
- A fresh-cookie Chrome regression exposed and then verified the guest-bootstrap fix: one session bootstrap, one create mutation, one database row; hard reload performed owner-scoped GETs only and did not create another draft.

## 6. Remaining limitations and risks

- The current provider covers one FEFCO 0427-style construction. It is not a universal packaging CAD solver.
- Procedural 3D panels reproduce the authoritative panel layout and hinges, but their flat meshes remain rectangular board regions; the high-detail rounded/tapered outer cut contour is rendered/exported from the same spec rather than triangulated into every 3D panel edge.
- Construction-rule validation is intentionally conservative. Factory-specific tolerances, grain direction, scoring allowance, material bend compensation, locking clearances, and imposition remain production-partner work.
- Existing Mailer v2 retains its historical 2 mm mismatch. It needs an explicit reviewed migration if a customer project must move to v3.
- Manufacturing SVG is structural geometry, not proof that a receiving factory has approved line colors/widths or tool setup.
- CFF2 is not implemented. No compliant claim will be made without partner fixtures and round-trip verification.
- Parameterized template compatibility is exact. The bundled Mailer template targets the default v3 configuration; custom-size template adaptation is not guessed.

## 7. Next highest-value milestone

P6: expose stable `/api/v1/products` catalogue/version/configuration DTOs and build the first operator-facing draft/validate/publish foundation over the existing immutable catalogue and onboarding tools. Keep provider internals and filesystem paths private, make publishing create new versions, and preserve the CLI/Python geometry toolchain behind job boundaries.
