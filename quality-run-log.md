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
