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
2. No canonical vector import artifact exists for the local golden PDF.
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

`RUN 000` established the baseline and audited the references without adding
or tracing proprietary geometry. See `quality-run-log.md`.

## Changes made

- Recorded exact-versus-observed benchmark evidence.
- Added the fixed 100-point quality contract and hard gates.
- Added a hash-only local fixture manifest and narrow private-asset ignores.
- Did not add production code, source assets, screenshots, or fold metadata.

## Metrics before

- Golden contour error: not measured.
- Golden crease error: not measured.
- Golden hole error: not measured.
- Golden UV round-trip error: not measured.
- Golden cycle drift: not measured.
- Golden quality score: unscored.

## Metrics after

Unchanged. This run records the measurement contract; it does not implement or
score the engine.

## Screenshots generated

None committed. A temporary 144 DPI PDF render was inspected during the audit,
but proprietary source-derived raster evidence remains outside the repository.

## Tests

Fresh verification at the baseline SHA used Node `24.19.0`:

| Check | Result |
|---|---|
| `npm ci` | PASS - 739 packages, 0 vulnerabilities |
| `npm run lint` | PASS - 0 errors |
| `npm run typecheck` | PASS - 0 errors |
| `npm test` | PASS - 156/156 after installing the repository's declared isolated Python onboarding dependencies |
| `npm run build` | ENVIRONMENT BLOCKED - Turbopack/PostCSS worker could not bind a local port (`EPERM`) after font-network access was granted |
| `npm run build -- --webpack` | PARTIAL ENVIRONMENT EVIDENCE - compilation and TypeScript passed and a `BUILD_ID` was written; the runner did not report completion after page-data collection |

The committed platform report at this same baseline records a prior complete
production build PASS. This run does not replace that evidence or misreport its
environment-blocked fresh build as a pass.

## What improved

- The benchmark can now be referenced by stable hashes and exact physical
  measurements without committing private evidence.
- Exact PDF content is separated from screenshot observations and authored
  construction metadata.
- The quality loop has an explicit FAIL state, fixed thresholds, and a
  checker-report contract.

## What regressed

None. This is documentation-only baseline work.

## Next highest-impact fix

Implement the canonical millimetre vector domain and source-provenance model,
then import the authorized local vector source without converting its
authoritative lines into sampled or hand-traced geometry. The first checker
artifact should prove lossless preservation of the two cut cycles, 24 crease
segments, named spot separations, transforms, and deliberate 0.3 mm details.

## Attempts on current blocker

0 implementation attempts. `RUN 000` is benchmark establishment only.
