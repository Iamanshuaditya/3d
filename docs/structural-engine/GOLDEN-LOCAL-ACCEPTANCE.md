# Golden Local Acceptance

The authorized CloudLab reference PDF is benchmark evidence, not a repository
fixture. Do not copy it into the repository and do not commit reports derived
from it unless redistribution permission is established.

## One-command run

From a normal repository checkout with dependencies installed:

```bash
npm run verify:golden-local -- "/absolute/path/to/product_Lock Bottom and top incl. window_mm_300_150_200.pdf"
```

The default output directory is:

```text
.quality-local/golden/
```

That directory is ignored by Git.

To choose another local directory:

```bash
npm run verify:golden-local -- "/path/to/reference.pdf" --out "/private/evidence/golden-run"
```

## What the command proves

The command reads the PDF bytes in place, computes the source SHA-256, imports
only the reviewed vector die separations, applies the source-hash-locked golden
topology profile, and evaluates the production geometry against the committed
expectations.

It checks the source hash, outer envelope, outer/window edge counts, crease
source count and physical crease chains, real window ownership, panel count,
four reviewed endpoint-to-span topology associations, flat panel equivalence,
and canonical-sheet UV round trip.

It also derives the construction adjacency inventory. Geometry may prove that
two panels share a physical crease; it does **not** prove fold sign, signed
angle, parent/child direction, root panel, board thickness, glue/tuck/lock
roles, or closure order.

## Stable geometry roles

The golden source has a reviewed five-panel body band and two six-panel flap
regions. The local runner derives stable geometry roles from exact physical
bounds instead of depending on generated face IDs.

The body strip is expected left-to-right as:

```text
seam candidate → broad plain → narrow → broad with real window → narrow
```

The remaining six panels above the body band are called `north-flap` regions
and the six below it are called `south-flap` regions. Those are sheet-space
names only. The classifier deliberately does **not** rename north/south as
physical top/bottom, or the seam candidate as a glue flap, because those are
construction semantics rather than vector facts.

## Local outputs

The runner writes local evidence without copying the PDF:

- `golden-run-summary.json` - compact acceptance result and gate summary;
- `golden-acceptance.json` - complete geometric acceptance report;
- `golden-geometry-roles.json` - source-locked body/flap geometry roles;
- `golden-construction-inventory.json` - topology repairs and crease adjacency
  evidence;
- `golden-construction-template.json` - source-locked authoring template whose
  unresolved physical facts remain `null`;
- `golden-diagnostic-art.svg` - deterministic asymmetric full-sheet artwork for
  visual mapping checks;
- `golden-reference-behavior.json` - video-observation benchmark states, motion
  windows, timing envelope, confidence levels and explicit unknowns.

The diagnostic SVG is deliberately not manufacturing geometry. It contains
unequal corner markers, sheet-direction labels, two non-symmetric crossing
lines, a grid, source hash, and a label/up-arrow for every extracted structural
panel. When used as artwork in both flat and folded views it makes horizontal
or vertical mirroring, 90/180 degree rotation, panel swaps, wrong chirality,
and artwork jumps across shared creases immediately visible.

The runner exits non-zero if geometric acceptance fails, the crease adjacency
graph no longer forms the reviewed tree, or the stable geometry-role contract
no longer matches the 17-panel source.

## Mapping evidence protocol

For golden mapping review, use the generated `golden-diagnostic-art.svg` as the
single full-sheet artwork source and capture at least:

1. the canonical 2D flat sheet;
2. the exact structural 3D flat pose at the same fold state;
3. the erected body before top closure;
4. the dust/secondary-flap state;
5. the major closure state;
6. the final assembled state.

Keep the camera fixed while comparing structural states. A mapping PASS requires
all panel labels and orientation arrows to remain readable with the expected
chirality, the four corner markers to retain their identities, and continuous
sheet features to remain continuous across every physically connected crease.
Do not compensate for a bad UV map by rotating or mirroring individual artwork
textures.

## Pass meaning

A successful local golden run is strong evidence for the geometric hard gates,
including exact source authority, window geometry, flat equivalence, UV
round-trip, the reviewed topology profile, and stable panel-role identification.
It is **not** permission to mark the complete product PASS.

The remaining golden product gates still require evidence-backed construction
metadata and visual/reference validation: signed folds and target angles,
root/hierarchy, board thickness, tuck/lock/glue destinations and ordering, and
fixed-camera transition captures scored against the reference behavior.
