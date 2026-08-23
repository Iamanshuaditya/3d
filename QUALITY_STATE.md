# Structural Engine Quality State

## Goal

Build a structural-packaging engine in which the production vector dieline is
the single geometric authority for the editor, manufacturing output, panel
meshes, holes, hinge axes, flat pose, fold animation, and sheet-coordinate UVs.
The first acceptance target is the authorized local reference named "Lock
Bottom and top incl. window" at 300 x 150 x 200 mm.

The north-star invariant is:

```text
fully flattened 3D structural geometry == canonical production dieline
```

## Current benchmark

- Baseline commit: `7b26deeb82f7fcee534b9c785e3adc9cc2bdddb5`
- Current verified vector-domain commit: `9a9cec4`
- Current verified SVG-import commit: `b98436c`
- Current verified DXF-import commit: `eb704de`
- Baseline branch: `feat/structural-engine-v2`
- Benchmark audit date: 2026-08-24
- Golden source status: true vector PDF, available only as an authorized local
  file; redistribution permission is not established.
- Golden source SHA-256:
  `b6b8cda57f693275174abfb6e2e3d74411122eb1057feac086ecd26df27df557`
- Exact cut envelope: approximately `712.4 x 470.0 mm`.
- Exact vector evidence: one 70-edge outer cut cycle, one 8-edge window cut
  cycle, and 24 crease stroke segments resolving to 16 crease chains.
- Reference screenshots: six raster captures recorded by hash in
  `docs/structural-engine/REFERENCE-INVENTORY.md`.

## Current score

**STATUS: FAIL - UNSCORED**

No quality score is assigned yet. The canonical import, exact panel
extraction, exact flat mesh, window mesh, canonical manufacturing export,
diagnostic mapping evidence, and independent checker artifacts do not yet
exist for the golden carton. Assigning partial points before those artifacts
exist would create false precision.

| Area | Maximum | Current |
|---|---:|---:|
| Geometric correctness | 30 | Unscored |
| 2D to 3D mapping | 20 | Unscored |
| Fold/unfold quality | 18 | Unscored |
| Dieline visual quality | 12 | Unscored |
| 3D visual quality | 10 | Unscored |
| Engineering quality | 10 | Unscored |
| **Total** | **100** | **Unscored / FAIL** |

Hard-gate status is also **FAIL** because G2, G3, G6, G7, and G9 have not
been demonstrated for this source. This is an absence-of-evidence verdict,
not an assertion that every gate is presently violated.

## Hard blockers

1. The current carton panel contract is rectangle-oriented and has not been
   proven to reproduce this 70-edge blank or its window.
2. No independently accepted canonical vector import artifact exists yet for
   the local golden PDF; a corrected exact importer is under isolated review.
3. The PDF contains no fold direction, target angles, hierarchy, glue/tuck
   destinations, board thickness, or sequence. These require explicit,
   validated authoring; they must not be inferred silently.
4. Permission to redistribute the supplied PDF and screenshots in a public
   repository has not been established.
5. No fixed-camera fold video binary was included in the audited asset set, so
   motion timing remains reference-dependent rather than independently
   measured.
6. The golden PDF has no curves. A separate authorized or independently
   authored curve fixture is required to gate arc/Bezier preservation.

## Current deviations

- Source vectors, editor paths, panel meshes, and manufacturing paths are not
  yet demonstrated as one canonical structure.
- Existing flattened-carton tests primarily validate panel centers, coplanarity,
  and UV stability rather than bidirectional boundary equivalence.
- The mandatory window has not been demonstrated as a real hole in the same
  panel mesh through flat and folded states.
- No source-versus-flat overlay, distance heatmap, mask XOR, or Hausdorff report
  exists for the golden carton.
- No asymmetric diagnostic-artwork capture exists for every intended outside
  face.
- No golden stable-state capture set or fixed-FPS transition capture exists.
- The reference PDF emits individually stroked segments, including deliberate
  approximately 0.3 mm features; topology normalization does not yet prove
  those details survive.

## Last attempt

`RUN 003` adversarially verified the SVG importer after repeated checker-led
fail-closed and browser-contract repairs. The independent SVG gate passed
30/30. See
`quality-run-log.md`.

## Changes made

- Added canonical line, circular/elliptical arc, quadratic, and cubic vector
  primitives with retained affine transforms and source/segment provenance.
- Added semantic manufacturing operations, physical millimetre tolerances,
  adaptive curve flattening, exact analytic bounds and area, validation, and
  certified path-comparison metrics.
- Added an SVG importer that preserves vector semantics, CSS-pixel/physical
  unit ordering, nested transforms, and configurable operation classification
  while failing closed on unsupported clipping/masks, CSS geometry, active or
  conditional content, duplicate IDs, and ambiguous semantics.
- Repaired exact area to integrate in untranslated local coordinates and then
  apply the affine determinant, preventing large translations from disguising
  degenerate windows.
- Added exact planar DXF import for supported lines, polylines, bulge arcs,
  circles, ellipses, and single-span non-rational splines, with configurable
  semantic layers and retained source provenance.
- Added raw-DXF preflight so parser-discarded extrusion/elevation/width/count
  metadata and malformed legacy POLYLINE sequences fail before they can be
  simplified or hang the dependency.
- Did not commit proprietary source assets, screenshots, or guessed fold
  metadata.

## Metrics before

- Golden contour error: not measured.
- Golden crease error: not measured.
- Golden hole error: not measured.
- Golden UV round-trip error: not measured.
- Golden cycle drift: not measured.
- Golden quality score: unscored.

## Metrics after

Golden-carton metrics remain unmeasured because its canonical PDF artifact and
panel topology are not yet committed. The scoped canonical-vector gate is
independently **PASS 30/30**; this is not substituted for the product-level
100-point score.

## Screenshots generated

None committed. A temporary 144 DPI PDF render was inspected during the audit,
but proprietary source-derived raster evidence remains outside the repository.

## Tests

The baseline evidence below remains applicable. Additional current vector
verification used Node `24.19.0`:

| Check | Result |
|---|---|
| `npm ci` | PASS - 739 packages, 0 vulnerabilities |
| `npm run lint` | PASS - 0 errors |
| `npm run typecheck` | PASS - 0 errors |
| `npm test` | PASS - 156/156 after installing the repository's declared isolated Python onboarding dependencies |
| `npm run build` | ENVIRONMENT BLOCKED - Turbopack/PostCSS worker could not bind a local port (`EPERM`) after font-network access was granted |
| `npm run build -- --webpack` | PARTIAL ENVIRONMENT EVIDENCE - compilation and TypeScript passed and a `BUILD_ID` was written; the runner did not report completion after page-data collection |

Current scoped evidence:

| Check | Result |
|---|---|
| canonical vector tests | PASS - 36/36 |
| independent adversarial vector gate | PASS - 30/30 |
| independent adversarial SVG gate | PASS - 30/30 |
| independent adversarial DXF gate | PASS - 30/30 |
| current structure suite | PASS - 62/62 |
| `npm run typecheck` | PASS |
| scoped ESLint | PASS |
| `git diff --check` | PASS |

The committed platform report at this same baseline records a prior complete
production build PASS. This run does not replace that evidence or misreport its
environment-blocked fresh build as a pass.

## What improved

- Structural geometry now has a tested vector-semantic domain rather than a
  rectangle/sampled-point-only authority.
- Sparse Hausdorff comparisons cannot falsely certify an unsampled deviation;
  ambiguous evidence reports `indeterminate`.
- Degenerate, open, self-crossing, ill-conditioned, overflowing,
  provenance-conflicting, or topology-mismatched source geometry fails
  explicitly.
- Large affine translations no longer create false structural area.
- Supported DXF vector entities now normalize into the same canonical domain;
  unsupported/malformed geometry fails instead of being sampled, flattened,
  projected, or assigned contradictory physical units.
- SVG absolute geometry units now follow the browser/spec contract: physical
  units resolve to CSS user units before the retained `viewBox` CTM. CSS,
  active content, conditional rendering, clipping, masking, and unsupported
  structural elements can no longer silently change certified geometry.

## What regressed

None observed in the scoped suite. Product-level regression and build evidence
must be rerun after the import/topology integration is committed.

## Next highest-impact fix

Complete and independently verify the exact local vector-PDF importer, then
build normalized planar topology from that canonical artifact. The checker
must prove lossless preservation of the two cut cycles, 24 crease segments,
named spot separations, transforms, deliberate 0.3 mm details, and the real
window loop before panel meshes begin.

## Attempts on current blocker

3 scoped implementation runs have independent 30/30 passes: the vector domain,
SVG import, and DXF import. PDF import and golden topology are active isolated
attempts, not yet accepted or merged.
