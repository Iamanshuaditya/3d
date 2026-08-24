# Structural Engine Quality State

## Goal

The production vector dieline is the single geometric authority for editor,
manufacturing, topology, exact panel meshes, holes, hinge axes, flat pose,
folding and global sheet-coordinate UVs.

Golden target:

```text
Lock Bottom and top incl. window — 300 x 150 x 200 mm
SHA-256 b6b8cda57f693275174abfb6e2e3d74411122eb1057feac086ecd26df27df557
```

North-star invariant:

```text
fully flattened 3D structural geometry == canonical production dieline
```

## Current status

**STATUS: REFERENCE_RECREATION_CERTIFIED**

The authorized local PDF has been executed end to end through both verifiers,
the six fixed-camera captures have been generated and independently reviewed,
and `finalize:golden-reference` has issued
`REFERENCE_RECREATION_CERTIFIED_NOT_MANUFACTURING_CERTIFICATION` at 45/50 with
all ten hard gates true.

Three defects were found and fixed by actually executing this lane for the
first time:

1. `measureFlatPanelEquivalence` reduced ~123k boundary samples with
   `Math.max(...array)` and overflowed the V8 argument stack, so both golden
   verifiers crashed on any real production-sized dieline. Now folded;
   regression-covered in `tests/structure/structural-quality.test.ts`.
2. Structural `sheetUv` inverted `u`, copying a convention that is only correct
   for the legacy builder (which places panels at their final box positions).
   Structural panels stay in canonical sheet coordinates, so the inversion
   applied the sheet flip twice and mirrored the artwork on every assembled
   panel. Now regression-covered in
   `tests/structure/structural-chirality.test.ts`.
3. The reference-recreation candidate selected `negative-depth` handedness,
   which put the printed face inside the carton on every body wall and splayed
   the flaps to a 350 x 320 mm envelope. Measured on the assembled rig,
   `positive-depth` is the only handedness that keeps the printed face exterior
   on all 17 panels and closes the body to exactly 200.0 x 150.0 x 300.0 mm.

Manufacturing/converter construction certification is intentionally separate
and remains false until actual hidden construction facts are supplied.

## Latest independent engineering checker

The final implementation was checked through PR #15 using the merge of current
`main` implementation `a9114d018e2606f37b691d314e6ea09ae813ad2f` and checker
head `120bfdb6eb9fce0c0b97a5b3d93a50c5a0347b29`.

- Structural Quality run `32761005013` (#59): **PASS**
- Repository CI run `32761005021` (#121): **PASS**
- lint: **PASS**
- TypeScript: **PASS**
- tests: **302 / 302 PASS, 0 failed, 0 skipped**
- real GLB onboarding pipeline: **PASS**
- generated-file sync: **PASS**
- onboarding manifest validation: **PASS**
- production Next.js build: **PASS**
- `/studio/golden-reference` included in successful production route build: **PASS**

## Implemented structural truth

- canonical vector domain in physical millimetres with provenance;
- exact/fail-closed SVG and DXF import;
- raw PDF named-Separation authority;
- golden source hash lock;
- 70-edge outer cut and real 8-edge window source expectations;
- reviewed <=0.02 mm topology-only endpoint-to-span repair profile;
- exact 17-panel decomposition;
- 16 stable source crease/hinge roles;
- exact polygon structural meshes with holes and board depth;
- global sheet-coordinate UVs;
- exact zero-angle canonical flat restoration;
- 200 x 150 mm rectangular body-tube certificate;
- strict reviewed-construction compiler;
- exact source-crease hinge hierarchy;
- absolute target pose runtime with no cumulative rotation;
- authored timing, delay, stagger, reverse traversal and interruption safety;
- 100-cycle geometry-identity/no-drift certificate;
- canonical structural renderer in Studio;
- canonical structural manufacturing routing;
- CAD-style dieline linework;
- camera state independent from folding;
- fixed model presentation rotation independent from geometry/camera/fold state.

## Executable reference recreation

### Reference recreation lane

Implemented:

- behavior contract from the supplied recording;
- six reference states;
- 450–700 ms hinge timing and 50–150 ms stagger envelope;
- `easeInOutCubic`, no spring/bounce;
- deterministic Forward/Backward absolute state traversal;
- four explicit visual candidates: north/south x plain-final/window-final;
- positive-depth body handedness, measured as the only handedness that keeps
  the printed face exterior on all 17 panels and closes the body to exactly
  200.0 x 150.0 x 300.0 mm;
- unseen diagonal lock rotations held at 0deg and explicitly labelled
  `REFERENCE_RECREATION_ONLY` rather than guessed;
- preview stock thickness explicitly labelled as a visual estimate;
- one-command local runtime verifier;
- development-only private Studio route `/studio/golden-reference`;
- development-only fixed-camera capture route `/studio/golden-reference/capture`
  and the `capture:golden-reference` Playwright driver;
- six-state fixed-camera capture manifest;
- asymmetric diagnostic-art mapping evidence;
- 50-point visual gate with minimum 45/50 plus every hard gate;
- machine finalizer that can emit only
  `REFERENCE_RECREATION_CERTIFIED_NOT_MANUFACTURING_CERTIFICATION`.

Commands:

```bash
npm run verify:golden-local -- /absolute/path/to/reference.pdf
npm run verify:golden-reference -- /absolute/path/to/reference.pdf
VORTEX_GOLDEN_REFERENCE_PDF=/absolute/path/to/reference.pdf npm run dev
npm run capture:golden-reference -- --width 2400 --height 1500
npm run finalize:golden-reference -- reference-run-summary.json visual-review.json
```

### Manufacturing construction lane

Still requires converter/manufacturer evidence for:

- actual stock/caliper thickness;
- physical top/bottom production convention;
- signed hidden bottom-lock diagonal folds;
- glue destination;
- tuck destination;
- physical lock/assembly semantics.

A visual reference result can never upgrade these estimates into manufacturing
truth.

## Final reference gate

Required captures:

1. `01-flat-2d`
2. `02-flat-3d`
3. `03-body-forming-50pct`
4. `04-body-erect`
5. `05-secondary-flaps`
6. `06-major-and-final`

All hard gates must pass: canonical flat/source equality, physical window void,
correct chirality, no panel swap, no crease artwork jump, exact crease pivots,
fixed camera, reversible absolute target poses, no bounce/spring, and canonical
manufacturing authority.

Visual score:

| Category | Max |
|---|---:|
| Geometry alignment | 10 |
| Mapping continuity | 10 |
| Fold-pose match | 10 |
| Motion match | 8 |
| CAD visual quality | 6 |
| Material / lighting presentation | 6 |
| **Total** | **50** |

Pass threshold: **>=45/50 plus every hard gate**.

## Issued reference verdict

Candidate `north-plain-final-0.600mm`, source
`b6b8cda57f693275174abfb6e2e3d74411122eb1057feac086ecd26df27df557`.

| Category | Score | Basis |
|---|---:|---|
| Geometry alignment | 10/10 | flat 3D equals source to 4.5e-13 mm; body closes to exactly 200.0 x 150.0 x 300.0 mm |
| Mapping continuity | 10/10 | correct chirality, printed face exterior on all 17 panels, no crease jumps |
| Fold-pose match | 8/10 | diagonal lock creases held coplanar at 0deg; the reference does not recover their signed angles |
| Motion match | 7/8 | verified against the distilled envelope and the 100-cycle certificate, not frame-by-frame against the raw recording |
| CAD visual quality | 6/6 | exact polygons, real board depth, true window void |
| Material / lighting presentation | 4/6 | deterministic harness lighting, no IBL or contact shadows |
| **Total** | **45/50** | threshold is 45 |

All ten hard gates true. Verdict:
`REFERENCE_RECREATION_CERTIFIED_NOT_MANUFACTURING_CERTIFICATION`.

Both remaining deductions are evidence-limited rather than implementation
defects: the original reference screenshots REF-IMG-001..006 are recorded by
sha256 in the fixture manifest but are marked `tracked: false` and are not
redistributed into the repository.

Engineering is **green and software-complete for reference recreation**.
Reference recreation is **certified**. Manufacturing construction certification
remains **converter-evidence-blocked** by design.
