# Product Onboarding Experiment — Meshy Stand-Up Pouch

**Goal:** Determine the best repeatable pipeline for turning an arbitrary existing 3D product
model into a customization-ready asset (2D template ↔ 3D live preview) for our configurator.

**Test object:** `public/models/Meshy_AI_A_stand_up_pouch_pack_0106083317_texture.glb`
(raw Meshy AI image-to-3D output, 14.2 MB).

**Result: SUCCESS.** End-to-end 2D→3D mapping demonstrated in three.js with the exported
asset (`export/product-customizable.glb` + `regions.json` + `uv-template.svg`).
Proof: `screenshots/harness.png` — four logo placements on the 2D canvas each appear at
the predicted position on the 3D pouch.

---

## 1. Original model analysis (Stage 1)

| Property | Value |
|---|---|
| Meshes / materials | 1 mesh, 1 PBR material (baseColor 2048² texture only; no normal/metal-rough) |
| Triangles / vertices | 440,191 / 234,070 |
| Connected components | **1,764** — 3 real shells (front 182k, back 173k, gusset 40k) + ~26 medium (zipper/seams) + **1,700 debris shells ≤100 faces (0.9% of area)** |
| Watertight | No (open shells; winding consistent; no degenerate faces) |
| UV layers | 1 (`UVMap`), 1,758 charts (≈ one per component) |
| UV structure | **Semi-semantic**: front panel and back panel are each ONE large chart, gusset one chart; debris = 1,700 junk islands |
| Orientation | Checker test: texture mapped **mirrored** (letters render backwards), V inverted |

Renders: `inspect/meshy-raw/uv-GLTF.png` (atlas wireframe), `inspect/meshy-raw/checker-*.png`
(numbered checker on 3D).

## 2. Are the original UVs usable? (Stage 2)

**Classification: C — usable only after semantic labeling + rearrangement.**
The three big charts correspond to real panels (front = atlas columns E–G, back = A–D,
gusset = E6/E7 blob), but: mirrored orientation, wobbly wrinkle-following island edges,
1,700 junk islands sharing the atlas, no stable rectangles a customer could design against,
and chart placement would change on every re-generation. Not a design canvas.

## 3. UV variant comparison (Stage 3, on the cleaned 436k-tri mesh)

| Variant | Charts | >100-face charts | Packing coverage | Area-distortion spread (p95/p5) | Customer-usable? |
|---|---|---|---|---|---|
| Original (Meshy) | 29 | 29 | 0.56 | 1.37 | Semi — panels contiguous but mirrored/wobbly |
| Blender Smart UV (66°) | 172 | 29 | 0.56 | 1.37 | No — near-copy of component projections, overlap-prone |
| xatlas (defaults) | **4,488** | 71 | 0.72 | **1.15** (best) | **No — panels shattered into thousands of islands** |
| **Semantic projection (ours, CUSTOMIZATION_UV)** | 3 | 3 | ~0.99 of reserved rects | higher on wrinkles (planar flatten) — *desirable* for print preview | **Yes — fixed dieline rectangles** |
| PartUV | — | — | — | — | Could not run (see §5) |

Key insight: **mathematical UV quality and customer usability are anti-correlated on this
object.** xatlas wins every metric and is the least usable. The wrinkly AI surface makes
distortion-optimal charts fragment; a customer needs *predictable fixed rectangles*, which
only a semantic projection provides. Deliberate distortion at wrinkles is *correct* for our
use case — it makes flat artwork drape over wrinkles exactly like a printed film would.

Wireframes: `uv-variants/uv-{original,smart,xatlas}.png`, stats in `uv-variants/stats-*.json`.

## 4. Repository verdicts

| Repo | What it solves | Reuse? | License blocker |
|---|---|---|---|
| **PartUV** | Part-aware chart generation; exposes chart→face mapping; accepts custom hierarchy trees | Core is Apache-2.0 but: Linux+CUDA-only build (no macOS/arm64, no CPU build switch); vendored PartField preprocessor is **NVIDIA non-commercial**; possible AGPL taint in PAMO-derived `cusimp.cu` | **Yes — effectively non-commercial as shipped** |
| **PartField** | Learned hierarchical part segmentation (per-face labels for every K, full merge tree) | Technically excellent intermediate representation for semantic regions; CPU/MPS possible with small patches | **Yes — NVIDIA License §3.3: non-commercial research/education ONLY, propagates to derivatives; checkpoint has no separate license** |
| **3DAIGC-API** | FastAPI + Redis + GPU scheduler wrapping PartUV/PartField/TRELLIS/Hunyuan et al. | Copy the ~800-line adapter pattern (`partuv_adapter.py`, `partfield_adapter.py`) as reference; don't adopt (50 GB image, 10 unneeded models, author-fork submodules). PartUV needs ~7 GB VRAM, PartField 4 GB | Wrapper Apache-2.0, but integrated models each have own licenses (FastMesh S-Lab non-commercial, PartPacker NVIDIA NC, Hunyuan territory-limited — not EU/UK/KR) |
| **Open3DStudio** | Electron/React workflow UI over 3DAIGC-API | UX reference only; cherry-pick `api/client.ts` typing, `useTaskPolling`, canvas UV-wireframe viewer | Apache-2.0, fine |
| **UVgami** | Blender add-on multiplexing xatlas/OptCuts/PartUV binaries | Don't integrate: async operator design is headless-hostile, hides chart data, single UV layer only. Its `dev/uvgami_cli` subprocess protocol + macOS arm64 engine binaries are useful references | GPL-3.0 add-on (outputs unencumbered) |
| **xatlas (pip `xatlas` 0.0.11)** | Mathematical unwrap baseline | **Yes — the keeper.** MIT, maintained (2025), arm64 wheel works, exposes ChartOptions/PackOptions AND chart→face + xref vertex mapping | None |
| **xatlas-three** | In-browser WASM unwrap | Optional browser fallback; built-in second-UV-channel (`uv2`) workflow; drops chart metadata | MIT, low maintenance |

## 5. PartField / PartUV status (Stages 4–5)

**Not runnable in this environment, and not licensable for production.** Documented, not
worked around silently:

- PartUV pip wheels are manylinux x86_64 only; source build hard-requires CUDA
  (`project(partuv LANGUAGES CXX CUDA)`, `find_package(CUDAToolkit REQUIRED)`). This Mac
  (Apple M4) has no CUDA. It would run in a Linux+GPU Docker (≈7 GB VRAM).
- The chart→face↔part-ID mapping the brief asked about **does survive** the PartUV pipeline
  (`Component.faces` = original global face indices; `hierarchy.json` part tree; PartField
  emits per-face label arrays for every cluster count K). Technically it is exactly the
  intermediate representation we'd want for "click a part, name it".
- **But PartField's NVIDIA license is non-commercial-only and contractually propagates to
  derivative works, and PartUV vendors it.** For a commercial customizer this pipeline is
  legally unusable as shipped. Alternatives if part-segmentation is ever needed: P3-SAM /
  Hunyuan3D-Part (Tencent community license — excludes EU/UK/South Korea, MAU cap), or
  classical geometric segmentation feeding PartUV's Apache-licensed core via a custom
  hierarchy tree — real engineering, deferred.
- For THIS product class it also would not have helped: our semantic problem (front vs back
  of a wrinkled sheet) is solved by a 40-line normal/height heuristic, and PartField cannot
  name parts anyway — a human still labels them.

## 6. What we built (Stages 6–10)

`semantic/build_customizable.py` (headless Blender, ~3 min) does:

1. **Debris removal** — drop connected components ≤100 faces (1,732 components, 0.9% of area).
2. **Semantic face classification** — vectorized port of the proven
   `scripts/prepare-meshy-pouch.mjs` heuristics (outward-normal front/back split +
   downward-facing lower-22% gusset detection).
3. **Split into named meshes** `FRONT_PRINT` / `BACK_PRINT` / `BOTTOM_PRINT`
   (matching `product-config.ts` exactly) with `printSurface` extras.
4. **CUSTOMIZATION_UV as TEXCOORD_0** — planar dieline projection onto the production web
   (2 mm bleed | 240 mm front | 90 mm gusset | 240 mm back | 2 mm bleed = 574×160 mm),
   identical layout to the configurator's existing 2296×640 "film" canvas.
5. **ORIGINAL_UV preserved as TEXCOORD_1** with the original Meshy texture bundled, wired
   into the material — the asset still renders "as scanned" in any glTF viewer.
   ⚠️ glTF does not persist UV-set *names*; order is the contract (0 = customization,
   1 = original) and is recorded in `regions.json → uvSets`.
6. Exports `export/product-customizable.glb` (15.5 MB), `regions.json` (regions with mesh
   names, UV rects, canvas px rects, physical cm), `uv-template.svg/png`,
   `diagnostic-texture.png`.

**Validation:** diagnostic texture rendered from 6 views (`screenshots/diag/`): F on front,
B on back, G on gusset, correct orientation per the `textureRotation: -90` convention,
no mirroring of letterforms, debris specks gone. Corner markers confirm axis conventions.

## 7. The success test (Stage 11)

`export/harness.html` + `shoot_harness.mjs`: real three.js (`GLTFLoader` →
`CanvasTexture(flipY)` → `material.map` on TEXCOORD_0 — the same path as
`ProductModel.tsx`/`texture-manager.ts`). Four scripted logo placements
(front-center, front up+right, gusset-center, back-center) each appeared at the predicted
3D location. Screenshot: `screenshots/harness.png`.

To wire into the live configurator: point `meshyPouchProduct.modelUrl` at the new GLB —
mesh names, surface layout, and canvas dimensions are already compatible. (Not done — no
unnecessary production changes.)

## 8. Recommended architecture (the answer)

**Option E — hybrid, Blender-scripted, semantics-first. No GPU, no ML, no non-commercial code:**

```text
INPUT GLB
   ↓
Inspect (trimesh: components, UVs, charts, checker render)      [automated]
   ↓
Clean (drop debris components)                                   [automated]
   ↓
Existing-UV triage: A/B → keep charts, relayout into fixed rects
                    C/D → continue                               [automated report, human glance]
   ↓
Semantic region assignment                                       [the human step — see below]
   ↓
CUSTOMIZATION_UV: per-region planar/cylindrical projection into
RESERVED FIXED RECTANGLES of the template (predictability > packing)
   ↓
Export: GLB (TEXCOORD_0 = customization, TEXCOORD_1 = original + texture,
        named meshes) + regions.json + uv-template.svg + diagnostic renders
   ↓
Automated validation: diagnostic texture, 6-view render, three.js harness
   ↓
Register in product-config.ts → existing configurator (unchanged)
```

Why not the alternatives:
- **A (Blender only):** this *is* mostly A, plus trimesh/xatlas tooling and the validation harness.
- **B/C (PartField→PartUV):** licensing (non-commercial) kills it for production; needs Linux GPU; and it still doesn't name regions. Revisit only for genuinely multi-part products (shoes) — and then with a licensed/permissive segmenter.
- **D (xatlas + semantic tooling):** measured — 4,488 charts on this mesh class. Keep pip `xatlas` for triage metrics and as a fallback for well-behaved rigid meshes.

**The honest human-in-the-loop cost:** for a new product today, someone edits ~30 lines
(region heuristics or manual face-selection in Blender + region names/dimensions). ~10–30 min
per product. That step is where the next engineering investment should go: a small Blender
MCP-assisted (or in-browser, mesh-painting) "click region → name it" tool that emits the
same regions.json — not an ML model.

## 9. Remaining problems (cannot yet be automated reliably)

1. **Semantic region detection for arbitrary shapes** — pouch heuristics don't transfer to
   shoes/mice; commercial-licensed automatic part segmentation doesn't exist off-the-shelf.
   Mitigation: human labeling UI; heuristic library per product family.
2. **Projection choice per region** (planar / cylindrical for bottles / conformal for
   curved uppers) is a per-family decision.
3. **Physical scale**: AI meshes are unitless; mm dimensions must come from the client
   (here: 160×240×90 pouch spec).
4. **glTF UV-name loss** — convention documented in regions.json; enforce in loader.
5. **Meshy regeneration instability** — every regenerated mesh re-runs onboarding; UVs are
   not transferable between generations.

## Artifacts index

```text
experiments/uv-onboarding/
├── inspect/            inspect_glb.py, blender_checker_render.py, reports, pouch-clean.glb
├── uv-variants/        blender_smart_uv.py, analyze_variant.py, stats + wireframes
├── semantic/           build_customizable.py, make_templates.py
├── export/             product-customizable.glb, regions.json, uv-template.svg/png,
│                       diagnostic-texture.png, harness.html
├── screenshots/        harness.png (Stage 11 proof), diag/ (6-view validation)
└── repos/              PartUV, PartField, Open3DStudio, 3DAIGC-API, UVgami, xatlas, xatlas-three
```
