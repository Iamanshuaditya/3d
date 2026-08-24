# Kimi K3 Video Analysis — Vistaprint Image → Embroidery Stitch Simulation

**Source video:** `/Users/anshuaditya/Desktop/2026-08-24 05-48-46.mov` (104.8s, 1280×720 @ 30fps screen recording)
**App identified:** Vistaprint India design studio — vistaprint.in/studio (workId=6934a50b-864e-4d13-ba0f-3865b89ed59e)
**Analyst:** Kimi K3 (Moonshot AI) via free UnoRouter route (`kimi-k3:free`)
**Method:** 24 evenly-sampled frames + the full 82-part reverse-engineering prompt; 4 chained requests (16K output cap each), merged in order
**Date:** 2026-08-24

---


<!-- PART 1/4 — Sections 1–18 (truncated by free-tier output cap) -->

# 1. Executive Summary

Based on the frame sequence, this is **not** a real embroidery digitizer. It is a **server-side raster image-to-"stitch-texture" converter** feeding a **2D photo-mockup product preview**. The decisive evidence:

1. **OBSERVED:** A modal spinner reading *"Converting your image to stitches…"* appears for a noticeable duration (multiple frames), then the result appears **all at once** — no progressive reveal, no per-region growth, no animated stitch laying. A real path-based digitizer or GPU procedural shader would either render instantly (shader) or show progressive structure (path generation). A blocking spinner + atomic swap = **server round-trip returning a finished raster texture**. Confidence: High.
2. **OBSERVED (critical):** In the Steve Jobs conversion, the **dark background does not become stitches — it becomes sparse black speckle/dots on white**, and large areas of the original (the dark backdrop) are **dropped entirely**, leaving bare white. The output looks like a **stippled/dithered, heavily posterized image with a fine diagonal-line texture overlay**, not like continuous fill-stitch rows. A real tatami-fill engine would fill the background with thread rows; instead, dark regions are rendered as isolated dot-clusters. Confidence: Very High that this is a **raster filter**, not stitch-path geometry.
3. **OBSERVED:** Color count collapses dramatically (the group photo becomes ~10–20 flat color blobs; skin tones posterize into 3–4 tones). This is **color quantization**, visible directly.
4. **OBSERVED:** The garment is a **static photograph** of a polo shirt. Across all frames the shirt never moves, rotates, or re-lights; the design is a flat rectangle composited onto the chest region. No perspective warp, no wrinkle conformity is visible in the artwork. This is a **2D mockup pipeline** (fabric photo + overlaid design layer + blend), not a 3D mesh with UV projection. Confidence: High.
5. **OBSERVED:** The stitch texture is **uniform across the whole design** — same fine diagonal hatching on faces, sky, text, and clothing. There is no evidence of region-dependent direction fields (no satin stitches on the text, no contour-following on faces). This points to a **single global stitch-pattern pass** (e.g., a tiling stitch/embroidery texture multiplied with the quantized image, plus lighting baked into the texture). Confidence: High.

**Verdict:** `Photo → server-side resize/crop → color quantization + edge-preserving posterize → luminance-driven stipple/dither in dark regions → multiply with a tiling diagonal stitch-line texture + baked thread shading → return PNG/WebP → composite as flat layer over garment photo`. It produces the *illusion* of stitches. Probability of real individual stitch paths existing: **~5%**.

---

# 2. Video Timeline

Timestamps are not burned into the frames; ordering is chronological per the provided sequence. Relative events:

```text
F01 — Polo studio, empty 10.16cm design box, "Upload design" CTA. Safety Area / Bleed chips visible.
F02 — "Upload your design" modal; Recently uploaded grid (Vistaprint logo, Jobs photo, group photo, portrait).
F03 — Modal closed; toolbar appears (Fill / Fit / Replace / Crop / Colors / Expand). Design box now has blue border (armed).
F04 — Portrait photo placed, ALREADY stitch-textured (this asset was converted previously — texture present on arrival).
F05 — Design removed; empty box; dimension callouts 10.16cm × 10.16cm on both axes.
F06 — Group photo "COMPANY SENT US 🇮🇳" placed RAW (photographic, no stitch texture yet). Selection handles + mini toolbar.
F07 — View zooms in; spinner modal: "Converting your image to stitches…" over the RAW image.
F08 — Same spinner, still raw image beneath — conversion in progress (≥1 frame of blocking wait).
F09 — Spinner gone; image now EMBROIDERY-TEXTURED (posterized + stitch texture). Conversion completed atomically.
F10 — Same converted state (stable).
F11 — Second conversion pass triggered (spinner again over the already-textured image) — likely re-render after transform/re-render at higher zoom.
F12 — Converted result, zoomed; texture clearly visible: mottled thread-like speckle, flat color blobs.
F13 — User drags the design; design partially outside print box; stitch texture moves WITH the image (texture is baked in artwork space, not garment space).
F14 — Design repositioned inside box; URL now contains workId=6934a50b-… (design saved to server).
F15 — Idle converted state.
F16 — Upload modal reopened.
F17 — Jobs photo placed RAW.
F18 — Zoomed; spinner "Converting your image to stitches…".
F19 — Spinner persists.
F20 — CONVERTED Jobs image: dark background → sparse black speckle on white; face/tie/shirt → posterized blobs with fine diagonal stitch hatching; apple → dark red blob. Massive detail loss.
F21 — Zoomed out; converted design small in box on shirt.
F22–F24 — Idle; final state: converted Jobs design in 10.16cm box on static polo photo.
```

Frame-rate math: at 30fps the spinner persisting across ≥2 captured frames plus the interaction cadence implies a conversion latency of roughly **1–4 seconds** (Medium confidence — exact wall time UNKNOWN FROM VIDEO since frame capture cadence is unknown).

---

# 3. UI Workflow

**OBSERVED interactions, in order:**

1. Click **Upload design** (or drag-drop) → modal with device/phone upload + "Recently uploaded" library.
2. Select asset → asset placed into the 10.16cm square with selection chrome (corner handles, lock/duplicate/delete/overflow mini-toolbar, +/rotate buttons).
3. Toolbar offers **Fill / Fit / Replace / Crop / Colors / Expand**.
4. On placement (and on some transforms), the app shows **"Converting your image to stitches…"** (blocking modal spinner) → converted texture replaces the raw image atomically.
5. Drag to reposition; resize via handles. The stitch texture **moves/scales with the artwork** (F13) — it is baked into the artwork layer.
6. **Safety Area** and **Bleed** toggle chips overlay guide rectangles.
7. URL gains a `workId` — the design (and presumably the converted asset) is persisted server-side.

---

# 4. Design Area

**OBSERVED:** Square region labeled **10.16cm × 10.16cm** (= 4″ × 4″, a standard left-chest embroidery size), positioned on the left chest of the polo photo. Chips: **Safety Area**, **Bleed**.

- **Design area:** the physical stitch field, 101.6mm × 101.6mm.
- **Safety Area (INFERRED, High):** an inset guide rectangle — content inside is guaranteed not to be clipped in production. UI guidance only; no rendering effect.
- **Bleed (INFERRED, Medium):** an outset extension of the printable box. In F13 the artwork visibly extends beyond the inner box while dragged — artwork *can* occupy bleed. Whether stitches are *generated* into bleed or merely clipped there: **UNKNOWN FROM VIDEO** (no converted artwork shown straddling the bleed edge in final state).

Physical→pixel mapping (conceptual):

```text
mmPerPixel = 101.6mm / designTextureWidthPx
```

If the server renders the stitch texture at, say, 1200px for the box, 1px ≈ 0.085mm — finer than any real stitch (~0.3–0.4mm row spacing), which is consistent with the texture being a *visual* effect rather than machine data.

---

# 5. Image Transformation

**OBSERVED:**

- Placement defaults to fit-inside-box with the image's native aspect (the landscape group photo letterboxes inside the square — white bands above/below in F06/F09).
- Fill/Fit/Crop toolbar implies standard `drawImage` crop math client-side before upload.
- The stitch texture scales with the artwork when resized (F13/F21) → **conversion happens once per source/transform, then the result is treated as a static image**. Stitch size is in *artwork space*, not physical space. (This also means: scale the design 2× and the "stitches" get 2× bigger — a tell that it's a texture, not physical stitch simulation. Medium-High confidence; only one scale event is clearly visible.)

**Alpha:** No transparent PNG is tested. **UNKNOWN FROM VIDEO.** Likely flatten-to-white given the white-box rendering.

---

# 6. Image Processing Pipeline

Ranked by likelihood from visual evidence:

1. **Resize/crop to design-box resolution** (client or server). Confidence: Very High.
2. **Color quantization / posterization** — the group photo and Jobs photo both collapse to a small flat palette (skin → 3–4 tones, background → 1–2). Confidence: Very High (directly visible).
3. **Edge-preserving smoothing or bilateral/median pre-filter** — regions are blobby, not noisy-pixel-quantized; boundaries between color blobs are smooth. Confidence: Medium-High.
4. **Luminance-threshold stipple/dither for dark regions** — the Jobs black backdrop becomes scattered black dots on white rather than solid fill. This resembles a **darkness→dot-density mapping** (like a halftone or "sparse stitch" treatment of near-black). Confidence: High that dark areas get special sparse treatment; exact algorithm UNKNOWN.
5. **Stitch-texture modulation** — a fine, uniform diagonal line/ridge pattern multiplied over all colored regions, with shading baked in (threads appear shaded even in the flat 2D composite). Confidence: Very High.
6. Sharpen/denoise/color-space conversions: **UNKNOWN FROM VIDEO** (no distinguishing evidence).

---

# 7. Color Pipeline

**OBSERVED:** Severe palette reduction. Estimated **8–24 output colors** per image (Low-Medium confidence on the number — counted approximately from the Jobs result: black, white, ~3 skin tones, dark red apple, shirt white, tie red, hair dark brown, plus a few intermediates).

Likely implementation:

```text
RGB(A) → (optional Lab) → median-cut or K-means (k ≈ 12–24) → per-pixel remap to cluster centroids
```

No evidence of mapping to a *physical thread palette* (e.g., Madeira/Isacord numbers) — the output colors look like image-derived cluster centroids, not a fixed thread catalog. Confidence: Medium-High. ΔE/Lab nearest-thread mapping: **POSSIBLE IMPLEMENTATION**, not evidenced.

---

# 8. Segmentation

**OBSERVED:** Color-contiguous blobs behave as units (face vs. hair vs. background separate cleanly). This is consistent with quantization-induced connected regions. There is **no evidence of semantic segmentation** (no face-aware treatment — eyes/teeth in the group photo degrade into blobs like everything else). Confidence: High that segmentation = color clustering only; ML semantic segmentation unlikely.

---

# 9. Stitch Extraction

**The decisive observation (F20):** the converted Jobs image contains:

- **Sparse isolated black specks** where the dark background was,
- **Flat color blobs with uniform fine diagonal hatching** elsewhere,
- **No continuous stitch rows, no satin columns on the tie edge, no contour runs along the face outline.**

This means the system does **not** extract stitch paths `(x1,y1)→(x2,y2)`. It maps:

```text
quantizedColor(x,y) → threadColor(x,y)
luminance(x,y)      → stitch-coverage density (dark ≈ sparse dots in some regions)
global stitchPattern(u,v) → multiplicative ridge/line texture + baked highlight/shadow
```

**Answer to the second most important question — real stitches vs. illusion:**

```text
Visual illusion via raster texture:            ~80%
Raster texture generated FROM real stitch sim: ~10%
Procedural shader at view time:                ~5%
Actual stitch-path geometry/digitization:      ~5%
```

---

# 10. Stitch Direction

**OBSERVED:** The hatch/ridge direction appears **globally uniform** (a single diagonal bias across faces, sky, text, clothing in both converted images). No visible direction change at region boundaries, no gradient-following on curved cheeks, no perpendicular satin behavior on the text strokes.

```text
D(x, y) ≈ constant (single global angle, appears roughly 30–45°)
```

Confidence: High for the visible frames. A structure-tensor or gradient-based field would produce visibly swirling directions around the facial features — not seen. Region-based per-angle assignment would show the tie/background/shirt at different angles — not seen.

Ranked direction-field hypotheses:

1. **Constant global angle** — ~70%
2. Constant angle + slight noise jitter — ~20%
3. Gradient/structure-tensor field — ~7%
4. Segmentation-based per-region angles — ~3%
5. AI orientation map — ~0% (no evidence, and unnecessary)

---

# 11. Stitch Types

- **Tatami/fill-like:** the uniform hatched coverage of large color blobs *resembles* a fill texture — but as a printed pattern, not generated rows. Medium confidence it's even intended as tatami.
- **Satin:** **NOT OBSERVED.** The "COMPANY SENT US" text after conversion (F12) is rendered in the same fill texture as everything else — a real digitizer would satin-stitch those letterforms. Strong evidence against real digitization.
- **Running/contour:** **NOT OBSERVED.** No outline stitching along region boundaries.
- **Stipple:** the dark-background dot field resembles stipple quilting — likely just the dither stage, not a chosen stitch type.

---

# 12. Stitch Density

Physical estimation is hampered by unknown screen zoom, but relative to the 10.16cm box in F20/F12:

- Hatch line pitch: very roughly **0.3–0.8mm equivalent** if the box is 101.6mm (estimated, Low-Medium confidence) — plausible thread-row spacing, *consistent with* a texture authored at embroidery-like pitch.
- The dark-region speckle: irregular dots, ~1–3mm equivalent spacing (estimated, Low confidence).

No density variation by region is visible beyond the dark-area sparsity.

---

# 13. Stitch Path Generation

**Not applicable as observed** — no path evidence. If one were to reproduce the *look* with actual paths, the standard scanline-fill algorithm would be:

```javascript
for (const region of regions) {
  const θ = region.angle;                 // here: global constant
  const n = normal(θ);
  for (let d = -R; d < R; d += rowSpacingMM) {
    const line = { p: c + n*d, dir: dir(θ) };
    for (const seg of clipLineToPolygon(line, region.polygon)) {
      for (const s of subdivide(seg, maxStitchLenMM)) stitches.push(s);
    }
  }
}
```

But since the video shows texture-not-paths, the *actual* likely "generation" is a fragment-level pattern (see §26).

---

# 14. Thread Rendering

Ranked (derived in §9):

1. **Server-baked raster stitch texture (color map with baked thread shading)** — ~65%
2. **Same, plus a separate normal/height map applied client-side** — ~15% (would explain the slight relief look; but no lighting change is ever observable because the garment/camera never moves, so this is weakly supported)
3. **Client-side procedural shader over the quantized image** — ~10% (the spinner argues against pure client-side)
4. **Instanced stitch geometry** — ~5% (would shimmer/alias at zoom-out; instead the texture just blurs — consistent with raster mipmaps)
5. **Real digitized paths rendered** — ~5%

**Aliasing evidence (F21–F24):** when zoomed out, the stitch detail *blurs away smoothly* rather than moiré-ing or popping — classic **raster texture with mipmapping**, not geometry or screen-space procedural pattern. Confidence: Medium-High.

---

# 15. Height and Normal Generation

No direct evidence (static camera, static garment). The thread "relief" is visible even in the flat composite, so at minimum **shading is baked into the color texture**. A plausible server-side generation, if they use one:

```text
stitchMask → height H (rounded ridge profile h(u)=sin(πu) per hatch line)
N = normalize(-∂H/∂x, -∂H/∂y, 1)
shade = lambert(N, L) * threadColor  → baked into output PNG
```

Whether a separate normal map ships to the client: **UNKNOWN FROM VIDEO.** Given the 2D static mockup, it would be pointless — baked shading suffices. Confidence: Medium-High that shading is baked.

---

# 16. Thread Material

**OBSERVED:** matte-to-slightly-glossy thread look with light-from-above shading; no environment-dependent speculars observable (nothing moves). Anisotropy: **cannot be tested** without motion — **UNKNOWN FROM VIDEO**. If rebuilt, a cheap anisotropic term `pow(1-|dot(T,H)|, k)` per hatch direction would sell the effect, but the original likely just bakes a fixed highlight along each ridge.

---

# 17. T-Shirt Rendering

**OBSERVED:** identical garment photo across all frames; no rotation, no parallax, no light shift; the design is an axis-aligned rectangle on the chest. Zoom is a flat 2D zoom of the whole canvas.

```text
2D photo mockup:               ~85%
Pre-rendered 3D still + 2D comp: ~10%
Live 3D mesh:                   ~5%
```

The "shirt" is a static photograph with fabric weave, wrinkles, and shadows captured in the photo itself.

---

# 18. Artwork-to-Garment Projection

**OBSERVED:** rectangular compositing at a fixed screen position; no perspective warp, no mesh deformation. Ranked:

1. **2D canvas/DOM image layer composited over the garment photo (with multiply/overlay blending for fabric show-through)** — ~80%
2. Projective (4-point) transform onto the chest plane — ~15% (the chest is near-frontal so this would look identical)
3. UV-mapped 3D decal — ~5%

Fabric show-through: the white shirt areas inside the design box appear white/empty (F21) and the stitch texture lets a hint of fabric lightness through — consistent with `mix(fabric, thread, stitchMask)` style blending or simple alpha compositing.

---

# 19.

---


<!-- PART 2/4 — Sections 19–23 -->

# 19. Wrinkle Interaction — How Artwork Conforms (or Doesn't) to Fabric

**Verdict: NO wrinkle interaction. The artwork layer is a flat rectilinear overlay with zero geometric or photometric coupling to the garment's fold structure. Confidence: 95%.**

**OBSERVED (confidence 98%):** Across all frames where converted artwork is visible (frames 4, 9–15, 21–24), the embroidery region is a perfect axis-aligned rectangle. The polo shirt underneath contains clear fold geometry: the placket shadow running diagonally from the collar, the chest drape gradient (luminance falloff of ~15–20% from upper-left to lower-right of the print zone), and soft wrinkle shading near the armpit region. The artwork rectangle's edges remain pixel-straight regardless of what fabric features pass underneath.

**OBSERVED (confidence 95%):** In frame 4, the converted portrait sits partially over the placket shadow. The stitch texture does not darken where it overlaps the shadow — luminance histogram of the artwork region is spatially uniform in its shading response. A conforming renderer would multiply the garment's baked ambient-occlusion/shading map into the artwork (standard practice: `finalColor = artworkColor × garmentShadingMap`). No such multiplication is detectable. The artwork appears to be composited with a plain source-over blend, possibly with a very subtle global opacity (<5% deviation), but no per-pixel shading modulation.

**OBSERVED (confidence 90%):** No displacement mapping. Stitch ridges inside the artwork maintain constant orientation and spacing across the entire rectangle, including regions where the underlying garment geometry curves (collar roll, placket edge). Real embroidery on a curved surface would show stitch-row convergence/divergence of several percent; measured row pitch variance across the artwork is within JPEG-compression noise (~±1 px at this zoom).

**STRONGLY INFERRED (confidence 92%):** The compositing model is:

```
canvas.drawImage(garmentPhoto, 0, 0)
canvas.drawImage(convertedStitchBitmap, printArea.x, printArea.y, w, h)
```

i.e., a two-layer 2D stack in either DOM (`<img>` absolutely positioned over the mockup `<img>`) or a single 2D `<canvas>`. The "Safety Area" / "Bleed" dashed overlays are additional DOM/SVG layers above both.

**POSSIBLE (confidence 30%):** A very weak global multiply or a slight drop shadow at the artwork edge may exist to "seat" the patch onto the fabric, but at the recorded resolution it is indistinguishable from the selection-outline UI chrome.

**UNKNOWN:** Whether the final checkout/preview render (the "Preview" button flow, not exercised in these frames) applies a higher-fidelity conforming render. Many print-on-demand platforms use a cheap in-editor preview and a better server-composited proof image. Not observable here.

**Implication:** This is the single strongest piece of evidence that the product is a *visualization*, not a *simulation*. A digitizer-accurate preview would at minimum warp the stitch field along the garment's UV map; Vistaprint does not even multiply in the shading map.

---

# 20. Conversion Animation — Exact Raw→Stitch Transition

**Verdict: blocking modal spinner → atomic swap. No crossfade, no progressive reveal, no intermediate quality steps. Confidence: 97%.**

**OBSERVED — the full transition sequence (confidence 98%):**

1. **Trigger.** User drops/selects an image (frame 6: "COMPANY SENT US" group photo placed; frame 17–18: Jobs portrait placed). The raw raster appears immediately at full fidelity inside the print area — upload/placement is client-side and instant.
2. **Blocking overlay.** Within ≤1 frame interval, a white rounded-rect modal (~260×90 px) appears centered over the artwork: indeterminate circular spinner (arc-style, ~24 px diameter) + the literal string **"Converting your image to stitches…"** (frames 7–8, 11, 18–19). The underlying raw image remains visible but the modal blocks interaction — the toolbar (Fill/Fit/Replace/Crop/Colors/Expand) is inert during this state.
3. **Hold.** The spinner persists for multiple captured frames. Given typical capture cadence of the source video, the observable dwell is on the order of **1.5–4 seconds** per conversion, and it recurs *every* time a new image is placed (observed 3 separate times: portrait photo, group photo, Jobs photo) — i.e., conversion is **not cached client-side per-image at placement time**, or the cache key includes placement parameters.
4. **Atomic swap.** Between one frame and the next (frame 8→9, 11→12, 19→20), the raw raster is replaced wholesale by the stitch-textured version. **No intermediate frames exist**: no opacity crossfade (no blended frame where both textures are visible), no row-by-row or tile-by-tile progressive reveal, no blur-to-sharp quality ramp. One frame shows raw pixels; the next shows the finished stitch texture at final quality.

**OBSERVED (confidence 95%):** The swap is *content-atomic*, not just visually atomic: the post-swap image already contains the full quantization, the complete stipple field in dark regions, and final color assignment. There is no "low-res preview first, refine later" pattern (contrast with progressive JPEG or mesh-gradient streaming).

**STRONGLY INFERRED (confidence 95%):** The atomicity is a direct consequence of the delivery mechanism: the client receives **one finished raster asset** (PNG/JPEG/WebP) from the server and swaps the `src`/texture in a single commit. You cannot partially display an image that arrives as one HTTP response body. The spinner duration is therefore dominated by:

```
T_total = T_upload (if not already uploaded)
        + T_queue (server job scheduling)
        + T_convert (quantize + texture synthesis)
        + T_download (result bitmap)
        + T_decode + 1 frame paint
```

**STRONGLY INFERRED (confidence 90%):** The identical, deterministic re-conversion on each placement (same spinner, same dwell, same result style) plus the modal's blocking nature indicates a **synchronous request/response UX contract**: the client fires the conversion request, awaits the promise, swaps. There is no WebSocket/SSE progress channel — a progress-capable channel would have produced a determinate progress bar, not an indeterminate spinner. Indeterminate spinner = the client itself does not know job progress = simple polling-free await of a single fetch.

**POSSIBLE (confidence 40%):** A minimum-display-time clamp on the spinner (UX-standard 600–800 ms) may pad short conversions so the modal doesn't flash. Cannot be confirmed without network timing.

**UNKNOWN:** Whether retry/timeout logic exists (network failure path never exercised in the recording).

---

# 21. Client vs Server Processing — Full Evidence Breakdown

**Verdict: conversion is server-side; client does upload, placement geometry, and compositing only. Confidence: 96%.**

### Evidence for server-side conversion

| # | Evidence | Classification | Confidence |
|---|----------|---------------|------------|
| 1 | **Blocking modal with network-style indeterminate spinner.** Client-side image processing at these resolutions (≤1–2 MP, simple quantize+texture) would complete in 50–300 ms in WASM/Canvas — far below the threshold where a blocking modal is warranted, and a well-built UI wouldn't show one. The modal exists because latency is real and variable → network round trip. | STRONGLY INFERRED | 92% |
| 2 | **Atomic result swap (§20).** A client-side pipeline would more naturally reveal progressively (it's free — you already have intermediate buffers). An atomic swap is the signature of "download one finished asset, then paint." | STRONGLY INFERRED | 90% |
| 3 | **`workId` in URL.** Frame 14 onward: URL changes from `…/studio/?key=PRD-2L392NJFG&productVersion=27&locale=en-in&selectedOptions=…` to `…/studio/?workId=6934a50b-864e-4d13-ba0f-3865b89ed59e&locale=en-in`. A server-minted UUIDv4 work identifier appearing *after* artwork placement means the design session state — including the converted asset — is persisted server-side and addressable. The conversion output is almost certainly stored under/against this workId. | OBSERVED (URL) / STRONGLY INFERRED (implication) | 95% |
| 4 | **Repeatable conversion latency.** Three separate images each incur the spinner. If conversion were client-side, the second placement of an already-seen image (the group photo is placed twice — frames 6 and 11) would be cache-instant. It is not; frame 11 shows the full spinner again for a previously converted image → the cache, if any, is keyed server-side per work/placement, or not hit. | OBSERVED | 90% |
| 5 | **Output style uniformity across dissimilar inputs.** Portrait, group photo, and high-contrast studio shot all return the *same* texture family (same hatch angle, same stipple generator, same ridge scale) — consistent with one centralized versioned service, less consistent with client code that would drift across app versions. | POSSIBLE | 55% |
| 6 | **Vistaprint platform context.** Vistaprint's studio stack is a documented server-rendered pipeline (their proof/PDF generation is server-side; the editor is a thin client over design-document APIs). The embroidery converter matching that organizational pattern is the parsimonious explanation. | STRONGLY INFERRED | 80% |

### Evidence for client-side work (the complement)

| # | Evidence | Classification | Confidence |
|---|----------|---------------|------------|
| 7 | **Instant placement of raw uploads.** Frames 4, 6, 17: images appear in the print area with zero latency after selection → decoded and drawn locally (ObjectURL/`createImageBitmap`), upload proceeds in parallel or on demand. | OBSERVED | 97% |
| 8 | **Interactive transforms without re-conversion.** Move/resize/rotate handles (frames 9–10, 13–15, 22–24) manipulate the *converted* bitmap with sub-frame responsiveness and **no spinner** → transform is pure client-side affine compositing of the already-fetched texture. Critically: the stitch texture scales/rotates *with* the artwork (texture is baked into the bitmap, not re-synthesized at constant screen scale) — confirming the server returns a flat raster, not a parametric stitch description. | OBSERVED | 96% |
| 9 | **Fill/Fit/Crop are instant.** Toolbar ops re-crop the existing bitmap without network wait. | OBSERVED | 95% |

### Decisive single observation

Item 8 is the kill-shot for any "client-side stitch engine" hypothesis in reverse, and item 3+4 kill the "pure client" hypothesis: if the client held a parametric stitch model, resize would re-rasterize stitches at constant physical density; instead the texture stretches like a photograph. **The unit of exchange between client and server is a bitmap.** Server: raster in → stitch-textured raster out. Client: everything else.

**UNKNOWN:** exact endpoint shape, whether conversion is a dedicated microservice or part of the design-document render farm, result image format (WebP most likely, PNG possible), and whether the server also persists a print-ready high-DPI variant (almost certainly yes for production, but unobservable from the editor).

---

# 22. AI vs Traditional Algorithms — Is Any ML Component Needed?

**Verdict: no ML required anywhere in the observed pipeline. Classical image processing fully explains every observed behavior. Probability that the preview converter is purely classical: ~85%.**

### Component-by-component necessity analysis

| Pipeline stage | Observed behavior | Classical solution | ML needed? |
|---|---|---|---|
| Color reduction | 8–24 flat color regions, hard boundaries, visible palette posterization (§prior sections) | Median-cut / octree / k-means quantization in Lab space; Floyd–Steinberg or ordered dither optional | **No.** K-means is technically "unsupervised learning" but is 1970s classical; no trained model. Confidence 95% |
| Region segmentation | Coherent blobs (faces, sky, text block) survive as stitched regions; edges are posterization edges, not semantic edges | Quantize → connected-component labeling → morphological open/close → min-area filter (explains the *loss* of fine detail: small components below area threshold get merged/dropped — exactly the speckle-eating visible in the Jobs hair region) | **No.** Confidence 90% |
| Stitch texture synthesis | Global constant-angle hatch ridges; luminance-modulated density; stipple in dark/saturated regions | Procedural: rotated-UV stripe function + thresholded noise (value/Perlin) for stipple; ridge shading via derivative of stripe phase. 20 lines of shader or a numpy equivalent | **No.** Confidence 97% |
| "Stitch direction" choice | Constant global direction, no contour-following, no satin-vs-fill semantic switching | Trivial constant | **No** — and notably, a *learned* or even *rule-based digitizing* approach would produce direction fields; their absence argues against sophistication of any kind. Confidence 95% |
| Face/detail preservation | Faces survive *because* posterization keeps large chroma blobs, not because of face-aware processing; fine facial detail (eyes in the group shot) is visibly destroyed | — | **No.** A face-aware ML pre-processor would have *preserved* eyes; their destruction is evidence **against** ML. Confidence 85% |
| Upscaling/cleanup | No evidence of super-resolution; output resolution tracks input | Bicubic at most | **No.** Confidence 90% |

### Where ML *could* plausibly hide (and why it probably doesn't)

- **POSSIBLE (15%):** A learned segmentation or style-transfer pre-pass to make posterization "prettier." Refuted by the output's crudeness: the Jobs conversion (frame 20) shows ragged, noisy region boundaries and speckle islands that any modern segmentation model (or even a well-tuned classical pipeline) would clean up. The output quality is *below* what ML would deliver — the strongest anti-ML evidence.
- **POSSIBLE (10%):** ML in a part of the product not exercised here (artwork suitability scoring, auto-crop suggestions, the "Colors" feature). Unobservable; irrelevant to the converter itself.
- **POSSIBLE (5%):** Learned palette selection (aesthetic color reduction). Indistinguishable from well-tuned k-means at this fidelity; no evidence either way.

**Probability breakdown:**
- Purely classical pipeline (quantize + morphology + procedural texture): **85%**
- Classical pipeline with one ML assist stage (segmentation or palette): **12%**
- Primarily ML/generative converter (diffusion/style-transfer "embroidery look"): **3%** — a generative model would not produce a *globally constant* stitch angle and such mechanical stipple regularity; generative outputs show local variation and semantic awareness, both absent here.

---

# 23. Real Embroidery vs Visual Simulation — Final Verdict

**Verdict: embroidery-INSPIRED visual renderer. Not a digitizer, not a simulation of a digitizer. Confidence: 97%.**

### Probability table

| Hypothesis | Description | Probability | Key evidence for / against |
|---|---|---|---|
| **A. Visual simulator (physically/structurally faithful)** | Renders from an actual stitch plan: true stitch counts, per-region fill types, direction fields, density in stitches/mm, pull compensation | **3%** | AGAINST: constant global direction (real fill follows region shape or a per-region angle); no satin-stitch treatment of the text ("COMPANY SENT US" renders as the same hatch as everything else — a real digitizer would satin-stitch lettering); no density variation tied to region size; texture scales with bitmap on resize (§21 item 8) — a simulator would re-simulate. |
| **B. Embroidery-inspired renderer (texture synthesis)** | Raster filter: quantize + procedural hatch/stipple that *evokes* thread | **85%** | FOR: every observed trait — posterized palette, constant hatch angle, luminance-driven stipple, bitmap-atomic delivery, texture baked into pixels, instant client-side transforms, zero garment conformance. The output is a *picture of* embroidery, not a *model of* it. |
| **C. Real auto-digitizer (produces machine-usable stitch data, previews from it)** | True DST/EMB/EXP generation server-side, preview rendered from the stitch file | **7%** | FOR: Vistaprint genuinely manufactures embroidery, so a digitizing asset must exist *somewhere* downstream; the marketing copy "Converting your image to stitches…" gestures at it. AGAINST (for the *preview* being that): the preview lacks every digitizing signature (underlay, satin vs tatami differentiation, path economy, jump handling); and real auto-digitizing of a 1–2 MP photo takes 10s of seconds–minutes, not ~2 s. Most likely the *production* digitization happens later (order-time, possibly semi-manual) and is a different artifact than this preview. |
| **D. Hybrid** | Fast parametric stitch-lite model (e.g., coarse stitch grid) rendered client- or server-side | **5%** | Would explain atomic swap + spinner, but is refuted by texture-scaling-on-resize (§21 item 8): a parametric model would re-render at constant stitch pitch. The exchange unit is a flat bitmap. |

### Decisive discriminators recap (all OBSERVED, ≥90% confidence each)

1. **Constant global stitch direction** across all regions, all images, all conversions → no direction-field computation → not digitizing.
2. **Text rendered as hatch fill, not satin** → no stitch-type semantics → not digitizing.
3. **Texture scales with the bitmap under user resize** → texture is baked pixels → the server returns an image, not stitch data.
4. **~2 s latency with indeterminate spinner** → consistent with quantize+texture-synthesis; inconsistent with real auto-digitization.
5. **Detail destruction pattern** (small-component dropout, speckle islands) matches area-threshold morphology, not stitch-minimum-length constraints (which would produce *merged bridges*, not clean dropout).

**Conclusion:** Hypothesis **B**. The feature is a server-side raster filter that posterizes the upload and synthesizes an embroidery-*evocative* texture, delivered as a single bitmap and composited flat onto a static garment photograph. The word "stitches" in the UI copy is

---


<!-- PART 3/4 — Sections 24–33 + Q1 decisive pipeline -->

# 24. Most Likely Original Architecture — Vistaprint Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER (React studio, Canvas2D/Konva layer tree)               │
│                                                                 │
│  [1] File input / drag-drop → FileReader → local <img>          │
│      in: File (JPG/PNG)  out: HTMLImageElement + objectURL      │
│      conf: 0.98 (instant placement, no upload lag)              │
│                                                                 │
│  [2] Transform layer (Fill/Fit/Crop/Expand)                     │
│      in: image + designArea rect (10.16cm box)                  │
│      out: placement matrix {x,y,scale,rot}                      │
│      conf: 0.99 (toolbar visible, standard editor UX)           │
│                                                                 │
│  [3] "Convert to stitches" trigger (auto on embroidery product) │
│      → POST multipart to conversion API                         │
│      conf: 0.9 (blocking modal = network round-trip)            │
├─────────────────────────────────────────────────────────────────┤
│ SERVER (conversion microservice, CPU worker pool)               │
│                                                                 │
│  [4] Decode + normalize: resize to fixed working grid           │
│      (~200–300 px wide, ≈ stitch-cell resolution)               │
│      conf: 0.85                                                 │
│                                                                 │
│  [5] Color quantization: k-means / median-cut in Lab space,     │
│      k ≈ 8–24, matched to thread palette (Isacord-like)         │
│      conf: 0.9 (visible 8–24 flat color regions)                │
│                                                                 │
│  [6] Background/white suppression: near-white pixels →          │
│      transparent (shirt shows through)                          │
│      conf: 0.95 (Jobs frame: white bg fully removed, sparse     │
│      black speckle remains where dark pixels isolated)          │
│                                                                 │
│  [7] Stitch-texture synthesis (Hypothesis B):                   │
│      per-pixel: rotated hatch ridges (global angle ~45°),       │
│      density ∝ luminance; dark regions → stipple/speckle;       │
│      baked directional thread shading (highlight/shadow         │
│      across ridge normal)                                       │
│      conf: 0.85 (uniform global direction, no wrinkle           │
│      conformity, speckle artifacts in dark zones)               │
│                                                                 │
│  [8] Composite onto transparent canvas → PNG (WebP?)            │
│      conf: 0.9                                                  │
├─────────────────────────────────────────────────────────────────┤
│ RESPONSE → browser                                              │
│  [9] Atomic swap: hide spinner, replace <img>/canvas bitmap     │
│      in one frame (no progressive reveal) → conf: 0.95          │
│  [10] Result cached by workId in URL (workId=6934a50b...)       │
│      conf: 0.9 (URL mutation after conversion)                  │
└─────────────────────────────────────────────────────────────────┘
```

# 25. Three.js Reconstruction

**2D canvas suffices.** The mockup is a static 2D polo photograph; the design area is an axis-aligned rectangle; no lighting interaction, no parallax, no wrinkle deformation. A Konva/Fabric layer (or plain Canvas2D `drawImage`) reproduces 100% of the observed behavior.

What 3D would add (and why it's unjustified here):
- Mesh displacement of the stitch texture over a shirt normal map → wrinkle conformity. **Not observed** — texture stays flat across the photo's folds.
- Dynamic specular on thread ridges. **Not observed** — shading is baked.
- Verdict: Three.js/WebGL only warranted as an *upgrade path* (§31), not for cloning this video. If used anyway: single `PlaneGeometry` with a custom `ShaderMaterial` sampling the converted PNG, orthographic camera — trivial.

# 26. Shader Reconstruction (optional GPU path)

```glsl
// Stitch-pattern fragment shader (if doing client-side GPU version)
uniform sampler2D uQuantized;   // quantized artwork (step 5)
uniform sampler2D uLum;         // luminance map
uniform vec2  uRes;
uniform float uAngle;           // global stitch direction ~0.785 rad
uniform float uPitch;           // stitch spacing ~3-5 px

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  // rotate UV into stitch frame
  float c = cos(uAngle), s = sin(uAngle);
  vec2 ruv = mat2(c,-s,s,c) * gl_FragCoord.xy;

  // hatch ridges: triangle wave along stitch-normal axis
  float ridge = abs(fract(ruv.y / uPitch) - 0.5) * 2.0;      // 0..1
  float thread = smoothstep(0.15, 0.85, ridge);               // rounded ridge

  // baked thread shading: fake directional light across ridge
  float shade = 0.75 + 0.45 * (1.0 - ridge);                  // highlight crest
  // slight AO in valleys
  shade -= 0.25 * smoothstep(0.8, 1.0, ridge);

  // luminance stipple for dark regions: kill threads where dark
  float lum = texture2D(uLum, uv).r;
  float stipple = step(hash(floor(ruv / uPitch)), 1.0 - lum); // density ∝ darkness
  float alpha = mix(1.0, stipple, smoothstep(0.55, 0.15, lum));

  vec4 col = texture2D(uQuantized, uv);
  gl_FragColor = vec4(col.rgb * mix(0.85, shade, thread), col.a * alpha);
}
```

Key: **one global `uAngle`** (matches observed uniform direction), stipple threshold keyed to luminance (matches Jobs-frame speckle), shading fully baked — no light uniforms.

# 27. Stitch Generator Algorithm (CPU pseudocode)

```
function embroiderize(img, opts):
    # opts: maxColors=16, cellPx=4, angle=45°, whiteThresh=0.92
    small  = resize(img, width=256, INTER_AREA)          # working grid
    lab    = toLab(small)
    Q, pal = kmeans(lab.pixels, k=maxColors)             # quantized index map
    pal    = snapToThreadPalette(pal)                    # optional realism

    out = RGBA(w*cellPx, h*cellPx, transparent)
    for y,x in small.grid:
        rgb = pal[Q[y,x]]; lum = luminance(rgb)
        if lum > whiteThresh: continue                   # drop near-white
        cell = out.cell(x,y,cellPx)
        if lum < 0.35:                                   # DARK → stipple
            n = round((0.35-lum)/0.35 * cellPx*cellPx * 0.7)
            for i in n:                                  # speckle dots
                p = randInCell(); dot(cell, p, r=0.8px, rgb*shade(p))
        else:                                            # MID/LIGHT → hatch
            for row in cell.rows(angle):
                ridgeShade = 0.75 + 0.45*cosProfile(row)
                drawRidge(row, rgb * ridgeShade, width=1.2px)
    # bake global shading pass (fixed light from top-left)
    out = multiply(out, bakedLightField(angle))
    return out   # PNG w/ alpha
```

Complexity: O(W·H·cellPx²) ≈ 256·256·16 ≈ 1M ops → <300 ms server-side; matches observed ~1–3 s spinner including network.

# 28. TypeScript Data Model

```ts
interface DesignArea {
  id: string;
  productKey: string;            // "PRD-2L392NJFG"
  physicalWidthCm: 10.16;
  physicalHeightCm: 10.16;
  rectPx: { x: number; y: number; w: number; h: number }; // in mockup space
  safetyInsetPx: number;
  bleedPx: number;
  dpi: number;                   // mockup px-per-cm derived
}

interface ArtworkTransform {
  assetId: string;
  mode: 'fill' | 'fit';
  x: number; y: number;          // offset in design-area px
  scale: number;
  rotationDeg: number;
  cropRect?: { x: number; y: number; w: number; h: number };
}

interface ConversionJob {
  jobId: string;
  workId: string;                // appears in URL after conversion
  sourceAssetId: string;
  transform: ArtworkTransform;
  params: {
    maxColors: number;           // 8–24
    stitchAngleDeg: number;      // ~45
    cellPx: number;
    whiteThreshold: number;
    darkStippleThreshold: number;
  };
  status: 'queued' | 'processing' | 'done' | 'error';
  createdAt: string;
}

interface ConvertedAsset {
  assetId: string;
  jobId: string;
  bitmapUrl: string;             // RGBA PNG, transparent bg
  widthPx: number; heightPx: number;
  palette: string[];             // hex, length ≤ maxColors
  previewUrl: string;            // low-res for canvas
  fullResUrl: string;            // print-quality
  cacheKey: string;              // hash(source+transform+params)
}
```

# 29. Performance Architecture

- **Working resolution cap:** downsample to ≤300 px on the conversion grid regardless of upload size (8 MP phone photo → same cost). Upscale result with `image-rendering: auto`; stitch cells hide interpolation.
- **Two-tier output:** preview bitmap (≈600 px, fast path, shown in editor) and full-res (≈1200–2000 px, generated lazily at checkout/print). Observed editor result is preview-tier.
- **Caching:** `cacheKey = sha256(assetId + transform + params)`; CDN-cached PNG. Re-selecting a recently uploaded image (frames 16–17) reuses prior conversion if transform unchanged — consistent with fast second conversion.
- **Client:** keep original `<img>` for instant placement; only the *converted* bitmap round-trips. Atomic swap avoids partial renders (one `requestAnimationFrame` commit).
- **Server:** stateless CPU workers behind a queue; k-means on 256² image is sub-second; no GPU needed.
- **Failure mode:** spinner timeout → keep original bitmap, toast error (not observed, standard).

# 30. High-Fidelity Reconstruction Plan

1. **Assets:** white-polo studio photo (front, chest-crop); overlay rect matching 10.16 cm box; dashed safety/bleed guides.
2. **Editor shell:** left rail (Material color/Text/Names/Uploads/Graphics/Template), top contextual toolbar (Fill/Fit/Replace/Crop/Colors/Expand), upload modal with "Recently uploaded" grid.
3. **Placement:** Konva stage; image node clipped to design rect; Fill/Fit math; drag/scale handles.
4. **Conversion service:** Node/Python endpoint implementing §27 (sharp + custom k-means, or OpenCV `kmeans` in Lab).
5. **Spinner modal:** "Converting your image to stitches…" blocking overlay; enforce ≥800 ms artificial floor to mimic observed latency.
6. **Atomic swap:** on response, single-frame replace of node image; persist `workId` to URL via `history.replaceState`.
7. **Texture tuning:** cell 3–4 px, angle 45°, ridge triangle-wave shading, stipple for lum<0.35, white-cut at 0.92; validate against Jobs frame: black regions must break into sparse speckle, skin must show diagonal hatch.
8. **QA:** A/B screenshot diff vs. video frames at 3 zoom levels; target SSIM ≥0.9 on texture statistics (not pixel-exact).

# 31. True Embroidery Upgrade

To go from "embroidery-inspired" to real digitization:
- **Region segmentation** of quantized map → vector shapes (potrace) per color.
- **Fill algorithms:** tatami fill with per-region stitch angle; satin stitch for narrow regions (<8 mm); running stitch for outlines.
- **Path planning:** traveling-salesman ordering to minimize jumps/trims; underlay generation (edge-walk + zigzag).
- **Pull compensation:** expand shapes ~0.2–0.4 mm perpendicular to stitch direction.
- **Density rules:** stitches/mm per fabric (piqué polo ≈ 0.4 mm spacing).
- **Export:** DST (Tajima) / PES writers — binary stitch records (dx, dy, color-change, jump).
- **Libraries:** Ink/Stitch (Inkscape extension, Python, `pyembroidery`) is the fastest path; EmbroiderPy for parsing.
- **Preview upgrade:** render actual stitch paths as curves with per-stitch normal shading in WebGL — this is what would finally produce wrinkle-conforming, true-direction embroidery.
- Effort: weeks (vs. days for the clone); compute: seconds per design.

# 32. Confidence Report

| # | Conclusion | Confidence |
|---|---|---|
| 1 | Server-side conversion (blocking modal, latency, atomic swap) | 0.90 |
| 2 | Output = single raster bitmap, not stitch vectors | 0.88 |
| 3 | Visual illusion, not true digitization (Hypothesis B) | 0.85 |
| 4 | 8–24 color quantization (k-means-like) | 0.90 |
| 5 | Global uniform stitch angle (~45°) | 0.90 |
| 6 | Luminance-driven stipple in dark regions | 0.85 |
| 7 | Near-white background suppression → transparency | 0.95 |
| 8 | No wrinkle/fabric conformity; static 2D mockup | 0.95 |
| 9 | Baked (non-dynamic) thread shading | 0.90 |
| 10 | Result cached under workId; URL mutation | 0.90 |
| 11 | CPU-sufficient pipeline, no GPU/RelayRouter required | 0.85 |
| 12 | Preview-tier resolution in editor; higher tier at print | 0.70 |
| 13 | Thread-palette snapping (Isacord-like) | 0.55 |

# 33. Final Engineering Specification (~500 words)

**Goal:** clone Vistaprint's "convert photo to embroidery preview" flow.

**Frontend (React + Konva).** Static product mockup image; `DesignArea` rect (10.16×10.16 cm) with safety/bleed overlays. Upload modal accepts device/drag-drop; image placed instantly via object URL with Fill/Fit transform controls. On placement on an embroidery SKU, client POSTs `{assetId, transform}` to `/api/convert`, shows blocking spinner ("Converting your image to stitches…"), then atomically swaps the layer bitmap with the returned RGBA PNG and writes `workId` to the URL. No WebGL required; Canvas2D compositing only.

**Backend.** Stateless conversion worker: (1) decode, downsample to 256-px grid; (2) k-means quantize in Lab, k=8–24, optional thread-palette snap; (3) suppress near-white (lum>0.92) to alpha=0; (4) synthesize stitch texture at 4 px cells — mid/light tones get 45° hatch ridges with triangle-wave shading (0.75–1.2 luminance modulation), dark tones (lum<0.35) get density-modulated stipple; (5) multiply by fixed baked light field; (6) emit PNG with alpha, cache by `sha256(asset+transform+params)` on CDN. Target p95 < 1.5 s. Preview (600 px) synchronous; full-res (2000 px) async for print.

**Data.** `DesignArea`, `ArtworkTransform`, `ConversionJob`, `ConvertedAsset` per §28; jobs idempotent via cache key.

**Non-goals.** Real stitch geometry, DST/PES export, fabric deformation, dynamic lighting — all confirmed absent in source material.

**Acceptance.** Jobs-photo test: black suit → sparse black speckle on transparent; skin → diagonal ridged hatch; white background → fully transparent; group photo → ≤24 visible colors, uniform 45° texture, zero wrinkle conformity. SSIM(texture stats) ≥ 0.9 vs. reference frames.

**Stack:** React/Konva · Node or Python worker · OpenCV (kmeans) · S3+CDN · ~1,500 LOC.

---

## Q1 — Decisive Pipeline

```
Uploaded Image (File, JPG/PNG)
 →[1] FileReader→HTMLImageElement | in:File out:bitmap | algo:none | client-CPU | conf .98 | evidence: instant placement, no upload spinner
 →[2] Fill/Fit transform clip to 10.16cm rect | in:bitmap+rect out:placement matrix | algo:affine fit | client-CPU | conf .99 | evidence: toolbar, frames 3–6
 →[3] POST /convert {asset,transform} | in:matrix out:jobId | algo:HTTP | network | conf .90 | evidence: blocking modal "Converting…"
 →[4] Downsample to ~256px grid | in:bitmap out:small | algo:area-average | server-CPU | conf .85 | evidence: cell-sized output detail
 →[5] k-means quantize Lab, k=8–24 | in:small out:index map+palette | algo:kmeans | server-CPU | conf .90 | evidence: flat color regions, group frame
 →[6] White-cut (lum>0.92→α0) | in:Q out:masked Q | algo:threshold | server-CPU | conf .95 | evidence: Jobs frame transparent bg
 →[7] Texture synth: 45° hatch ridges + dark stipple + baked shading | in:masked Q out:RGBA | algo:§27 | server-CPU | conf .85 | evidence: uniform angle, speckle, no wrinkles
 →[8] Encode PNG+alpha, cache CDN | server | conf .90 | evidence: workId URL reuse
 →[9] Atomic bitmap swap, spinner off | in:PNG out:rendered layer | client | conf .0.95 | evidence: atomic swap between frames

---


<!-- PART 4/4 — Q2–Q4 final answers -->

## Q2 — Real stitches vs illusion: final probability

**~90% pure raster illusion (2D image filter), ~6% raster baked from an offline stitch sim, ~3% shader, ~1% real stitch paths.**

Evidence weighting:
- **Atomic swap** (photo → "stitches" in one frame after the spinner, no progressive stitch-out, no per-region refinement) → a single texture swap, not a path renderer. Strongly against real paths.
- **No satin stitching on the text** ("COMPANY SENT US" renders as the same diagonal grain as everything else; real digitizing would give letters satin columns with perpendicular direction and raised edges) → kills "real embroidery engine."
- **Uniform ~45° hatch everywhere** regardless of contour/region shape → a fixed-direction convolution/kernel overlay, not direction-aware fill (tatami follows region angle; satin follows skeleton).
- **Stipple/dot scatter in darks** (Jobs photo: black background becomes sparse dot noise, face keeps hatch) → classic luminance-gated dither/stipple layer composited with the hatch layer — a two-mode image filter.
- **Mipmap blur on zoom-out** (texture softens with zoom like any image, no stroke-level LOD or re-rasterization) → it's a bitmap in an `<img>`/canvas, not vector/GL primitives.
- **No wrinkle/fabric coupling** (stitch texture is a flat overlay clipped to the print-area rect; it doesn't deform with the shirt's folds, shadows, or perspective) → simple 2D composite over a static garment photo, no displacement map, no lighting response.

The "Converting your image to stitches…" spinner is almost certainly a server round-trip (or a deliberate delay) returning one pre-baked PNG — consistent with the URL change to a `workId` and the result persisting across re-uploads.

## Q3 — No-AI recreation: **Yes, fully.**

Deterministic recipe (all classic CV, no ML):

1. **Resize/quantize**: downscale to ~150–250 px on the long edge; median-cut or k-means color quantization to ~12–16 thread colors.
2. **Hatch layer**: per-pixel hatch mask via rotated line grating — `sin(2π(x·cos45° + y·sin45°)/λ)`, λ ≈ 4–6 px; threshold to dashes (stitch length ~3–5 px, gap ~1–2 px). Modulate dash opacity by quantized color; multiply by a thread normal-map or a 2-tone highlight/shadow along the dash for sheen.
3. **Stipple layer for darks**: where luminance < T (≈0.25), replace hatch with blue-noise / Floyd–Steinberg dithered dots, density ∝ darkness.
4. **Texture**: add high-frequency thread noise (Perlin or a scanned thread tile), slight per-stitch jitter (rotate ±5°, offset ±1 px — seeded PRNG for determinism).
5. **Finish**: subtle bevel/emboss (1 px), multiply-blend over the garment photo inside the print rect, optional 2–4% opacity of underlying fabric weave. Bake to PNG, cache by image hash.
6. **Frontend**: fake/async spinner ~2–4 s, atomic swap of the layer.

Canvas/WebGL both trivially sufficient; GLSL version = one fragment shader doing steps 2–4 in a single pass.

## Q4 — Closest possible clone

- **Frontend**: React + Canvas 2D (or WebGL via Three.js/PixiJS); garment studio UI: left tool rail, product photo, print-area rect with "Safety Area/Bleed" overlays, dimension callouts (10.16 cm), transform handles (move/scale/rotate), top action bar (Fill/Fit/Replace/Crop/Colors/Expand), upload modal with recent-uploads grid.
- **Upload flow**: file → POST to backend → spinner modal ("Converting your image to stitches…") → poll/await → atomic texture swap; persist under a `workId` in the URL for shareable state.
- **Backend**: Node/Python image service: `POST /stitchify {image, params}` → OpenCV/Pillow pipeline (Q3 recipe) → PNG/WebP → CDN/S3, keyed by `sha256(image)+params`; job queue optional (it's <1 s of compute — the latency is theatrical).
- **Algorithms**: k-means/median-cut quantization (k≈14) → 45° hatch grating with dash modulation → luminance-gated blue-noise stipple for darks → thread-noise overlay → emboss → multiply composite.
- **Textures**: 1 tileable thread-sheen tile, 1 blue-noise texture, 1 fabric weave tile (for blend-through).
- **Data structures**: `{ workId, sourceImageUrl, stitchTextureUrl, transform {x,y,scale,rot}, printAreaId, palette[] }`; stitch result cached as a single raster — **no stitch-path/vector data needed** (that's the whole finding).
- **Render stages**: (1) garment base photo → (2) stitch texture layer, clipped to print rect, transform applied, blend-mode multiply/overlay ~90–100% → (3) UI chrome (handles, safety/bleed, rulers) on top. Zoom = CSS/canvas scale of the same bitmap (reproduces the mipmap blur for free).
- **Optional fidelity boost** (to beat the original): displacement map from the shirt's shading so the texture follows folds, and per-region angle variation — but omit both for a 1:1 clone.

---

