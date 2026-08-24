# Finalization Checker Protocol

The implementation agent does not approve the golden product. The checker uses
code/test evidence, the authorized local golden run, reviewed construction
provenance, and visual captures. It reports only PASS, FAIL, BLOCKED, or
NEEDS_REFERENCE.

Required independent checks:

1. Fold-state code never owns or mutates camera/orbit state. A fixed product
   presentation rotation is allowed only outside the structural hinge tree.
2. Structural Studio rendering resolves exact canonical panel meshes whenever
   structural authority exists and preserves the legacy path otherwise.
3. Manufacturing geometry reads canonical structural authority and cannot fall
   back to a conflicting legacy dieline for that product.
4. Golden topology repair is source-hash locked, topology-only, <= 0.02 mm and
   exactly four endpoint-to-span repairs for the reviewed PDF.
5. The golden source retains exactly 17 panels and 16 physical hinge chains with
   the reviewed geometry-role and hinge-role classifications.
6. The body-tube certificate closes the two broad and two narrow walls into the
   reviewed 200 x 150 mm cross-section, keeps the real window on its source
   panel, and places the seam overlap on the closing side wall. Both mirror
   conventions may pass geometry; final chirality requires reviewed evidence.
7. Hidden construction facts are never inferred silently. Board thickness,
   physical top, body handedness, all 12 non-body parent/child directions and
   signed angles, and closure phase grouping must come from the reviewed input
   with non-empty evidence.
8. Reviewed construction resolves all 16 hinges back to exact source crease
   addresses, forms one directed 17-panel tree, and produces exactly four
   assembled-to-flat phases: final closure, major closure, secondary flaps,
   body.
9. Per-hinge motion stays inside the measured benchmark envelope: 450-700 ms,
   50-150 ms stagger for multi-hinge phases, easeInOutCubic, no bounce/spring.
10. The authored plan reaches the exact flat pose, and Forward/Backward traverse
    the same absolute state targets in opposite directions. Rapid input cannot
    create an out-of-range stage or cumulative angles.
11. The golden runtime certificate completes at least 100 assembled/flat cycles
    without rebuilding BufferGeometry, without non-finite transforms, with
    identity hinge matrices at flat, and with no measurable flat world-pose
    drift beyond the committed tolerance.
12. Fully flat structural geometry remains the canonical production dieline;
    the window remains physically empty and printed-face UVs remain in global
    sheet coordinates with correct chirality.
13. Dieline cut/crease technical linework remains non-printing UI and visually
    thin; raster content never becomes exact manufacturing authority.
14. Fixed-camera visual evidence covers canonical flat 2D, flat 3D, body erect,
    secondary flaps, major closure and final closure. Diagnostic labels, arrows,
    corner markers and continuous artwork must not mirror, swap or jump.
15. Lint, TypeScript, full tests and production build pass in a clean runner.
16. `quality-report.json` remains BLOCKED until both reviewed-construction
    runtime evidence and the required visual/reference evidence exist. CI
    success alone must never turn it into PASS.
