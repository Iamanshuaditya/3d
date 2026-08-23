# Structural Reference Inventory

## Purpose

This inventory separates exact source evidence from raster observations. A
screenshot is never accepted as manufacturing geometry. Measurements labelled
"exact" below come from vector/object-level PDF inspection in physical PDF
units, not from tracing pixels.

The supplied assets remain local evidence. Their presence in an authorized
user workspace permits analysis, but it does not establish redistribution
rights for a public repository.

## Evidence classes

- **Exact**: recoverable from vector objects, page boxes, named separations, or
  cryptographic file metadata.
- **Observed**: visible in a raster screenshot but not suitable for production
  coordinates.
- **Inferred**: plausible interpretation that requires confirmation and may not
  become canonical data without validation.
- **Unknown**: not supported by the supplied evidence.

## REF-PDF-001 - Golden lock-bottom carton

### Identity

| Field | Value |
|---|---|
| Type | One-page vector PDF |
| Expected local filename | `product_Lock Bottom and top incl. window_mm_300_150_200.pdf` |
| SHA-256 | `b6b8cda57f693275174abfb6e2e3d74411122eb1057feac086ecd26df27df557` |
| Byte size | 6,385 |
| Format | PDF 1.7 |
| Producer | PDFlib Personalization Server 10.0.1 (PHP/Linux-x64) |
| Creation timestamp | `2026-08-23T21:16:02+02:00` |
| Pages | 1 |
| Encryption | None |

The source is definitively vector:

- raster images: 0;
- fonts: 0;
- text characters: 0;
- annotations and links: 0;
- optional-content groups/layers: 0;
- Form XObjects: 1;
- structural stroke paints: 103;
- cubic/quadratic/arc path operators: 0.

### Physical page evidence

| Box or structure | Width | Height | Evidence |
|---|---:|---:|---|
| MediaBox | 742.3997 mm | 500.0025 mm | Exact PDF points, `/UserUnit` defaults to 1 |
| Explicit TrimBox | 712.3995 mm | 470.0024 mm | Exact PDF points |
| Outer cut bounds | 712.3996 mm | 470.0005 mm | Reconnected `/DieCutBlue` vector cycle |
| Main body strip | - | 300.0005 mm | Red/blue structural coordinates |

The main crease positions corroborate broad and narrow face spans of
approximately 200 mm and 150 mm. This is consistent with the product name's
300 x 150 x 200 mm dimensions, but the semantic ordering of those dimensions
is not encoded inside the PDF.

### PDF object structure

The page invokes one identity-matrix Form XObject. Inside that form, the
authoring transform chain is:

```text
cm 1 0 0 -1 0 1417.33
cm 1 0 0 1 79.3702 283.465
```

The first matrix flips the PDF Y axis. The second translates the structural
coordinate system by approximately `(28, 100) mm` in page coordinates.

Raw Form operations include:

| Operation | Count |
|---|---:|
| Move-to (`m`) | 105 |
| Line-to (`l`) | 253 |
| Close path (`h`) | 3 |
| Stroke (`S`) | 103 |
| Rectangle (`re`) | 2 |
| Clip (`W n`) | 2 |
| Fill (`f`) | 1 white background |
| Cubic/short-curve operators | 0 |

All structural strokes are solid. Blue and red strokes are 1.2 pt
(0.423333 mm), with butt caps and miter joins.

### Named separations and operation classification

| PDF separation | Alternate CMYK | Paints | Width | Normalized interpretation | Confidence |
|---|---:|---:|---:|---|---|
| `/DieCutBlue` | `[1, 1, 0, 0]` | 78 | 1.2 pt | `cut`, including window cut | High |
| `/DieCutRed` | `[0, 1, 1, 0]` | 24 | 1.2 pt | `crease` | High |
| `/DieCutGreen` | `[0, 0, 1, 0.5]` | 1 | 14.1733 pt | Exterior presentation/likely bleed band | Medium-high |

The green paint is not a separate offset vector. It is a 5.0000 mm stroke on
the outer cut centreline, clipped to the exterior of the blank. The visible
band is therefore approximately 2.5000 mm. Importing it as a second cut path
or a 5 mm offset contour would be wrong. Its semantic mapping must remain
configurable because the PDF names the spot `DieCutGreen`, not `Bleed`.

### Exact cut topology

The 78 individually stroked blue segments reconnect by exact endpoint
adjacency into two closed cycles:

| Cycle | Segments | Bounds | Perimeter | Area |
|---|---:|---|---:|---:|
| Outer blank | 70 | 712.3996 x 470.0005 mm | 3066.4764 mm | 308652.6743 mm2 |
| Window | 8 | 180.0013 x 260.0004 mm | 856.5706 mm | 46600.3943 mm2 |

The internal window is an eight-edge chamfered polygon, not a rounded
rectangle. Its page-coordinate bounds are approximately `x=388..568 mm` and
`y=120..380 mm`, with four approximately 10 mm chamfers. It lies within the
third broad body face with approximately 10 mm side margins and 20 mm
top/bottom margins.

Neither cycle is emitted as one closed PDF path. A PDF importer that accepts
only already-closed paint paths will miss the topology. It must normalize and
reconnect source segments while preserving provenance.

### Exact crease evidence

The 24 red segments resolve into 16 connected crease chains:

- 4 vertical body creases;
- 8 horizontal body-to-flap crease spans;
- 4 diagonal flap creases, each emitted as 3 collinear source segments.

Several source details and intentional separations are approximately 0.3 mm.
The shortest recovered cut segment is approximately 0.29985 mm. A 0.01 mm
normalization tolerance may remove numerical noise, but a larger cleanup must
not silently erase these features or close deliberate gaps.

### What the PDF proves exactly

- Physical page and trim boxes.
- Cut and crease coordinates.
- Outer and internal cut cycles.
- The window location, shape, perimeter, and area.
- Stroke widths, caps, joins, solid dash state, and named spot separations.
- Source transform and clipping chain.
- Provenance, byte size, and source hash.

### What the PDF does not encode

- Mountain/valley direction.
- Target fold angles.
- Fold hierarchy, sequence, timing, or easing.
- Panel names and the chosen root panel.
- Glue seam, tuck destination, or lock destination.
- Board stock and thickness.
- Printed outside and chirality convention.
- Artwork or UV mapping.

Those facts require authored manufacturing metadata and independent
validation. They must not be guessed from the screenshot.

## Raster screenshot references

### REF-IMG-001 - Complex carton at 260.4 x 183 mm

| Field | Value |
|---|---|
| Pixel size | 1600 x 1242 |
| SHA-256 | `aa8af09a88dc924112780e88d6988eb6a24a98322ade70c8a98528ba3d05d6b7` |
| Class | Complex folding carton |

Observed with high confidence:

- dimension labels `260.4 mm` and `183 mm`;
- an irregular outer contour with angled flaps;
- a rounded upper tab and rounded lower lock/notch details;
- dark cut-like, red crease-like, and lime exterior guide styles;
- four body-like regions and a partially visible 3D preview.

Measurable from the asset: pixel dimensions and displayed dimension text.
Not measurable: vector coordinates, radii, exact operation semantics, fold
sequence, or assembled dimensions. This screenshot is useful as a future
curve-quality benchmark, not as geometry to trace.

### REF-IMG-002 - Long multi-panel structure

| Field | Value |
|---|---|
| Pixel size | 1600 x 822 |
| SHA-256 | `1711f2f6380cca137959977359c4f07e258b2c63e37680b97d7e7f5051044d36` |
| Class | Long multi-panel/handled structure |

Observed:

- a long repeated panel web;
- narrow repeated sections and tapered edges;
- two obround slot-like outlines in the central band;
- long straight structural guides;
- an open cream-coloured assembled preview and Forward/Backward controls.

No physical dimensions are legible enough to record. The slot operation and
exact topology remain unconfirmed from the screenshot alone.

### REF-IMG-003 - Stand-up pouch mapping reference

| Field | Value |
|---|---|
| Pixel size | 1600 x 1343 |
| SHA-256 | `9f695c9297dfedcb68bc7624868e3ab19e9cd91a993f504e9aa41515596cbc2a` |
| Class | Flexible/formed pouch |

Observed:

- upper and lower artwork regions have different flat-web orientations;
- the lower copy is rotated relative to the upper copy;
- structural guides include seal/gusset-like curves;
- the assembled preview shows upright front-facing copy.

This is strong qualitative evidence that pouch section transforms must be
explicit. It does not provide quantitative UVs, physical dimensions, or a
rigid-fold topology.

### REF-IMG-004 - Golden blank in editor

| Field | Value |
|---|---|
| Pixel size | 1600 x 896 |
| SHA-256 | `141c386ca30879b77fd87c507e57a2a5653fe49f4a9c51ebb00830a476823ebb` |
| Class | Windowed lock-bottom folding carton |

Observed:

- displayed dimensions `712.4 mm` and `470 mm`;
- four body faces, a tapered glue-side area, irregular top/bottom flaps,
  diagonal creases, and the chamfered window;
- thin blue cut-like lines, red crease-like lines, and a lime exterior band;
- a partially assembled/open 3D preview.

The unique contour, window, and dimensions match REF-PDF-001 with very high
confidence. The small preview suggests an aperture but cannot prove the
window is a real hole in the mesh.

### REF-IMG-005 - Golden carton with artwork, flat/edge-on preview

| Field | Value |
|---|---|
| Pixel size | 1600 x 1067 |
| SHA-256 | `de22ccc714bb7e24d51dd3323a9b6d4643aedf93669044029d6be8ea1f462742` |
| Class | Golden artwork/mapping reference |

Observed:

- full-blank decorative "Diamond Skin" artwork;
- different artwork orientation on different faces and flaps;
- structural guides remain over the artwork;
- Forward/Backward controls and a small green, nearly edge-on/flat preview.

The artwork is decorative and partly symmetric; it is not sufficient to prove
chirality or cross-crease continuity.

### REF-IMG-006 - Golden carton assembled artwork state

| Field | Value |
|---|---|
| Pixel size | 1600 x 798 |
| SHA-256 | `b507b726bef0f3c4f7844f4928e7332697c22b148ca894fbd8cdcdb85589e4e7` |
| Class | Golden assembled visual reference |

Observed:

- the same decorative artwork on the editor blank;
- a small assembled rectangular-carton preview;
- a visible front label and patterned surrounding faces.

This screenshot cannot prove same-mesh continuity, terminal fold angles,
window topology, all-face chirality, or animation timing. A fixed-camera video
and asymmetric diagnostic artwork remain required.

## Missing reference evidence

- No video binary was included in this audited asset set.
- No CloudLab-exported SVG or DXF was supplied.
- No board-stock/thickness specification was supplied.
- No construction engineer has validated fold direction, target angles,
  sequence, seam, or locking destinations.
- No redistribution licence accompanies the source files.
- The golden PDF contains no curves, so it cannot be the only importer fixture.

## Evidence handling rule

Do not copy the source PDF or screenshots into Git until redistribution rights
are confirmed. Use the fixture manifest, stable hashes, and an ignored local
source file. If public CI needs equivalent geometry, create an independently
authored structural fixture rather than tracing or copying this reference.
