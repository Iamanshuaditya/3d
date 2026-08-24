# Golden Reference Recreation

This workflow completes the executable visual/reference reproduction of the
hash-locked carton `Lock Bottom and top incl. window — 300 x 150 x 200 mm`
without confusing a visual reconstruction with converter/manufacturer truth.

## Two certification lanes

### Reference recreation

Uses the authorized vector PDF for exact geometry plus the supplied video and
screenshots for observable motion/presentation behavior. Unknown hidden physical
facts are represented as explicitly labelled visual estimates.

A successful final verdict is:

```text
REFERENCE_RECREATION_CERTIFIED_NOT_MANUFACTURING_CERTIFICATION
```

### Manufacturing construction

Remains fail-closed until converter-approved evidence supplies stock/caliper,
physical top/bottom convention, hidden bottom-lock diagonal folds, glue/tuck
relationships, and physical assembly semantics.

A visual score can never upgrade reference evidence into manufacturing truth.

## 1. Run the exact structural source

```bash
npm run verify:golden-local -- /absolute/path/to/reference.pdf
```

The source must match the committed SHA-256 and acceptance profile. This proves
the exact vector source, topology repairs, 17 physical panels, 16 physical
crease chains, real window, flat equivalence, UV round trip, body roles and
hinge roles.

## 2. Run the executable reference candidate

```bash
npm run verify:golden-reference -- /absolute/path/to/reference.pdf
```

Optional candidate controls:

```bash
npm run verify:golden-reference -- /absolute/path/to/reference.pdf \
  --top north \
  --closure plain-final \
  --thickness 0.6
```

Candidate dimensions are intentionally small and explicit:

- physical top: `north | south`;
- final broad closure: `plain-final | window-final`;
- board thickness: visual preview value only.

The command emits under `.quality-local/golden-reference/`:

- `reference-run-summary.json`;
- `reference-candidate-matrix.json`;
- `reference-selected-candidate.json`;
- `reference-compiled-construction.json`;
- `reference-unfold-spec.json`;
- `reference-resolved-rig.json`;
- `reference-runtime-certificate.json`;
- `reference-terminal-poses.json`;
- `reference-capture-manifest.json`.

A successful runtime verdict is:

```text
REFERENCE_RECREATION_RUNTIME_PASS_NOT_MANUFACTURING_CERTIFICATION
```

It requires the exact 17-panel / 16-hinge structure, an authored four-phase
plan, exact-flat terminal pose, no plan validation errors and the 100-cycle
runtime torture certificate.

## 3. Inspect the exact carton in Studio

Development only:

```bash
VORTEX_GOLDEN_REFERENCE_PDF=/absolute/path/to/reference.pdf npm run dev
```

Open:

```text
/studio/golden-reference
```

Optional query controls:

```text
/studio/golden-reference?top=north&closure=plain-final&thickness=0.6
```

The route:

- is disabled in production;
- reads the licensed/private PDF only on the server;
- source-hash validates before rendering;
- builds the exact canonical structural panels and window;
- compiles the selected reference candidate through the same strict rig
  validator used by reviewed construction;
- uses the real Studio renderer/editor and Forward/Backward controls;
- never exposes the filesystem path or commits the PDF/vector payload.

## 4. Capture the six required evidence states

Use the generated `reference-capture-manifest.json` and one fixed camera for all
3D evidence.

Required captures:

1. `01-flat-2d`
2. `02-flat-3d`
3. `03-body-forming-50pct`
4. `04-body-erect`
5. `05-secondary-flaps`
6. `06-major-and-final`

Use the same asymmetric diagnostic artwork throughout. Do not rotate, mirror or
replace artwork per panel to hide a mapping error.

## 5. Score visual/reference quality

The visual gate is 50 points:

| Category | Max |
|---|---:|
| Geometry alignment | 10 |
| Mapping continuity | 10 |
| Fold-pose match | 10 |
| Motion match | 8 |
| CAD visual quality | 6 |
| Material / lighting presentation | 6 |
| **Total** | **50** |

Passing requires **>=45/50** and every hard gate:

- canonical flat matches source;
- window stays a real physical void;
- artwork chirality is correct;
- no panel swap;
- no artwork jump across creases;
- hinge pivots coincide with source creases;
- camera is unchanged across structural captures;
- Forward/Backward use the same absolute target states in reverse;
- no spring/bounce overshoot;
- manufacturing remains routed through canonical structural authority.

`createGoldenReferenceVisualReviewTemplate()` produces a deliberately failing
template until real capture paths, notes, hard-gate results and scores are
supplied.

## 6. Finalize the reference reproduction

```bash
npm run finalize:golden-reference -- \
  .quality-local/golden-reference/reference-run-summary.json \
  .quality-local/golden-reference/visual-review.json
```

The finalizer verifies:

- the runtime verifier passed;
- the reviewed candidate ID matches the runtime candidate;
- 16 resolved hinges / four authored phases / exact flat reachability;
- 100-cycle runtime certificate passed;
- all six captures exist in the review;
- every hard gate is true;
- visual score is >=45/50;
- the report still states manufacturing construction is *not* certified.

Only then can it emit:

```text
REFERENCE_RECREATION_CERTIFIED_NOT_MANUFACTURING_CERTIFICATION
```

## Evidence boundary

The supplied reference supports rigid crease-hinged panels, a rectangular body,
secondary/dust flap movement, major closure before final closure, approximately
quarter-turn major folds, deterministic easing and reverse state traversal.

It does not safely establish converter stock thickness, hidden bottom-lock fold
signs, glue destination, tuck destination or complete physical locking
semantics. Those remain reviewed manufacturing inputs rather than inferred code.
