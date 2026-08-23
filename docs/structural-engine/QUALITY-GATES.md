# Structural Engine Quality Gates

## Verdicts

Allowed verdicts are:

- `PASS`
- `FAIL`
- `BLOCKED`
- `NEEDS_REFERENCE`

Passing tests or producing a recognizable screenshot is not sufficient for a
structural `PASS`.

## Fixed 100-point score

Weights must not be changed to make a result pass.

### A. Geometric correctness - 30 points

| Item | Points |
|---|---:|
| A1. Physical dimensions | 4 |
| A2. Outer contour accuracy | 6 |
| A3. Crease position accuracy | 5 |
| A4. Tabs/notches/curves accuracy | 4 |
| A5. Internal holes/windows | 3 |
| A6. Panel topology | 4 |
| A7. Flat 3D/source equivalence | 4 |

### B. 2D to 3D mapping - 20 points

| Item | Points |
|---|---:|
| B1. Correct UV placement | 5 |
| B2. No mirroring | 4 |
| B3. No unexpected rotation | 3 |
| B4. Cross-crease continuity | 3 |
| B5. Physical-scale correspondence | 3 |
| B6. Flat/folded mapping stability | 2 |

### C. Fold/unfold quality - 18 points

| Item | Points |
|---|---:|
| C1. Crease-aligned pivots | 4 |
| C2. Correct target angles | 3 |
| C3. Correct sequence | 3 |
| C4. Forward/Backward reversibility | 2 |
| C5. No popping | 2 |
| C6. No accumulated drift | 2 |
| C7. Motion polish | 2 |

### D. Dieline visual quality - 12 points

| Item | Points |
|---|---:|
| D1. Crisp vector lines | 3 |
| D2. Consistent screen-space strokes | 2 |
| D3. Professional cut/crease semantics | 2 |
| D4. Dimension/ruler quality | 2 |
| D5. Accurate joins/curves | 2 |
| D6. Visual hierarchy | 1 |

### E. 3D visual quality - 10 points

| Item | Points |
|---|---:|
| E1. Correct structural silhouette | 3 |
| E2. Board thickness/material response | 2 |
| E3. Edges/cut-outs | 2 |
| E4. Lighting/presentation | 1 |
| E5. Artwork fidelity | 2 |

### F. Engineering quality - 10 points

| Item | Points |
|---|---:|
| F1. Canonical source of truth | 2 |
| F2. Automated tests | 2 |
| F3. Visual regressions | 1 |
| F4. Deterministic behavior | 1 |
| F5. Performance | 1 |
| F6. Backward compatibility | 1 |
| F7. Debug/inspection tooling | 1 |
| F8. Documentation | 1 |

## Production-core pass threshold

All conditions are mandatory:

- total score at least `94/100`;
- geometric correctness at least `28/30`;
- mapping at least `19/20`;
- fold/unfold at least `16/18`;
- no hard-gate failure;
- no P0 issue;
- independent final-judge approval;
- regression suite pass;
- required final artifacts present.

The stretch target after first PASS is 97+, provided improvements remain
measurable and do not compromise structural truth.

## Hard gates

Any failure below produces overall `FAIL`, regardless of score.

| Gate | Requirement |
|---|---|
| G1 | Physical dimensions are correct. |
| G2 | Flat 3D outer boundary reproduces source structural geometry. |
| G3 | Every source window/cut-out exists in actual 3D geometry. |
| G4 | No intended outside artwork surface is mirrored. |
| G5 | Artwork does not jump at a crease. |
| G6 | 3D geometry derives from the production dieline. |
| G7 | Production export consumes the same canonical structure. |
| G8 | Forward/Backward does not accumulate transform drift. |
| G9 | Every fold pivot derives from its source crease. |
| G10 | Unknown production geometry is not silently guessed. |
| G11 | Raster evidence is not treated as exact manufacturing geometry. |
| G12 | Existing production-critical tests do not regress. |

## Geometric tolerances

All structural error is measured in millimetres, separately from pixel/image
error.

| Measurement | Initial gate |
|---|---:|
| Vector normalization drift | <= 0.01 mm |
| Endpoint snapping distance | <= 0.01 mm unless the source profile explicitly declares another value |
| Crease/pivot position | <= 0.01-0.05 mm, reported per crease |
| Mathematically derived flat boundary | <= 0.05 mm maximum bidirectional distance |
| Render-derived flat visual boundary | <= 0.10 mm equivalent |
| Curve tessellation chord error | <= 0.05 mm |
| UV/sheet round-trip | <= 0.05 mm provisional engineering target |
| Terminal hinge angle | Assigned exactly to authored target at settle |
| 100-cycle drift | 0 degrees after target snap; panel geometry and UV buffers unchanged |

The golden source contains deliberate approximately 0.3 mm details. A repair
report must distinguish numerical snapping within tolerance from any proposed
larger repair. Repairs outside tolerance require human approval and cannot be
silent.

## Required geometry metrics

For source versus derived flat geometry calculate and report:

- maximum distance;
- RMS distance;
- bidirectional Hausdorff distance;
- perimeter difference;
- area difference;
- segment/source-provenance correspondence where available;
- high-resolution silhouette intersection, union, XOR, and IoU.

Outer contours and holes are scored separately. An accurate outer silhouette
cannot hide a missing window.

For every crease report:

- endpoint error;
- length error;
- angular error;
- point-to-line distance;
- neighboring panel IDs;
- round-trip from the 3D hinge axis to canonical dieline coordinates.

## Mapping gates

Mapping verification must use asymmetric diagnostics, including:

- `FRONT ->`, `BACK ->`, `LEFT ->`, `RIGHT ->`, `TOP`, and `BOTTOM`;
- TL/TR/BR/BL corner markers;
- sequential numbers;
- arrows and text crossing creases;
- a non-mirror-symmetric symbol;
- samples near the window and outer cut edge.

For each sample, perform:

```text
dieline point -> UV -> flat panel surface -> recovered dieline point
```

The same UV buffers must remain attached through every fold state. Decorative
or symmetric artwork alone cannot pass chirality.

## Animation gates

For every transition capture start, 25%, 50%, 75%, and settled frames. Verify:

1. correct moving panel;
2. exact crease pivot;
3. fold direction;
4. authored target angle;
5. authored sequence and intentional overlap;
6. no popping, spring overshoot, or geometry replacement;
7. artwork attachment;
8. coherent reverse behavior.

Run 100 assembled-to-flat-to-assembled cycles and a rapid interleaved command
sequence. Angles always animate toward absolute targets and are assigned the
exact target on settle.

## Dieline visual gates

Capture at 25%, 50%, 100%, 200%, and 400% zoom. Check screen-space line width,
text sharpness, semantic dash patterns, curves, joins, dimension alignment,
and artwork hierarchy.

The visual verifier scores each reference comparison from 0 to 5 for:

- contour fidelity;
- curve quality;
- cut-line crispness;
- crease-line crispness;
- bleed geometry;
- dimension rendering;
- canvas cleanliness;
- zoom quality;
- selection quality;
- artwork readability.

Minimum: `45/50`. Stretch: `48/50`.

## Checker separation

The structural implementer produces artifacts but cannot issue the final
verdict. Independent roles are:

- Benchmark Analyst;
- Structural Implementer;
- Geometric Verifier;
- Mapping Verifier;
- Visual Verifier;
- Animation Verifier;
- Regression Verifier;
- Final Quality Judge.

Where possible, the Final Quality Judge receives the goal, references,
acceptance criteria, build artifact, test commands, and verifier evidence in a
fresh context without maker self-assessment.

## Checker report schema

Every checker report uses:

```text
STATUS: PASS | FAIL | BLOCKED | NEEDS_REFERENCE
SCORE: x/y
HARD GATES:
  G1 PASS | FAIL | NOT_EVALUATED
  ...
EVIDENCE:
DEVIATIONS:
SEVERITY: P0 | P1 | P2 | NONE
BLOCKING: yes | no
NEXT FIX: one concrete highest-impact change
CONFIDENCE: high | medium | low
```

Maker notes are not proof. Checkers inspect code, generated artifacts, metrics,
screenshots, tests, and source provenance directly.

## Quality-loop rules

Before each run:

1. Read root `QUALITY_STATE.md`.
2. Identify the highest-impact deviation.
3. Change one coherent major variable.
4. Run fast tests, then full relevant verification.
5. Generate geometric and visual artifacts.
6. Run independent checkers.
7. Record score before/after and every hard gate.
8. Append to `quality-run-log.md`.
9. Update `QUALITY_STATE.md` with current truth.

If the same blocker survives three serious attempts without meaningful metric
improvement, create `STALL_REPORT.md` and perform root-cause analysis rather
than changing another arbitrary constant.

## Required final approval artifacts

1. Reference inventory.
2. `quality-report.json`.
3. `QUALITY_STATE.md`.
4. `quality-run-log.md`.
5. Geometry metrics.
6. Flat/source overlay and difference visualization.
7. Assembled screenshot.
8. Every stable fold-state screenshot.
9. Fold/unfold video.
10. Diagnostic-artwork captures.
11. Production SVG/PDF verification.
12. Test output.
13. Performance output.
14. Regression report.
15. Remaining deviations.

## Stop condition

Stop only when every threshold and artifact above passes, no P0 issue remains,
and an independent final judge has issued `PASS`. A feature existing, tests
passing, or a screenshot looking recognizable is not the stop condition.
