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

## Repository truth

- Current post-merge baseline: `381233e81a89839a426bcd90480661be767ff8ea`.
- Structural-finalization merge: `2a957f026675e76f71828b6dd519d5c16c2944b1`.
- Golden source remains an authorized local vector PDF and is not committed.
- Golden source SHA-256:
  `b6b8cda57f693275174abfb6e2e3d74411122eb1057feac086ecd26df27df557`.
- Reviewed golden geometric evidence:
  - cut envelope approximately `712.3996 x 470.0005 mm`;
  - one 70-edge outer cut cycle;
  - one 8-edge real window cycle;
  - 24 source crease paints resolving to 16 physical crease chains;
  - exactly four hash-locked endpoint-to-cut-span topology associations, all
    approximately `0.01354–0.01467 mm`;
  - 17 physical panel regions and 16 crease adjacencies forming one connected
    tree.

## Current verdict

**STATUS: BLOCKED - ENGINE IMPLEMENTED, GOLDEN ACCEPTANCE INCOMPLETE**

This is no longer the earlier "PDF/topology not implemented" state. The
repository now contains the canonical PDF authority path, topology extraction,
structural panel mesh generation with holes, structural acceptance metrics,
construction authoring, structural rigging, canonical manufacturing routing,
Studio structural rendering, finite fold motion, and camera/fold separation.

The product is still not allowed to claim PASS because the supplied PDF does
not establish all physical construction semantics and the required golden
visual/reference evidence has not been completed.

## Verified implementation now present

- canonical vector domain in physical millimetres with retained provenance;
- exact/fail-closed SVG and DXF import paths;
- vector-PDF operator import and raw-PDF authority path;
- source-hash-locked golden topology profile;
- planar graph / panel extraction including real window ownership;
- exact non-rectangular structural panel meshes with holes and board depth;
- canonical sheet-coordinate UV mapping and chirality regression coverage;
- source-versus-flat structural acceptance metrics;
- geometry-only construction inventory that derives adjacency without
  inventing mountain/valley, angle, root, sequence, glue, tuck, or lock facts;
- hash-locked structural hinge rig and absolute pose evaluation;
- zero-degree pose restoring the canonical sheet and repeated-cycle no-drift
  regression coverage;
- finite fold timing with absolute targets, stagger/delay/duration support,
  reverse traversal, rapid retargeting, and reduced-motion snapping;
- Studio structural rendering using canonical structural authority;
- manufacturing geometry using the same canonical structural authority;
- CAD-style dieline linework;
- fold/unfold state no longer owns camera/orbit state;
- Node 24 + Python 3.13 quality workflows;
- current-NumPy planar-geometry compatibility fixes in onboarding build and UV
  validation paths.

## Hard-gate state

| Gate | Current state |
|---|---|
| G1 dimensions | Evidence available |
| G2 flat 3D equals source | Engine regression PASS; authorized golden run/evidence still required |
| G3 window is real geometry | Engine regression PASS; authorized golden evidence still required |
| G4 no mirrored artwork | Regression tested |
| G5 no artwork jump across creases | Partial; golden diagnostic-art capture incomplete |
| G6 3D uses production dieline | Canonical authority wired; golden run/evidence still required |
| G7 manufacturing uses same geometry | Regression tested |
| G8 repeated fold has no drift | Engine regression tested; golden runtime torture evidence still required |
| G9 hinge pivot / construction correctness | BLOCKED on certified golden construction metadata |
| G10 no silent structural guesses | PASS / fail-closed |
| G11 raster is never exact authority | PASS |
| G12 no production-critical regression | Final clean CI/build verification pending |

## Remaining evidence blockers

1. The golden PDF does not encode signed fold directions, target angles,
   definitive construction hierarchy/closure order, glue/tuck/lock
   destinations, or board thickness. These must be explicitly authored and
   validated from authorized construction/reference evidence rather than
   guessed from linework.
2. A fixed-camera golden fold recording / stable-state capture set has not been
   independently scored against the reference behavior.
3. Asymmetric diagnostic artwork across all intended outside faces has not yet
   been captured and scored for chirality, continuity, and seam behavior.
4. The authorized golden PDF must be executed through the current acceptance
   harness after the final code/CI baseline is fixed; its bytes remain local and
   must not be committed without redistribution permission.
5. The golden source contains no curve coverage, so curve preservation remains
   gated by independent non-proprietary fixtures rather than this carton.

## Latest checker result before this verification branch

The finalization PR checker reached 263/264 tests passing. Every structural,
mapping, rig, animation, manufacturing, Studio-authority, and camera-independence
regression passed. The sole failure was the legacy arbitrary-GLB onboarding
pipeline under NumPy 2.5. Two concrete compatibility defects were found:

- 2D `np.cross` use in onboarding outline/simplification code; fixed before the
  finalization merge;
- 2D `np.cross` use in UV triangle-area validation; fixed on `main` at
  `381233e81a89839a426bcd90480661be767ff8ea`.

No failing structural-packaging assertion was present in that checker run.

## Current score

The 100-point product score remains intentionally **unassigned**. Engine-level
regressions are strong enough to replace the former implementation blockers,
but scoring the golden fold/visual categories before their reference evidence
exists would still be false precision.

| Area | Maximum | Current |
|---|---:|---:|
| Geometric correctness | 30 | Awaiting final golden acceptance evidence |
| 2D to 3D mapping | 20 | Awaiting golden diagnostic-art evidence |
| Fold/unfold quality | 18 | BLOCKED on certified construction/reference behavior |
| Dieline visual quality | 12 | Awaiting scored reference captures |
| 3D visual quality | 10 | Awaiting scored reference captures |
| Engineering quality | 10 | Final clean CI/build pending |
| **Total** | **100** | **Unscored / BLOCKED** |

## Immediate stop condition for this branch

1. Run clean generated-file sync, dependency install, lint, typecheck, the full
   test suite, onboarding manifest validation, and production build in CI.
2. Fix any concrete regression rather than excluding or weakening the check.
3. When the complete checker is green, update `quality-report.json` and append
   the result to `quality-run-log.md`.
4. Do **not** convert product status to PASS until the golden construction and
   visual/reference blockers above are closed.
