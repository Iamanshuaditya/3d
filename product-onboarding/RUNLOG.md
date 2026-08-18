# Run log (append-only)

## I1 — inspect & select
- Built lib/inspector.py (generalized; FIXED: world transforms were ignored on multi-node scenes — pouch never exposed this).
- Camera inspected: 18 nodes; Object_6 = leather body wrap (UV overlap 0.66 → reuse impossible), Object_5 trim, Object_4 base strip, Object_8-11 lens, y≈0.19 cluster = top controls. Evidence: products/camera-001/inspection.json, validation/iso-*.png, colorcode-*.png.
- DECISION: regions = body_wrap (wrap strategy), base_plate (planar), hardware (rest, non-customizable).
- DECISION: per-region SEPARATE design surfaces (engine already supports multiple editableSurfaces with own canvases) instead of pouch's single shared web. Each customizable region gets its own 0-1 customization UV. Non-customizable meshes preserved verbatim.
- DECISION: exporter = surgical pygltflib edit (add TEXCOORD_0, shift original UV to TEXCOORD_1, repoint original material texCoord→1). No Blender in the deterministic path.

## I2 — build + math validation (camera)
- Built strategies (wrap arc-length unroll, planar, reuse_existing), pygltflib surgical exporter, assets generator, CLI, math validator.
- Checker caught: (a) builder v-flip broke canvas-top convention → removed (contract: raw v=0 bottom + runtime flipY, same as pouch); (b) TRIMESH FLIPS V on glTF load — raw accessor space is now the read/write contract everywhere; (c) Object_4 mislabeled as base plate (it is two rim strips; probes landed in the gap) → replaced with Object_29 NAME_PLATE (planar axis z); (d) wrap seam moved to 270° (camera back), circular u tolerance at seam.
- RESULT: validate → PASSED: true (25/25 checks + 15 preserved-node checks). Evidence: products/camera-001/validation/math-validation.json

## I3 — harness generalization + chirality + second product family
- Generic harness (product.json-driven, per-surface canvases, auto region close-up cameras).
- Close-ups exposed MIRRORED rendering on both camera regions → added generic chirality check to validator (cross(up, outward-normal)·Δu > 0); fixed planar-up bug in that check; manifest flips corrected. Both now pass math+visual.
- Added `by:"faces"` selector: exporter carves primitives into region meshes (cloned material→texCoord 1, remainder rebuilt, world-matrix node). Camera regression: still PASSED.
- pouch-002 onboarded via generic pipeline from single-mesh cleaned Meshy scan: tools/classify_pouch_faces.py (family heuristic) → faces/*.json → manifest with 3 planar regions. Validator caught real gusset mirroring (flip_u) + taught adaptive probes for non-rectangular footprints. Templates now overlay TRUE designable footprint (eye-shaped gusset). PASSED math + harness visual.
- Evidence: products/*/validation/{math-validation.json,harness.png}


## I4 — labeler, integration, studio proof, regression
- labeler.html: mesh-click + face-paint region labeling, exports manifest; driven end-to-end headlessly (validation/labeler.png; exported manifest structurally identical to hand-authored).
- `integrate` CLI + onboardedProduct() mapper in product-config.ts: onboarded products are data (generated/<id>.product.json) — no engine changes. tsconfig now excludes experiments/product-onboarding. typecheck clean.
- REAL STUDIO PROOF: /studio?product=camera-001 → Body Wrap + Name Plate surface tabs, "Add text" through the actual editor renders live at front-center of the 3D camera (validation/studio-text.png). pouch-002 → Front/Back/Bottom tabs, text upright mid-front (better than legacy pouch). shadowY now generated from model bounds (ground-plane fix).
- REGRESSION: meshy-pouch-001 untouched, loads, live-syncs (validation-regression-pouch.png). Its 180° front-text quirk is PRE-EXISTING legacy single-web compositing (only additive app changes this session), and the new per-panel pipeline (pouch-002) does not have it.
- README.md written (next-product instructions, contracts, licensing).

## I5 — checker remediation
Independent audit found 5 material gaps; all addressed:
1. validate crash on fresh product (missing validation/ dir) → mkdir fix.
2. reuse_existing untested + crash path → bbox-fallback physical dims with explicit note; smoke test products/_test-reuse (build+validate PASSED); chirality explicitly skipped for authored UVs.
3. Labeler paint-through → front-facing-only brush; flip_u/flip_v/seam_deg fields added; multi-mesh paint guarded.
4. Regression claim unverifiable → EXPERIMENT: stripped all session app changes, re-ran legacy pouch test → identical 180° text (regression-baseline-no-changes.png). Quirk definitively pre-existing. Harness converted to ASSERTING test (unique-magenta pixel counts per view, exit 2 on failure, *-results.json artifacts). Camera + pouch-002: HARNESS PASS.
5. Fresh-flow crashes/docs → inspector recommendations now match STRATEGIES keys; multi-primitive assert → guided NotImplementedError; README "Known hard limits" section.
Residual honest limitations: multi-primitive meshes, oblique axes/complex curved shells (no strategy yet), face-paint not yet used for a shipping face set (heuristic script used for pouch), legacy pouch quirk left as-is (superseded by pouch-002 pipeline).

## I6 — shared production-web layout (user feedback)
- User rejected per-panel tabs for the pouch; wants the VistaPrint model: ONE continuous 2D web (front|gusset|back) with drag-anywhere upload.
- Added manifest `layout: {mode: shared}`: builder packs region UVs into slices of one canvas (regions.json uv.rect + placement), assets emit ONE surface with meshNames + sections (contentRotation 0, NO textureRotation — UVs are already web-aligned), composite dieline template/diagnostic with footprint outlines.
- Validator now maps probes/chirality/reproducibility through uv.rect (works for both modes). Harness fixed to drive meshNames like ProductModel + tests all views per placement.
- pouch-002 rebuilt shared: validate PASSED, harness PASS, real Studio shows single 46.9x22.9cm web; text placed on front panel renders upright mid-front on 3D. camera-001 + _test-reuse regression: PASSED (separate mode intact).

## I7 — generated dielines (user feedback: "grids/guides like pouch-001")
- DesignEditor already had a generic `dieline` prop (cuts/creases/safety paths in px) — pouch-001 fed it HAND-MEASURED values from pouchDielineOverlay.
- Generalized: pipeline now DERIVES the dieline from geometry — each region's true UV-boundary loops (chained boundary edges → convex-hull outer loop, snap-to-rect for panel-like hulls, RDP simplification, compactness + edge-band noise gates) become safety outlines; slice boundaries become creases; canvas rect = cut. Emitted per surface in product.json.
- App: additive — SurfaceDieline type, `surface.dieline` wins in StudioShell/ProductCustomizer dieline memos, explicit mapper passthrough. No product-specific code.
- Result: pouch-002 studio shows the full dieline incl. the auto-derived eye-shaped gusset outline (pouch-001 needed hand-measured coordinates for its octagon; ours comes from the mesh). Works for camera too (wrap outline; nameplate rect covers whole canvas → no redundant outline).
- Sweep: all 3 products validate PASS, both harnesses PASS, typecheck clean.

## I8 — redo-proof + agent handbook
- REDO PROOF: deleted every generated output of pouch-002 (kept source.glb + manifest.json + faces/), rebuilt: validate PASS, harness PASS, integrate OK. Inputs are the only durable artifacts.
- AGENT-GUIDE.md written: self-contained handbook for a fresh AI/engineer to onboard any new 3D model (mental model, contracts, step-by-step, manifest reference, failure→fix table, hard limits, extension points, golden rules).

## I9 — dieline beautification (user feedback: "looks hand-drawn vs pouch-001")
- Root cause identified: pouch-001's dieline is imported production CAD (hand-measured mm coordinates); ours traces the wrinkled scan boundary.
- Beautification pass in region_outline_paths: panel-like hulls → crisp INSET safety rects (CAD look); other convex outer loops → idealize_convex (polar resample around centroid + left-right mirror symmetrization + circular smoothing + RDP). Gusset now renders as a clean symmetric lens.
- Both products validate PASS + harness PASS after change.

## I10 — dieline quality is now a GATE, not a feature (user: "must be systemic")
- validate() now enforces per-surface dieline quality: present, all paths in-bounds, smooth (<=120 pts/path), >=1 safety outline per region on the surface. A product CANNOT pass validation with missing/noisy/out-of-bounds guides.
- Gate immediately caught 2 real issues: loop-chaining dropped clean 4-corner rectangle loops (len>8 filter → >=3; nameplate had 0 outlines), and _test-reuse had a pre-dieline product.json. Both fixed; all 3 products PASS incl. gate; harnesses PASS.

## I11 — demo fleet (client demo today; Meshy free tier can't download)
- DECISION: parametric generation over image-to-3D (scan-quality = the disliked "camera look") and over free model sites (licensing/curation). tools/generate_products.py: 13 revolution-solid SKUs (can, tin, wine bottle, shampoo, jar, mug w/ handle, tumbler, coffee cup, tube, pill bottle, candle jar, spice jar, water bottle) — real cm dimensions (cmPerUnit=1), colored parts, separate LABEL band node.
- All 13 onboarded through the standard pipeline: build+validate PASS first try (wrap seam 270 + flip_u pattern held), integrated, registered (script-generated imports), typecheck clean, studio spot-checks show professional look with live text wrap.

## I12 — flagship quality pivot (user: match Pacdora, quality over quantity)
- Studied Pacdora reference (user screenshots: FEFCO dieline generator w/ bleed/trim/crease legend, dimensions, material thickness; kraft 3D w/ open-close).
- Authored FEFCO 0427-style mailer box (240x160x60) on the existing fold-from-dieline carton engine: ONE continuous outer contour (rounded tuck + thumb notch + tapered flaps) that also yields the bleed line by numeric offset; full crease map; 14 panels w/ hinged lid.
- Extended carton dieline schema with `bleed` channel (renders green like production).
- New `kraft-corrugated` materialProfile (data-driven): procedural paper grain (bump+roughness), corrugation flute texture on board edges, blowout-resistant kraft tones.
- Fold-direction debugging via decisive probes (red-inner test proved wiring; shrink-panel probes identified FRONT_ROLL wrapping outside as the mystery band; engine's inferred hinge sign can't wrap rolls inward → interior-only panels degenerated in 3D, kept on dieline).
- Panel SECTIONS with printer-authored contentRotation (lid/front 180, sides ±90): section tabs + auto-rotated placement = artwork reads upright on the folded box.
- Result: closed box = clean uniform kraft mailer; open/close animation; text placed via Lid tab prints rotated on the web and reads correctly in 3D. burger-box/pouch-002 unaffected (200s, typecheck clean).
- Honest gaps vs Pacdora noted for next: in-canvas dimension arrows, parametric L×W×H input, board-thickness allowances in the dieline math, corrugated edge visible only at close zoom, interior roll/dust flap geometry omitted in 3D.

## I13 — catalogue curation (client-facing quality bar)
- `hidden` flag on ProductConfig; studio catalogue + home gallery filter it; URLs keep working.
- Hidden: bottle-001, camera-001, wine-bottle, shampoo-bottle, cosmetic-jar, cosmetic-tube, pill-bottle, candle-jar, spice-jar, water-bottle.
- Library now shows exactly 10 curated products (verified by screenshot): burger box, mailer box, 3 pouches, soda can, food tin, mug, tumbler, coffee cup.

## I14 — parametric pouch family (Pacdora 8-style test)
- PouchStyle type + makePouchSpec factory: a pouch SKU = {style, width, height, depth, zipper} — profiles/seals/dieline derived. 8 SKUs in generatedPouchSpecs.
- buildStyledPouch in pouch-geometry: one builder for three_side_seal / center_seal / flat_bottom / side_gusset (depth envelopes, box side walls w/ pleats, base+cap for flat-bottom, vertical/horizontal seal fins, center-seal back fin, zipper ridge, film crinkle). stand_up keeps the original proven builder (zipper variant free via resealableZip).
- styledWebLayout + styledPouchDieline: upright print webs (Front|Back or Front|Right|Back|Left + bottom patch), seal-band + triple zipper creases, bleed outline. Back columns mirrored in UV for correct chirality from behind.
- generatedPouchProduct(): sections/canvas/camera all derived from spec; 8 products registered as data.
- Fix round: flat-bottom top-cap wedge (envelope taper vs cap depth) → brick holds full depth + proper cap.
- Verified: 5 archetype screenshots; studio text tests on 3ss-zip + fb-zip (live text upright on 3D, dielines professional). Typecheck clean. Marginal cost of pouch SKU #9: one factory line.

## I15 — pouch-family quality remediation (user: "genuinely very bad" — correct)
- Failure analysis: mailer got multi-round visual iteration; pouches got one-angle verification. Runtime-generated families had NO quality gate equivalent to the onboarding validator. Quality divergence = process divergence, not chance.
- Fixes: (1) PouchModel film material de-washed (envMapIntensity .72→.34, DoubleSide — also masks any winding slips; roughness/sheen retuned); (2) styledPouchDieline REWRITTEN to production grade: canvas bleed margin, single trim silhouette with attached flat-bottom patch tab + offset bleed contour, per-column inset seal guides, zipper bands on print columns only; (3) camera distances fixed (and my own verification CROP was cutting panels — fixed); (4) flat-bottom brick winding/see-through resolved; (5) center-seal back fin rooted into the seam, protrusion halved; (6) film relief: added broad billow + stronger crinkle so white film catches light.
- Verified: 5-style front grid + orbit views + full editor shots (fb dieline ≈ Pacdora structure). All 8 URLs 200, typecheck clean.
- Lesson encoded: any new RUNTIME geometry family requires the mailer-style visual iteration loop (multi-angle + editor + artwork) before presentation — same as onboarded GLBs require validate+harness.
