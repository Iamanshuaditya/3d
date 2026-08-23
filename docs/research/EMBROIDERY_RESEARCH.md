# Embroidery: research, options and the choice made

Scope: turn a customer's raster artwork into a believable stitched preview on a
garment, in the browser, without sending the artwork anywhere, and without
taking on a licence that a commercial product cannot carry.

---

## 1. Three separate problems, deliberately not conflated

| # | Problem | Needed now? |
|---|---|---|
| 1 | **Visual embroidery simulation** — it looks like thread under light | Yes |
| 2 | **Stitch-path representation** — ordered segments approximating real stitch placement | Yes, as the substrate for #1 |
| 3 | **Machine digitisation** — DST/PES/JEF with underlay, pull compensation, trims, sequencing, fabric behaviour | No. Researched, kept reachable |

What ships is #1 built **on top of** #2: the renderer draws from an actual
ordered stitch plan, not from an image filter. That is what makes #3 a data
export rather than a rewrite. It is also why the UI says, in plain words, that
the preview is not machine-ready digitising.

---

## 2. Libraries evaluated

| Project | Purpose | Licence | Maintenance | Size / runtime | Verdict |
|---|---|---|---|---|---|
| [Ink/Stitch](https://github.com/inkstitch/inkstitch) | Full digitising platform (fill, satin, underlay, format export) | **GPL-3.0-or-later** | Very active | Python + Inkscape, desktop | **Rejected for embedding.** Copyleft is incompatible with a proprietary product. Remains usable later as a *separately distributed* out-of-process tool; that is a distribution decision, not a code decision, and must be made deliberately. |
| [pyembroidery](https://github.com/EmbroidePy/pyembroidery) | Read/write DST, PES, EXP, JEF, VP3 (+40 read formats) | **MIT** | Stable | Python, server-side | **Accepted for the future export path.** It represents and serialises stitches; it does not decide where they go. Exactly the right split from our planner. |
| [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) | Raster -> vector, colour-quantised | **Unlicense** (public domain) | Low activity, stable | ~35 kB, browser | **Not needed.** It produces outlines; we need a *direction field*, which is a different computation. Tracing then re-deriving directions from the traced paths is strictly more work and less accurate than working on the raster. |
| Potrace / potrace ports | Bitmap tracing | **GPL-2.0** | Stable | — | **Rejected.** Same copyleft problem. |
| OpenCV.js | Contours, distance transform, morphology | Apache-2.0 | Active | **~8 MB wasm** | **Rejected on budget.** The repo's app-page budget is 300 kB JS. We use two algorithms from it; both are ~60 lines each. |
| three.js `MeshPhysicalMaterial` | Cloth response | MIT | Active | already a dependency | **Adopted.** `sheen` uses the Estevez–Kulla "Charlie" NDF with Neubelt visibility — a real cloth lobe, not a hack. `anisotropy` was evaluated for thread highlights and rejected: it is a per-material axis, and our thread direction varies per pixel. The per-pixel normal map already delivers directional highlights. |

**No new runtime dependency was added.** The pipeline is TypeScript in
`src/lib/embroidery/`.

---

## 3. Three implementation approaches compared

### A — Canvas/SVG stitch simulation only
Draw thousands of clipped stitch segments and stop there.

- Fast to build, deterministic, trivially previewable in 2D.
- Thread does not respond to light: rotate the product and the "shading" stays
  painted in place. On a garment, which is *seen* by turning it, that reads as
  a sticker.

### B — Generated material maps *(chosen)*
Rasterise the stitch plan into a height field, then derive colour, normal,
roughness and a coverage mask from it, and feed those to the garment material.

- The relief is real surface data: ridges, crossings and the shadow between
  rows all move correctly with the light and the camera.
- Cost is bounded and independent of stitch count at render time — the GPU sees
  three textures whether the design has 2 000 or 160 000 stitches.
- Needs a raster sized in physical units, which is a discipline worth having
  anyway (see §5).

### C — Real stitch geometry (tubes / ribbons / instanced segments)
- Best possible extreme close-up.
- 22 000 stitches on one modest logo. As tubes that is millions of triangles
  for a preview that is usually seen at 300 px across, and it scales with
  artwork complexity rather than with screen size.

**Chosen: B, built on the stitch plan that A would have produced.** The plan is
kept (`ThreadRun[]`), so the 2D editor draws the very same segments — the flat
preview and the 3D texture are the same pixels, not two lookalike code paths.
C stays available for a future "zoom to inspect" mode without changing the
pipeline, because the segments already exist.

---

## 4. Pipeline

```
source asset (PNG / JPG / WebP)
  |
  v preprocess.ts        resample into the EFFECT RASTER (px/mm, not px)
  |                      flood-key a flat background inward from the border
  |                      threshold alpha — thread covers a spot or it does not
  v quantize.ts          median-cut to a thread budget, luminance-weighted
  |                      splits, largest-population box split first
  v edt.ts               exact Euclidean distance transform
  |                      (Felzenszwalb-Huttenlocher, O(n) separable)
  |                      + O(n) running-max (van Herk / Gil-Werman)
  v stitch-field.ts      distance gradient  = satin direction (across a stroke)
  |                      2 x local max      = local stroke width
  |                      blend satin -> house fill angle by width
  v stitch-plan.ts       rows at the fill angle, spaced by density, brick-offset;
  |                      each stitch ORIENTED by the local field and shortened
  |                      until both endpoints are inside the alpha
  v render-maps.ts       height field -> colour, normal, roughness, mask
  |
  v compose-surface-maps.ts   draw each patch under the element's Konva transform
                              into persistent surface-wide normal/roughness canvases
```

### Why distance-to-edge is the whole trick
A digitiser makes one decision per area: narrow shapes get **satin** (threads
laid across the stroke, which is what gives lettering its glossy ridge), broad
shapes get **fill** (parallel rows at a house angle). The distance transform
answers both from one computation: its gradient points straight across the
stroke, and twice its local maximum *is* the stroke width. No user input, no
per-product tuning.

A chamfer approximation was rejected: the direction field is its gradient, and
chamfer metrics produce visible eight-fold banding in thread angles.

---

## 5. Physical scale is the contract

Every parameter is in millimetres — density, thread width, stitch length, satin
threshold, relief. The effect raster is sized from the artwork's **physical**
size on the product (`elementPhysicalSizeMm`), so a 5 cm logo yields the same
stitch count and the same thread scale whether the surface texture is 1024 px
or 4096 px wide. Tested both ways:

- `stitch scale follows physical size, not raster resolution` — a 30 mm disc at
  4 px/mm and at 12 px/mm produces stitch counts within 10 % and mean stitch
  lengths within 0.25 mm.
- `a logo's physical size is independent of the surface's pixel resolution`.

---

## 6. Performance

The expensive work is deliberately kept off the interaction path:

| Interaction | Cost |
|---|---|
| Drag a placed logo | **zero recompute** — the cache key omits position |
| Rotate a placed logo | **zero recompute** — the key omits rotation |
| Resize | preview tier immediately (3.2 px/mm), full tier (8 px/mm) 280 ms after the pointer settles |
| Nudge a resize handle | physical size is quantised to 0.25 mm, so small moves reuse the cache |
| Change a setting | same preview-then-full ladder |

Measured on this machine: a full-quality 10 cm two-colour logo plans 5 676
stitches across 6 threads in **465 ms** (`pipeline-contracts.test.ts` prints it
on every run). The planner also has a hard stitch ceiling and *thins the whole
design uniformly* rather than silently truncating one colour — and says so in
the UI when it does.

A Web Worker was considered and not used yet. The full pass already runs behind
a debounce and off the drag path, and moving it would mean transferring canvases
across the boundary (`OffscreenCanvas` for the map rendering, which is the half
that cannot move without it). It is the obvious next step if the ceiling rises.

---

## 7. Privacy

Everything runs in the tab. The asset is read from an object URL, rasterised
into a canvas, and never uploaded. The Uploads panel's promise — "Artwork stays
on this device" — remains true. Any future server-side digitisation must be an
explicit, visible architectural decision, not a silent one.

---

## 8. What this is NOT

- Not image-to-3D generation. No model is inferred from the artwork; the
  garment is an onboarded GLB and the artwork stays a 2D asset.
- Not machine-ready digitising. There is no underlay, no pull compensation, no
  trim/jump planning, no stitch-order optimisation and no fabric model. The UI
  states this where the customer can see it.
- Not a lossless reproduction of photographs. Detail finer than one stitch row
  is measured and reported ("about N% of this design is finer than one stitch
  row at this size"), rather than quietly stitched into mud.

## 9. Path to production export

The stitch plan already carries what a writer needs — ordered segments grouped
by thread colour, in a raster whose scale in millimetres is known. Export would
add, in order: stitch-order optimisation within a colour, jump/trim insertion,
underlay generation, pull compensation, then serialisation (pyembroidery, MIT,
server-side). None of that changes the modules above; it consumes their output.
It must not ship without a preflight step, and it must never be presented as
equivalent to the visual preview.
