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

- Verified post-merge baseline: `381233e81a89839a426bcd90480661be767ff8ea`.
- Structural-finalization merge: `2a957f026675e76f71828b6dd519d5c16c2944b1`.
- Verification PR checker commit: `34ea4a85974259e98458b0e799aecc7124faa963`.
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

**STATUS: BLOCKED - ENGINE REGRESSION GATE PASS, GOLDEN ACCEPTANCE INCOMPLETE**

This is no longer the earlier "PDF/topology not implemented" state. The
repository now contains the canonical PDF authority path, topology extraction,
structural panel mesh generation with holes, structural acceptance metrics,
construction authoring, structural rigging, canonical manufacturing routing,
Studio structural rendering, finite fold motion, and camera/fold separation.

The engineering baseline is clean. The product is still not allowed to claim
PASS because the supplied PDF does not establish all physical construction
semantics and the required golden visual/reference evidence has not been
completed.

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

## Clean checker evidence

Two independent GitHub Actions workflows passed against verification commit
`34ea4a85974259e98458b0e799aecc7124faa963`:

- Structural Quality run `32699507367`: clean dependency setup, lint,
  typecheck, 264/264 tests, and production build all PASS.
- Repository CI run `32699507439`: generated-file sync, dependency setup,
  lint, typecheck, 264/264 tests, onboarding manifest validation, and production
  build all PASS.
- The real checked-in GLB onboarding test that exposed the NumPy 2.5 issues now
  passes through inspect, build, validate, and durable outputs.

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
| G12 no production-critical regression | PASS - clean dual-workflow CI and production build |

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
   harness against this verified baseline; its bytes remain local and must not
   be committed without redistribution permission.
5. The golden source contains no curve coverage, so curve preservation remains
   gated by independent non-proprietary fixtures rather than this carton.

## Current score

The 100-point product score remains intentionally **unassigned**. Engineering
quality can now be awarded its full 10/10 from the clean checker, but assigning
geometry/mapping/fold/visual points for the golden product before the remaining
reference evidence exists would still be false precision.

| Area | Maximum | Current |
|---|---:|---:|
| Geometric correctness | 30 | Awaiting final authorized golden acceptance run |
| 2D to 3D mapping | 20 | Awaiting golden diagnostic-art evidence |
| Fold/unfold quality | 18 | BLOCKED on certified construction/reference behavior |
| Dieline visual quality | 12 | Awaiting scored reference captures |
| 3D visual quality | 10 | Awaiting scored reference captures |
| Engineering quality | 10 | **10 / 10** |
| **Total** | **100** | **Unscored / BLOCKED** |

## Next work

1. Run the authorized golden PDF through
   `scripts/inspect-golden-construction.ts` on the verified baseline and persist
   the local acceptance report outside source control.
2. Obtain/author evidence-backed golden construction metadata for fold signs,
   target angles, root/hierarchy, board thickness, and closure/tuck/lock order.
3. Capture fixed-camera stable states and transitions plus asymmetric diagnostic
   artwork across every intended outside face.
4. Score geometry, mapping, fold behavior, dieline visual quality, and 3D visual
   quality against the benchmark.
5. Do **not** convert product status to PASS until every required hard gate and
   score threshold is satisfied.
