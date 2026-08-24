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

The structural engine and executable golden reference-recreation path are now
implemented. The product is not allowed to claim final reference PASS until the
authorized local PDF is executed through the current verifier and the required
six fixed-camera captures pass the independent >=45/50 visual gate.

Manufacturing/converter construction certification is a separate status and
remains false until actual hidden construction facts are supplied.

## Current implementation head under check

`af03f0fbd6b8a33dc5152311ca306242c4b6d6e5`

Temporary checker branch:

`verify/reference-recreation-final`

## Previously verified clean baseline

Verification commit `34ea4a85974259e98458b0e799aecc7124faa963`:

- Structural Quality run `32699507367`: lint, typecheck, 264/264 tests and
  production build PASS.
- Repository CI run `32699507439`: generated-file sync, lint, typecheck,
  264/264 tests, onboarding validation and production build PASS.

The new checker must re-run those gates against the latest implementation.

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

The source/video evidence is now separated into two lanes.

### Reference recreation lane

Implemented:

- reference behavior contract from the supplied recording;
- six major reference states;
- 450–700 ms hinge timing envelope;
- 50–150 ms stagger envelope;
- `easeInOutCubic`, no spring/bounce;
- deterministic Forward/Backward absolute state traversal;
- four explicit visual candidates:
  - north + plain-final;
  - north + window-final;
  - south + plain-final;
  - south + window-final;
- negative-depth body handedness from the engine's printed-face exterior
  convention;
- hidden diagonal lock rotations held at 0deg and explicitly labelled
  `REFERENCE_RECREATION_ONLY` rather than guessed;
- visual stock thickness explicitly labelled as a preview estimate;
- local one-command runtime verifier;
- development-only private Studio route `/studio/golden-reference`;
- six-state fixed-camera capture manifest;
- asymmetric diagnostic-art mapping evidence;
- 50-point visual score gate with minimum 45/50 plus all hard gates;
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
- physical top/bottom convention as a production fact;
- signed hidden bottom-lock diagonal folds;
- glue destination;
- tuck destination;
- physical lock/assembly semantics.

The reference-recreation lane is forbidden from upgrading those estimates into
manufacturing truth.

## Reference recreation hard gates

Final reference certification requires all six captures:

1. `01-flat-2d`
2. `02-flat-3d`
3. `03-body-forming-50pct`
4. `04-body-erect`
5. `05-secondary-flaps`
6. `06-major-and-final`

and every hard gate:

- flat 3D equals canonical source;
- real window remains a void;
- artwork chirality correct;
- no panel swap;
- no artwork jump across creases;
- hinge pivots remain on source creases;
- fixed camera throughout 3D captures;
- Forward/Backward share the same absolute targets;
- no spring/bounce overshoot;
- manufacturing remains canonical structural authority.

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

## Remaining work to issue final reference PASS

1. Latest checker CI must pass on the current implementation.
2. Execute the private authorized PDF through `verify:golden-reference`.
3. Generate the six fixed-camera evidence captures using one candidate at a
   time and the same asymmetric diagnostic artwork.
4. Select the closest candidate against the supplied reference.
5. Complete independent visual scoring >=45/50 with every hard gate true.
6. Run `finalize:golden-reference` and persist the final local verdict.

Until those external/local evidence steps are executed, reference recreation is
**software-complete but evidence-blocked**. Manufacturing construction remains
**converter-evidence-blocked** by design.
