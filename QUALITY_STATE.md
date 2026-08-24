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

**STATUS: BLOCKED_VISUAL_REVIEW**

The structural engine and executable golden reference-recreation software path
are implemented and the latest clean checker is green. Final reference PASS is
still withheld until the authorized local PDF is executed through the current
verifier and all six fixed-camera captures pass the >=45/50 visual gate.

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
- negative-depth body handedness from the printed-face exterior convention;
- unseen diagonal lock rotations held at 0deg and explicitly labelled
  `REFERENCE_RECREATION_ONLY` rather than guessed;
- preview stock thickness explicitly labelled as a visual estimate;
- one-command local runtime verifier;
- development-only private Studio route `/studio/golden-reference`;
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

## Remaining evidence to issue final reference PASS

1. Execute the authorized private PDF through `verify:golden-reference`.
2. Generate the six fixed-camera captures with one candidate and the same
   asymmetric diagnostic artwork.
3. Select the closest of the explicit candidates against the supplied reference.
4. Complete independent scoring >=45/50 with every hard gate true.
5. Run `finalize:golden-reference` and persist its local verdict.

Engineering is **green and software-complete for reference recreation**. Final
reference certification is **private-evidence-blocked**. Manufacturing
construction certification is **converter-evidence-blocked** by design.
