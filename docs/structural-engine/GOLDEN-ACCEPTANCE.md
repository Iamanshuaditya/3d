# Golden Structural Acceptance Evidence

## Scope

This document records the immutable reference facts used by the structural
engine acceptance checker. It intentionally separates **source evidence** from
**engine verdicts**.

The source PDF is licensed/private input and is not committed to Git. The
checker accepts the authorized local file by path and rejects the source gate
unless its SHA-256 matches the reviewed reference.

## Reference identity

```text
Product: Lock Bottom and top incl. window
Nominal metadata: 300 x 150 x 200 mm
SHA-256: b6b8cda57f693275174abfb6e2e3d74411122eb1057feac086ecd26df27df557
```

The nominal dimension order is metadata. It is not inferred from the PDF.

## Raw PDF authority

Independent inspection of the raw PDF object graph establishes:

- the page invokes a Form XObject for the structural drawing;
- the Form has its own Resources dictionary;
- `/C3` resolves to the named Separation `/DieCutRed`;
- `/C4` resolves to the named Separation `/DieCutBlue`;
- `/C5` resolves to the named Separation `/DieCutGreen`;
- structural geometry is vector linework, not a raster tracing target.

Reviewed semantic mapping for this source profile:

```text
DieCutBlue  -> cut
DieCutRed   -> crease
DieCutGreen -> ignored as structural cut/crease authority
```

The raw importer must preserve the separation name in provenance. A rendered
RGB equivalent is insufficient evidence of manufacturing intent.

## Independently measured reference facts

The authorized source was inspected independently from the TypeScript engine.
The following values are therefore acceptance inputs, not values learned from
engine output:

| Measurement | Reference |
| --- | ---: |
| Outer cut envelope | 712.4 x 470.0 mm |
| Blue cut source segments | 78 |
| Outer cut cycle edges | 70 |
| Window cut cycle edges | 8 |
| Red crease source segments | 24 |
| Collinear crease chains | 16 |
| Window area | ~46,600.4 mm² |
| Window perimeter | ~856.57 mm |

The 78 blue cut spans partition into one 70-edge outer cycle and one 8-edge
window cycle. The 24 red source spans normalize into 16 physical collinear
crease chains.

## Automated gates

`evaluateGoldenStructuralAcceptance()` fails unless all of the following are
true:

1. source SHA matches the reviewed PDF;
2. outer cut envelope matches the physical reference;
3. outer cycle has 70 edges;
4. the structural window has 8 edges;
5. 24 source crease segments survive import;
6. crease normalization produces 16 chains;
7. window area and perimeter match the reference;
8. the window belongs to exactly one structural panel;
9. flat panel-union boundary matches the source cut boundary;
10. flat hole geometry matches the source window independently;
11. printed-face UVs round-trip to canonical sheet coordinates within the
    numeric tolerance.

The checker also reports Hausdorff/RMS boundary error and outer/window
area/perimeter differences through the flat-equivalence report.

## Local authorized-file verification

Run:

```bash
npm run verify:golden-structure -- /absolute/path/to/product_Lock\ Bottom\ and\ top\ incl.\ window_mm_300_150_200.pdf
```

The command computes the file SHA, imports raw PDF authority, derives topology,
panels and mesh UVs, prints a machine-readable JSON report, and exits non-zero
if any gate fails.

## Construction metadata remains separate

Passing this acceptance does **not** authorize the engine to invent:

- mountain/valley direction;
- assembled angles;
- root panel;
- hierarchical hinge ownership;
- glue seam;
- tuck/lock destination;
- board thickness;
- fold order or animation timing.

Those are construction inputs and must be authored/reviewed separately before
folding or assembled-state certification.

## Verdict semantics

A synthetic fixture passing CI proves the parser/checker contracts work. It
does not by itself prove the private reference passes.

The golden product may only be labelled **PASS** after the authorized local PDF
has been run through `verify:golden-structure` and every gate is true. Until
then the honest verdict is **PENDING GOLDEN EXECUTION**.
