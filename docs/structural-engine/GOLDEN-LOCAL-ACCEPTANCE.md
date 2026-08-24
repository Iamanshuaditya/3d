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

## Local outputs

The runner writes four JSON files without copying the PDF:

- `golden-run-summary.json` - compact acceptance result and gate summary;
- `golden-acceptance.json` - complete geometric acceptance report;
- `golden-construction-inventory.json` - topology repairs and crease adjacency
  evidence;
- `golden-construction-template.json` - source-locked authoring template whose
  unresolved physical facts remain `null`.

The runner exits non-zero if the geometric acceptance fails or the crease
adjacency graph no longer forms the reviewed tree.

## Pass meaning

A successful local golden run is strong evidence for the geometric hard gates,
including exact source authority, window geometry, flat equivalence, UV
round-trip, and the reviewed topology profile. It is **not** permission to mark
the complete product PASS.

The remaining golden product gates still require evidence-backed construction
metadata and visual/reference validation: signed folds and target angles,
root/hierarchy, board thickness, tuck/lock/glue destinations and ordering,
fixed-camera transition captures, and asymmetric diagnostic artwork across all
intended outside faces.
