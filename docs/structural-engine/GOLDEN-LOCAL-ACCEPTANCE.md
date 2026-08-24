# Golden Local Acceptance

The authorized CloudLab reference PDF is benchmark evidence, not a repository
fixture. Do not copy it into the repository and do not commit reports derived
from it unless redistribution permission is established.

## Source-only run

From a normal repository checkout with dependencies installed:

```bash
npm run verify:golden-local -- "/absolute/path/to/product_Lock Bottom and top incl. window_mm_300_150_200.pdf"
```

The default output directory is `.quality-local/golden/` and is ignored by Git.
A different private destination can be supplied with `--out`.

This mode proves everything that can be derived without inventing hidden
construction facts. It imports the named die separations, applies the
hash-locked topology profile, validates exact flat geometry and UVs, classifies
all 17 panels and all 16 physical crease chains, and certifies the 300 x 200 x
150 mm rectangular body tube in both mirror-equivalent handedness conventions.

A successful source-only run deliberately stops at:

```text
BODY_TUBE_CERTIFIED_REVIEWED_CONSTRUCTION_REQUIRED
```

That is a BLOCKED product state, not a failure and not a complete PASS.

## Reviewed-construction run

The source-only run also emits `golden-reviewed-construction-template.json`.
Fill that file only from reviewed evidence and run:

```bash
npm run verify:golden-local -- "/path/to/reference.pdf" \
  --construction "/private/evidence/golden-reviewed-construction.json" \
  --out "/private/evidence/golden-run"
```

The reviewed input supplies only facts that the PDF/video cannot safely infer:
board thickness, body mirror handedness relative to the printed/exterior side,
which sheet side is the physical top, the parent/child direction and signed
assembled angle of every non-body hinge, and the evidence-backed closure phase
grouping.

The compiler refuses missing or duplicated hinges, a reviewed parent/child pair
that contradicts exact source adjacency, cycles, multiple parents, incomplete
phase coverage, body hinges placed in closure phases, timing outside the
measured reference envelope, or unevidenced physical inputs.

When reviewed construction is supplied, the local verifier additionally:

- resolves all 16 authored hinges back onto the exact source crease spans;
- validates one connected 17-panel directed hierarchy;
- expands the four reviewed phases into an authored absolute-angle unfold plan;
- requires the plan to reach the exact flat pose with no dependency errors;
- executes 100 assembled-to-flat torture cycles;
- requires the same BufferGeometry objects to survive every cycle;
- requires every terminal hinge matrix to return to identity;
- requires the canonical flat mesh world pose to show no transform drift.

A successful reviewed run stops at:

```text
REVIEWED_CONSTRUCTION_RUNTIME_CERTIFIED_VISUAL_EVIDENCE_PENDING
```

It still does not automatically claim the visual/reference hard gates.

## Geometry and role contracts

The golden source is expected to preserve the reviewed 17-panel decomposition.
The five-panel body strip is:

```text
seam candidate -> broad plain -> narrow -> broad with real window -> narrow
```

There are six sheet-north and six sheet-south flap panels. `north` and `south`
are sheet-space names until reviewed construction assigns physical top/bottom.
The narrow strip remains only a seam candidate until construction evidence says
what adhesive/overlap behavior it has.

All 16 physical crease chains receive stable source-specific roles:

```text
4 body-chain
4 north-base
4 south-base
2 north-diagonal
2 south-diagonal
```

Generated planar edge IDs are never durable construction metadata.

## Local outputs

The source-only run writes:

- `golden-run-summary.json`
- `golden-acceptance.json`
- `golden-geometry-roles.json`
- `golden-hinge-roles.json`
- `golden-body-tube.json`
- `golden-construction-inventory.json`
- `golden-construction-template.json`
- `golden-reviewed-construction-template.json`
- `golden-diagnostic-art.svg`
- `golden-reference-behavior.json`

A reviewed-construction run additionally writes:

- `golden-reviewed-construction.json`
- `golden-resolved-rig.json`
- `golden-unfold-plan.json`
- `golden-runtime-certificate.json`

None of these outputs copy the proprietary source PDF.

## Mapping evidence protocol

Use `golden-diagnostic-art.svg` as one full-sheet artwork source. Capture the
canonical 2D sheet, exact structural 3D flat pose, erected body, secondary-flap
state, major-closure state, and final assembled state. Keep the camera fixed
while structural state changes.

A mapping PASS requires panel labels and orientation arrows to retain expected
chirality, all four asymmetric corner markers to retain identity, and
continuous artwork features to remain continuous across physically connected
creases. Never compensate for a bad structural UV map by rotating or mirroring
individual panel textures.

## Pass meaning

The command is intentionally fail-closed. Geometry and runtime success do not
turn the product-level report into PASS by themselves. Final PASS still requires
reviewed construction evidence plus fixed-camera visual captures scored against
the reference behavior, including the final closure/lock appearance and
professional CAD/prepress presentation quality.
