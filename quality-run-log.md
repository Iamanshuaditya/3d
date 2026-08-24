# Structural Quality Run Log

This file is append-only. Existing runs must not be rewritten to make later
results look better.

## RUN 000 - Baseline and benchmark audit

- Date: 2026-08-24
- Commit: `7b26deeb82f7fcee534b9c785e3adc9cc2bdddb5`
- Goal: establish exact reference provenance, baseline verification, scoring
  rules, hard gates, and a licensing-safe local fixture contract.
- Score before: unscored / FAIL.
- Changes: documentation and hash-only fixture metadata; no engine code and no
  proprietary assets.
- Tests:
  - `npm ci`: PASS, 739 packages, 0 vulnerabilities.
  - `npm run lint`: PASS.
  - `npm run typecheck`: PASS.
  - `npm test`: PASS, 156/156 after installing declared onboarding Python
    dependencies in the isolated worktree.
  - Default Turbopack build: environment-blocked by local-port `EPERM`.
  - Webpack fallback: compiled and typechecked, but the runner did not report
    completion after page-data collection.
- Screenshots: none committed. Six supplied screenshot hashes were inventoried.
- Score after: unscored / FAIL.
- Quality delta: not applicable; no implementation was scored.
- Result: FAIL - required golden structural artifacts do not exist yet.
- Regressions: none observed.
- Next action: implement the canonical vector domain, then prove lossless
  import of the authorized local source before panel, mesh, UV, or animation
  work.

## RUN 001 - Canonical vector-domain hardening

- Date: 2026-08-24
- Commit: `9a9cec4`
- Goal: establish a physical-millimetre vector authority with preserved curve
  semantics, affine transforms, provenance, explicit tolerances, and geometry
  comparison that cannot falsely pass sparse deviations.
- Score before: product-level unscored / FAIL; scoped vector gate initially
  rejected at 20/30 and then 25/30 during adversarial review.
- Changes:
  - canonical vector and manufacturing-operation domain;
  - exact bounds, adaptive error-bounded flattening, strict path continuity,
    exact analytic signed area, and certified comparison metrics;
  - validation for topology, holes, self-intersections, transforms,
    provenance, and tolerance budgets;
  - exact SVG vector import with physical scaling and fail-closed unsupported
    geometry;
  - local-first Green integration repair for translation invariance.
- Tests:
  - canonical vector suite: PASS, 36/36;
  - independent adversarial vector checker: PASS, 30/30;
  - typecheck: PASS;
  - scoped lint: PASS;
  - `git diff --check`: PASS.
- Adversarial evidence:
  - hidden between-sample deviation returns `indeterminate` rather than a
    false certificate;
  - degenerate/self-crossing windows reject;
  - original `1e12` translated-collinear counterexample returns exactly
    `0 mm²` and rejects as `zero-area-window-cut`;
  - translated/reflected line, quadratic, cubic, circular-arc, and
    elliptical-arc area probes agree with local exact area times determinant
    within `1e-11 mm²`.
- Screenshots: none; this run concerns source-domain mathematics.
- Score after: product-level remains unscored / FAIL; scoped vector gate
  PASS 30/30.
- Quality delta: eliminated the vector-domain P0 blocker; no product-level
  points claimed before golden import/topology artifacts exist.
- Result: scoped PASS, overall FAIL.
- Regressions: none observed in the scoped suite.
- Next action: independently verify DXF and vector-PDF import, then extract the
  golden planar topology and real window from the exact local PDF.

## RUN 002 - Exact DXF import and fail-closed hardening

- Date: 2026-08-24
- Commit: `eb704de`
- Goal: normalize supported packaging-CAD DXF entities into canonical
  millimetre vectors without hidden sampling, projection, semantic guesses, or
  malformed-parser availability failures.
- Score before: scoped DXF candidate unscored; overall product FAIL.
- Changes:
  - configurable case-insensitive layer-to-operation mapping;
  - physical `$INSUNITS` and explicit custom-scale handling;
  - exact LINE, LWPOLYLINE/POLYLINE bulge, ARC, CIRCLE, ELLIPSE, and exact
    single-span spline conversion;
  - x-right/y-up to x-right/y-down retained affine mapping;
  - source/entity/segment provenance;
  - raw-record fail-closed validation before third-party parsing.
- Checker-driven defects eliminated:
  - small non-zero bulges can no longer become lines;
  - any non-default extrusion, Z, elevation, thickness, or ambiguous width
    rejects;
  - conflicting normalized mappings and layer records reject;
  - malformed spline/polyline counts and flags reject;
  - invalid ellipse/arc parameter ranges reject;
  - frozen layer lookup is case-insensitive;
  - missing legacy `SEQEND` cannot hang the parser;
  - known physical unit labels cannot contradict explicit scales.
- Tests:
  - focused DXF suite: PASS, 9/9 top-level tests with multiple adversarial
    cases;
  - complete current structure suite: PASS, 56/56;
  - independent DXF checker: PASS, 30/30;
  - typecheck: PASS;
  - full lint: PASS;
  - `git diff --check`: PASS.
- Screenshots: none; this run concerns exact source import.
- Score after: scoped DXF gate PASS 30/30; product-level remains unscored /
  FAIL because golden topology/mesh/mapping/folding artifacts do not yet pass.
- Quality delta: eliminated all scoped DXF import blockers without broadening
  unsupported geometry claims.
- Result: scoped PASS, overall FAIL.
- Regressions: none observed in the current structure suite.
- Next action: pass the vector-PDF gate and use explicit source-hash-locked
  topology associations for the golden PDF's intentional presentation gaps.

## RUN 003 - SVG authority and browser-contract hardening

- Date: 2026-08-24
- Commit: `b98436c`
- Goal: prove that SVG normalization preserves physical geometry and cannot
  certify a partial or differently rendered structure through CSS, active
  content, conditional rendering, ambiguous semantics, or source-scale
  numerical collapse.
- Score before: scoped SVG candidate FAIL after hostile review; overall product
  FAIL / unscored.
- Changes:
  - resolve absolute SVG geometry units to CSS user units before the retained
    `viewBox` CTM, including non-uniform scaling;
  - validate semantic mappings, explicit operations, and duplicate source IDs;
  - honor inline `!important` for supported visibility/display behavior;
  - reject embedded/external CSS and unsupported CSS/presentation transforms,
    geometry properties, clipping/mask aliases, and viewport clipping;
  - reject scripts, animation, event handlers, switches, and conditional
    processing attributes;
  - reject classified unsupported geometry and structurally unresolved use;
  - reject a numerically ill-conditioned non-zero arc instead of erasing or
    linearizing its vector semantics.
- Tests:
  - focused SVG suite: PASS, 17/17;
  - complete current structure suite: PASS, 62/62;
  - independent hostile SVG gate: PASS, 30/30;
  - browser probes: physical length/viewBox, transform-origin, and root
    overflow behavior confirmed against headless Chrome;
  - typecheck: PASS;
  - full lint: PASS;
  - `git diff --check`: PASS.
- Screenshots: none; browser DOM/CTM probes were temporary engineering
  evidence, not customer visual evidence.
- Score after: scoped SVG gate PASS 30/30; overall product remains unscored /
  FAIL pending golden PDF, topology, mesh, mapping, and fold evidence.
- Quality delta: closed all identified silent-authority paths without claiming
  unsupported SVG feature coverage.
- Result: scoped PASS, overall FAIL.
- Regressions: none in the 62-test structure suite.
- Next action: independently certify the corrected vector-PDF importer, then
  harden the golden planar topology before building exact panel meshes.

## RUN 004 - Merged structural engine and clean post-merge checker

- Date: 2026-08-24
- Structural finalization merge: `2a957f026675e76f71828b6dd519d5c16c2944b1`.
- Verified runtime baseline: `381233e81a89839a426bcd90480661be767ff8ea`.
- Verification commit: `34ea4a85974259e98458b0e799aecc7124faa963`.
- Goal: verify the merged structural engine as one repository baseline and
  close the production-critical engineering regression gate without claiming
  unknown golden construction facts.
- Changes verified in the merged baseline:
  - raw vector-PDF structural authority and source-hash-locked golden profile;
  - planar topology / 17-panel target / real window ownership;
  - exact structural panel meshes and canonical sheet UVs;
  - flat source-equivalence metrics;
  - canonical Studio and manufacturing routing;
  - construction inventory, hinge rig, absolute fold poses, no-drift cycles,
    finite staggered motion, reverse/rapid-retarget/reduced-motion behavior;
  - fold/camera independence;
  - current NumPy 2.5 compatibility for planar onboarding outline and UV-area
    geometry.
- Checker discovery/fixes:
  - earlier attempts exposed two legacy 2D `np.cross` incompatibilities under
    NumPy 2.5 rather than structural-engine failures;
  - both were replaced with explicit scalar 2D determinant math;
  - onboarding test diagnostics were improved so subprocess failures retain the
    exact Python exception instead of surfacing only `failed !== passed`.
- Structural Quality workflow `32699507367`:
  - dependency setup: PASS;
  - lint: PASS;
  - typecheck: PASS;
  - tests: **264/264 PASS**;
  - production build: PASS.
- Repository CI workflow `32699507439`:
  - generated-file sync: PASS;
  - dependency setup: PASS;
  - lint: PASS;
  - typecheck: PASS;
  - tests: **264/264 PASS**;
  - onboarding manifest validation: PASS;
  - production build: PASS.
- The real checked-in GLB onboarding fixture now passes inspect, build,
  validate, and durable outputs on Python 3.13 / NumPy 2.5.2.
- Engineering score after: **10/10**.
- Hard gate G12: **PASS**.
- Product-level result: **BLOCKED / unscored**, not PASS. Remaining blockers
  are the authorized golden acceptance run, certified signed fold/angle/root/
  thickness/closure metadata, and scored fixed-camera + diagnostic-art visual
  evidence.
- Regressions: none observed in the clean dual-workflow checker.
- Next action: run the authorized local golden PDF through
  `scripts/inspect-golden-construction.ts`, preserve the report outside source
  control, then close construction and visual-reference evidence without
  guessing missing semantics.

## RUN 005 - Golden reference certification and repository truth repair

- Certification executed locally at head `a6a30cc`; last dual-workflow-green
  head at time of writing: `29d7873` (Structural Quality 32770971315,
  Repository CI 32770971388, both `success`).
- Authorized private source executed for the first time end to end.
  Source SHA-256 `b6b8cda5...f557`, byte-identical to the fixture manifest.

### What executing the lane found

Three defects that every synthetic fixture had hidden:

1. `measureFlatPanelEquivalence` reduced ~123k boundary samples with
   `Math.max(...array)`. The V8 argument-spread limit was measured at ~111k on
   the runner, so **both golden verifiers crashed** on any real
   production-sized dieline. The UV round-trip gate inverted `u` the same way
   the forward mapping did, so it was self-consistent and blind to defect 2.
2. Structural `sheetUv` inverted `u` - correct only for the legacy builder,
   which places panels at their final assembled positions. Structural panels
   stay in canonical sheet coordinates, so the inversion applied the sheet flip
   twice and **mirrored artwork on every assembled panel**.
3. The reference-recreation candidate used `negative-depth` handedness, which
   put the **printed face inside** the carton on every body wall and splayed
   the flaps to a 350 x 320 mm envelope.

Measured on the assembled rig, `positive-depth` is the only handedness that
keeps the printed face exterior on all 17 panels and closes the body to exactly
**200.0 x 150.0 x 300.0 mm**. Both fixes are regression-locked, and each new
test was confirmed to FAIL against the old behaviour before being accepted.

### Results

- source acceptance gates: **12/12 PASS**;
- runtime recreation: `REFERENCE_RECREATION_RUNTIME_PASS_NOT_MANUFACTURING_CERTIFICATION`;
- 100-cycle runtime certificate: **PASS**, zero drift;
- fixed-camera captures generated: **6/6**, reviewed individually;
- visual score: **45/50** (threshold 45), all **10/10** hard gates true;
- final verdict: `REFERENCE_RECREATION_CERTIFIED_NOT_MANUFACTURING_CERTIFICATION`;
- flat 3D vs source boundary delta: 4.5e-13 mm; UV round-trip 4.7e-5 mm.

Score deductions were both evidence limits, not implementation defects:
fold-pose 8/10 (diagonal lock creases held coplanar - the reference does not
recover their signed angles) and motion 7/8 (verified against the distilled
envelope, not frame-by-frame against the raw recording, which is not available
locally).

### Repository truth repair

- Repository CI was **red** at `a6a30cc`: `.github/workflows/ci.yml` still
  invoked `scripts/sync-agent-rules.sh` and `scripts/sync-skills.mjs` after the
  website-cloner scaffolding that generated those files was removed. The
  obsolete step was deleted rather than restoring dead scripts.
- Replaced by `tests/platform/quality-record-consistency.test.ts`, which fails
  when status, verdict, blockers, checker totals or certification fields
  contradict one another. It runs inside `npm test`, so both workflows enforce it.
- `quality-report.json` previously said `REFERENCE_RECREATION_CERTIFIED` while
  its prose verdict said the same lane was `BLOCKED`, and listed four
  already-completed internal steps as blockers. Blockers are now `EXTERNAL:`
  tagged only.
- Product-level result: reference recreation **CERTIFIED**; manufacturing
  construction **not certified** and not obtainable from this repository.
- Next action: converter evidence for caliper, glue/tuck destinations and
  bottom-lock semantics. No code change can close those.

## RUN 006 - Green main restored and deploy blocker measured

- Verified head `811447b`; Structural Quality 32789786702 and Repository CI
  32789786877 both `success` on the same SHA.
- Repository CI red since `a6a30cc` is fixed; the obsolete generated-file sync
  step is removed and replaced by an enforced quality-record consistency test.
- `public/models/pouch-002-customizable.glb` Draco-compressed
  **26.41 MiB -> 5.72 MiB** with bounding-box delta 0, `TEXCOORD_1` preserved,
  and a 0.09% RMS render difference. `opennextjs-cloudflare build` now passes.
- Deployment attempted with authenticated credentials and **rejected**:
  Cloudflare API code 10027, Worker 13.69 MiB against a 3 MiB free-plan cap.
  The bundle also embeds `better-sqlite3` and `sharp`, native modules Workers
  cannot execute at any size. Deployment is therefore blocked on plan plus
  architecture, not on the asset limit and not on credentials.
- Golden lane re-verified after all changes: 12/12 source gates,
  `REFERENCE_RECREATION_RUNTIME_PASS_NOT_MANUFACTURING_CERTIFICATION`,
  100-cycle certificate PASS. No regression.
