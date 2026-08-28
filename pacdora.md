# Pacdora adjustable 3D packaging research

Research date: 2026-08-28
Implementation proof: [`/test`](http://localhost:3000/test)
Experimental library: [`src/lib/pacdora-lab`](src/lib/pacdora-lab)

## Executive conclusion

Pacdora does not appear to resize adjustable packaging by stretching one fixed
GLB. The observed editor uses a **parameterized structural template**. Length,
width, height, material, caliper, dimensional mode, and product-specific
parameters are resolved into new dieline/"knife" data. Pacdora then replaces
the editor model with geometry generated from that result.

Rigid cartons and flexible pouches share the same product-level workflow but
need different geometric solvers:

```text
construction template + dimensions + material
                       ↓
            manufacturing parameter solver
                       ↓
        canonical dieline / continuous film web
                       ↓
       generated panel mesh or flexible surface mesh
                       ↓
               artwork + 3D interaction
```

- A carton is a graph of flat panels connected by crease hinges. Its primary
  interaction is open/close or fold/unfold.
- A pouch is a continuous flexible web joined at heat seals. Its primary
  interaction is inflation/expansion, not rigid-panel folding.
- GLB remains useful for fixed products or as an export result, but it is not a
  sufficient manufacturing authority for arbitrary packaging dimensions.

This document describes behavior observed through public browser resources and
public Pacdora responses. It does not claim access to Pacdora's private source
code or reproduce its proprietary construction formulas.

## Research surfaces

The investigation used:

- Pacdora's live dieline and mockup editors in Chrome.
- Chrome runtime/network inspection of public page resources and responses.
- Visual verification through the Mac accessibility and screenshot surface.
- Pacdora's public product documentation.
- Three.js and Khronos glTF primary documentation.

The separate in-app Browser was requested but was unavailable in this session;
Chrome remained available and provided the required authenticated page state.

### Examples inspected

1. Rigid carton:
   - Cake box with handle, model `11231102`.
   - Dieline editor exposed length, width, height, custom thickness, material,
     and three size modes.
   - Mockup editor exposed open/close interaction.
2. Rollover hinged-lid mailer:
   - Project `68502039`, model `150010`.
   - Its public demo scene provided a useful structural serialization sample.
3. Flexible pouch:
   - Center/back-seal pillow pouch, model `430031`.
   - Mockup editor exposed material, width/height, and an `Inflate` interaction.

## Evidence from Pacdora's own product description

Pacdora says its dieline generator starts from a selected box template, accepts
dimensions, paper thickness, and material, then generates downloadable AI, PDF,
or DXF dielines. It also says its structural packaging preview folds the real
cut-and-crease geometry into a 3D model.

Primary sources:

- [Pacdora free dieline generator](https://www.pacdora.com/tools/dieline-generator)
- [Pacdora structural packaging design](https://www.pacdora.com/tools/ai-structural-packaging-design)
- [Pacdora center-seal pouch mockups](https://www.pacdora.com/tools/center-seal-pouch-mockup)
- [Pacdora Doypack / stand-up pouch mockups](https://www.pacdora.com/tools/doypack-mockup)
- [Pacdora custom stand-up pouches](https://www.pacdora.com/tools/custom-stand-up-pouches)
- [Pacdora mailer-box mockups](https://www.pacdora.com/mockups/mailer-box-mockup)
- [Three.js ExtrudeGeometry](https://threejs.org/docs/pages/ExtrudeGeometry.html)
- [Three.js ObjectLoader](https://threejs.org/docs/pages/ObjectLoader.html)
- [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html)
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)

## Rigid box findings

### Live controls

The inspected dieline editor exposed:

- Length
- Width
- Height
- Material
- Custom thickness
- Manufacture dimensions
- Inner dimensions
- Outer dimensions
- Bleed, trim, and crease guides
- Open/close 3D preview

For the inspected E-flute cake-box construction, the page displayed:

| Mode | Length | Width | Height |
| --- | ---: | ---: | ---: |
| Manufacture | 169 mm | 169 mm | 117.5 mm |
| Inner | 167 mm | 167 mm | 115.5 mm |
| Outer | 170 mm | 170 mm | 120 mm |

This is direct evidence that "size" is not a single mesh scale. One nominal
input is converted into construction-specific inner, score/knife, and outer
measurements.

### Project and update behavior

The public editor bundle keeps thickness and the two material offsets commonly
named `inless` and `outless` in project state. On a material or thickness
change, it requests updated project/knife data and calls a model-replacement
path. It does not merely set `mesh.scale`.

The relevant observed behavior was equivalent to:

```text
selected stock → caliper + inside/outside offsets
              → update construction project and knife
              → replace editor model
              → reset/open the fold rig
              → reapply artwork and material appearance
```

The editor internally distinguishes size modes corresponding to inner,
manufacturing/knife, and outer dimensions. That distinction must exist before
the dieline formulas run.

### Public scene structure

The public demo scene for model `150010` is a serialized Three.js object scene,
not one opaque animated box mesh. Inspection found:

- 37 `ExtrudeGeometry` entries.
- 37 shape definitions.
- 19 panel-like geometries extruded to the board depth.
- 18 hinge/connector geometries extruded along line paths.
- Named meshes alternating between panels and their connections.
- No morph targets.
- No `SkinnedMesh` or skeleton.
- No baked animation clips.

This is consistent with a panel graph:

```text
base panel
├── front wall
├── back wall
│   └── lid
│       └── lid tuck
├── left wall
└── right wall
```

Each panel is generated from a two-dimensional shape and given physical depth.
Named hinge groups supply the fold pivots. The flat scene and folded scene can
therefore share one structural authority.

### What thickness must do for a box

Thickness has at least two responsibilities:

1. **Preview caliper** — the visible distance between outside and inside faces.
2. **Manufacturing compensation** — score positions, clearances, flap lengths,
   closure stacks, and conversions between inner/knife/outer dimensions.

A universal `outer = inner + 2 × thickness` formula is unsafe. The correct
allowance depends on construction, stock, flute direction, score behavior,
fold count, and converter tolerances. Pacdora's large template library can store
these rules per construction.

## Flexible pouch findings

### Live controls and project state

The inspected center-seal pouch exposed:

- Custom material (`Plastic matt` in the observed project).
- Adjustable width and height.
- Material thickness data.
- A `softBagExpansion` project value.
- An `Inflate` interaction rather than open/close.

For this adjustable project, the observed `sceneSrc.glb` field was empty. The
dimensions, thickness, material identifiers, inside/outside offsets, and soft
bag expansion were stored separately. This strongly supports a generated soft
surface rather than a fixed GLB scaled on two axes.

### Pouch manufacturing authority

A center/back-seal pillow pouch starts as one continuous film web:

```text
┌──────────────── front ────────────────┬──────────────── back ─────────────────┬─ fin seal ─┐
│                                      │                                        │            │
│            artwork panel             │             artwork panel              │ heat seal  │
│                                      │                                        │            │
└──────────────────────────────────────┴────────────────────────────────────────┴────────────┘
            top and bottom areas are cross-web heat seals
```

The production web and the inflated body are related but are not the same
shape. Inflation should change a generated vertex field while the printable
web remains stable. A practical surface solver uses:

- Face width and package height.
- Target filled depth.
- Side pinch profile.
- Top and bottom seal falloff.
- Center/back fin seal geometry.
- Material-specific relief and reflectance.
- Optional gussets, zipper, notches, and tear features.

For a stand-up pouch, the bottom gusset is a separate membrane region with its
own fold profile. For a flat-bottom or side-gusset pouch, a different topology
is required. These should be separate construction templates rather than one
mesh with extreme deformation sliders.

### Pouch mesh generation

A useful procedural pouch surface can be described with normalized face
coordinates `s ∈ [-1, 1]` and `t ∈ [0, 1]`:

```text
sideMask       = (1 - s²)^p
sealMask       = smoothstep(seal, body, min(t, 1 - t))
surfaceDepth   = filmHalf + 0.5 × targetDepth × inflation
                 × sideMask × sealMask
```

Front and back use opposite depth signs. Boundary rows are joined to form the
side and end seals. The complete BufferGeometry is regenerated when size or
inflation changes. Subtle deterministic displacement may be added for film
wrinkles, but the primary silhouette must come from the construction profile.

### Visual benchmark and topology corrections

A second comparison pass used Pacdora's public center-seal, Doypack, custom
stand-up-pouch, and mailer-box examples as silhouette references. It exposed a
critical mistake in the first experiment: a center-seal pouch and a stand-up
pouch cannot be convincing variants of one rounded slab.

The final multi-angle pass also inspected two live Pacdora models in Chrome:

- Model `430041`, a custom three-side-seal stand-up zipper pouch. Its side view
  is deliberately thin, with the face inflation falling away before the upper
  seal and its paired zipper tracks following the film surface.
- Model `604001`, a Doypack shown at `102 × 180 × 257 mm`. Its specified depth
  is expressed primarily through the lower body and opening gusset; the upper
  artwork face stays comparatively flat. From the front, its lower edge is a
  lifted-corner U rather than the straight bottom of a rounded slab.

### Flat-to-inflated correction pass for model 430041

A final controlled comparison used the same camera while moving model `430041`
between its minimum, midpoint, and maximum public `Inflate` positions. The
model reports only `3.2677 × 4.7638 in` (approximately `83 × 121 mm`) in the
size panel; expansion is a separate soft-shape parameter. The toolbar visually
clamps its pointer inside the track rather than presenting expansion as a third
manufacturing dimension.

The important deformation is easier to see from the side than the front:

- At minimum expansion, the front and back laminates are almost coincident. The
  result is a thin vertical card with a rectangular front silhouette.
- Inflation separates two broad face membranes. It does not scale a rounded
  solid or push every face vertex outward equally.
- The upper heat seal remains pinched, but the lower perimeter does not collapse
  to the same point. The lower front and back walls remain separated and are
  joined by the opening bottom gusset.
- The zipper and headspace stay in the narrow upper transition. Maximum depth
  occurs through the middle and lower body, then reduces through the shoulder
  leading into the top seal.
- Most of the printable face stays comparatively planar. Curvature is absorbed
  by the side shoulders, sealed fins, and folded lower transition.
- Across the supplied and live side captures, the apparent maximum opening was
  approximately one fifth of overall height. This is a visual benchmark, not a
  converter-approved capacity formula.

A same-camera three-position pass exposed one more detail that is easy to miss
from the front. Pacdora behaves more like a **partly filled product chamber**
than a uniformly pressurized balloon:

- At minimum, the laminate pair is an almost coincident vertical rectangle.
- Around the midpoint, visible separation is concentrated below the pouch
  midpoint; the upper artwork area and zipper remain close together.
- At maximum, the greatest separation remains in the lower third. At roughly
  60% of body height the opening is already about half that maximum, and by
  roughly 70–78% it is only a small fraction. The top seal then closes to film
  caliper instead of forming a pointed, inflated shoulder.

The `/test` surface therefore uses a vertical fill profile in addition to the
cross-face shoulder profile. The requested depth is also bounded by the face,
height, and gusset proportions before inflation. This prevents an input such as
a very narrow pouch with a very large nominal depth from turning into an
impossible self-intersecting balloon. At the current regression benchmark, the
depth at 72% of body height is below 28% of the lower product chamber.

This agrees with Pacdora's own description that filling swells the gusset,
changes the zipper/headspace region, and bends the lower artwork area; those
effects are construction features rather than generic mesh scaling. See
[Pacdora's dry-goods packaging design page](https://www.pacdora.com/tools/ai-dry-goods-packaging-design).

The `/test` stand-up solver missed that behavior in seven concrete ways across
its first two iterations:

1. Its first lower width contracted to `86%`, producing a bottle-like body and a
   large rounded base.
2. Its depth mask curved the whole artwork panel, which read as a ballooned
   slab instead of two laminate faces.
3. Its gusset arch stayed large even near the flat state.
4. The decorative top-seal boxes were about `1.2 mm` deep around a `0.12 mm`
   film—ten times the selected laminate caliper.
5. The flat web contained side-seal allowances, but the 3D mesh had no separate
   double-layer seal fins representing them.
6. The first correction then over-read the side silhouette as a closed lens and
   forced bottom depth to zero. That collapsed the lower face edges into a
   diamond point.
7. Its still-arched gusset could not occupy that collapsed boundary, so it
   projected below the body as an unrelated oval foot.

The corrected research mesh now uses an open lower body, an upper seal taper, a
single centre-driven artwork crown across width, one fused side-seal rail per
edge, and an inflation-dependent folded gusset membrane. Its
default filled-depth ratio is `42 / 210 = 0.20`, while the control remains fully
adjustable. At low inflation it is a vertical rectangle. At full inflation the
lower front and back remain separated, and the gusset unfolds between their
level bottom edges into the standing base without extending beneath them.

A final edge-profile audit found that width and depth must be treated as two
different constraints. The face width and the outer side-seal cut edge belong
to the canonical flat web, so both stay vertically aligned instead of tapering
inward near the base. A later close-up found that the first fused-rail pass
still reduced the rail extension to `18%` through its bottom `9.5%`; that was
the remaining triangular notch. The rail extension and lower Y boundary are
now mathematically constant from top to bottom. Inflation acts behind that
rail. In side view, the gusset entry and entire lower half now retain `100%` of
the chamber depth. Only the upper half transitions through the product shoulder
into the narrow zipper/headspace seal. This produces the requested straight
side silhouette from the centre through the standing base, without an inward
lower funnel.

The final underside comparison exposed two separate cross-width errors. First,
reusing a nearly constant depth plateau generated a rounded rectangle. Second,
using an actual ellipse removed that plateau but made the two ends smoothly
round. Pacdora model `430041` instead shows a lens: two curved gusset facets
meet at a visible angle at each side heat seal and retain one shallow centre
fold. The greatest opening still lies on the centreline and falls monotonically
to film caliper at the two tips. The standing perimeter is now driven by:

```text
s = 2u - 1
bottomLensMask(s) = sin(π(s + 1) / 2)
faceCrownMask(s) = bottomLensMask(s)^0.42
```

Only the bottom transition uses the sharper lens exponent. Over the lower
`22%` of the body it blends into the broader single-crown face profile. The
finite, opposing slopes at each mirrored lens tip create the visible corner;
the centre remains the only depth maximum, preventing the two shoulder lobes
that previously read as independent left/right inflation.

The pouch viewport now starts with an orthographic product camera. This is a
rendering choice, not a deformation shortcut: it removes perspective
keystoning that made equal-height bottom vertices appear diagonally cut. Orbit
and zoom remain available, while a front or side inspection preserves parallel
seal edges like Pacdora's editor views.

The corrected center-seal construction now has:

- Wide, nearly flat cross-web heat-seal bands at the top and bottom.
- A pinched shoulder immediately inside each heat seal.
- A broader, inflated middle that produces a pillow/hourglass outline.
- A separate back fin seal instead of a decorative line on the front face.
- Deterministic side wrinkles that diminish to zero across the seal bands.

The corrected stand-up construction now has:

- Independent front and back face membranes.
- An open lower-body gusset entry, one smooth artwork crown, and a flat upper
  headspace that closes into the heat-seal band.
- One double-sided fused rail per side seal. The earlier front and back fin
  wedges produced a duplicate inflation line and have been removed.
- Optional paired zipper tracks sampled from the same curved face, so they do
  not float or poke through when the pouch is viewed from the side.
- An optional round hang hole cut through both face membranes with a narrow
  aperture rim. The former full overlapping top-seal rectangle was removed;
  it covered the artwork at the same depth and caused the reported shimmer.
- A separately tessellated bottom-gusset membrane. Its front and back edges
  meet the separated face membranes; its two facets retain a shallow upward
  centre fold even at full inflation. The fold changes depth only: all four
  lower face/rail corners share one level Y coordinate, so no front-view notch
  or funnel can be produced.

The two stable flat webs are consequently different:

```text
centre-seal web width  = 2 × face width + back-fin seal
centre-seal web height = body height + 2 × end seal

stand-up web width     = face width + 2 × side seal
stand-up web height    = back face + bottom gusset + front face + 2 × end seal
```

### One canonical artwork canvas for 2D and 3D

The artwork test now follows the same single-authority rule as the structure.
`/test` instantiates the actual production Studio tool rail, panels, layers,
crop controls, snapping, transformer, rulers, and pan/fit/zoom workspace—not a
parallel simplified editor. A raster or SVG becomes an object on one canvas
whose aspect ratio is the resolved continuous film web. Front, Bottom gusset,
and Back remain named selection/snap/upload targets, but they are guide regions
rather than clipping containers. An object can therefore be dragged across a
fold and span Front → Bottom gusset → Back. Only the outside boundary of the
physical repeat clips artwork. The same persistent canvas supplies the live 3D
CanvasTexture, including updates while an object is moved or transformed.

The procedural mesh does not stretch the image independently. Every generated
face vertex converts its manufacturing-web position to UV coordinates:

```text
u = web-x / web-width
v = 1 - web-y / web-height
```

Front, back, side-fin, and bottom-gusset vertices all address the same canonical
web. A single Three.js `CanvasTexture` is then attached to the pouch laminate.
Changing inflation regenerates only geometry; it does not re-decode or repaint
the unchanged artwork. Changing dimensions repaints the canonical web and
regenerates UVs together, so the 2D and 3D views cannot drift onto different
coordinate systems.

### Dimension-input failure correction

The reported `Resolved width must be a finite positive number` error was caused
before WebGL rendering. A controlled number field temporarily becomes an empty
string while the user replaces its value. Converting that transient string
with `Number("")` produced zero and reached the box dimension solver; outer or
manufacture mode then subtracted material allowances from the invalid value.

The lab now keeps an editable local draft for each numeric field. Only finite
values within that field's construction range reach the solver. Width, height,
target depth, bottom gusset, heat seal, and back fin seal expose their minimum
and maximum beneath the field in both millimetres and inches. The mm/in toggle
changes entry units without changing the millimetre source of truth. Depth,
gusset, and seal maxima are recalculated after width or height changes, and the
whole input is constrained together before React state is committed. Blur
clamps an unfinished draft and Escape restores the last resolved value.

The mailer comparison also showed that base + four walls + lid was too simple.
The experimental mailer now includes two lid wings, four corner dust flaps, a
rolled/double front wall, a centre locking tongue, and matching lock slots.
Those parts are present in both the canonical blank and the folded 3D assembly.
They remain research geometry—not a copied or certified Pacdora die.

### Mailer cut profiles and hinge correction

A later open-box comparison exposed two separate faults in the first mailer
prototype:

1. Flaps were plain boxes, so the 0% state looked like a grid of rectangles
   instead of a packaging die with tapered dust flaps, relieved shoulders,
   locking ears, and tongue profiles.
2. Several flaps interpolated in world space. At intermediate fold values they
   could detach visually from their score line and appear beneath the base.

The corrected lab stores an optional local polygon outline on every shaped
panel. The SVG dieline renders that exact polygon, while Three.js extrudes the
same points to the resolved board caliper. `/test` exposes three deliberately
different research constructions:

- **Roll-end** — tapered wings and chamfered roll-over closure.
- **Ear-lock** — rounded locking ears, relieved dust flaps, and dovetail tongue.
- **Display** — angular wings with a notched display-front closure.

The 3D assembly is now a nested crease graph rather than a list of independently
positioned meshes:

```text
base
├── back wall
│   └── lid
│       ├── left wing
│       ├── right wing
│       └── lid tuck
├── left wall
│   ├── back dust flap
│   └── front dust flap
├── right wall
│   ├── back dust flap
│   └── front dust flap
└── front wall
    └── front roll
        └── locking tongue
```

At 0%, all relative hinge angles are zero and the model is the same continuous
net as the dieline. During folding, a child inherits its parent's transform, so
its crease cannot drift. At 100%, internal dust flaps, wings, tuck, and front
roll receive a small caliper-derived stacking offset; this removes coplanar
flicker and leaves a clean exterior. Tuck and lock depths are also capped below
wall height, including at the UI's minimum box dimensions, so closure parts
cannot project below the base.

## Why GLB alone is not the answer

GLB is a compact runtime asset container. It may include node hierarchies,
animations, skins, and morph targets. It does not define packaging-engineering
relationships such as:

- Changing an inner dimension while preserving a manufacturing clearance.
- Moving score lines based on material caliper.
- Resizing tabs without changing their seam allowance.
- Rebuilding a print-ready dieline.
- Turning one flat film web into multiple pouch constructions.

Morph targets are finite, authored vertex deltas. Bones pose an authored
topology. Neither mechanism supplies arbitrary construction formulas. A GLB can
still be generated *after* the packaging solver runs, or used for fixed bottles,
jars, closures, props, and decorative components.

## What existed in Vortex before this experiment

Vortex already had the correct architectural direction:

- `src/lib/configurator/mailer-box-spec.ts` generates a parameterized carton.
- `src/components/configurator/CartonModel.tsx` builds a structural tree.
- `src/lib/configurator/pouch-geometry.ts` builds flexible pouch geometry.
- The canonical-dieline invariant is already documented in `AGENTS.md`.

The principal carton gap was that board thickness affected rendered faces but
did not materially move the mailer dieline's panel/score formulas. The existing
pouch engine is more mature than a GLB workflow, but each pouch construction
still needs measured/certified web rules.

## `/test` implementation and registered Studio asset

The research controls remain explicitly experimental, while the verified
centre-inflated renderer is now shared with one registered library SKU:

```text
src/lib/pacdora-lab/
├── types.ts       shared contracts
├── materials.ts   caliper and preview material profiles
├── box.ts         dimension conversion + multi-part mailer dieline solver
├── box-fold.ts    staged, bounded crease-relative mailer fold schedule
├── pouch.ts       center-seal + stand-up web/mesh generators
├── pouch-limits.ts coupled editor safety ranges
├── studio-adapter.ts continuous-web adapter for the production Studio engine
└── index.ts       public library boundary
```

`Centre-Inflated Stand-Up Pouch 150×210+62` is available in the `/` product
library and opens in Studio as `pouch-su-centre-150`. Its editor uses the exact
`174 × 506 mm` continuous web from the same solver: `12 mm` technical seal,
`210 mm` back, `62 mm` gusset, `210 mm` front, and `12 mm` technical seal. The
shared React renderer consumes the same procedural geometry and canonical-web
UVs in `/test`, the product card, and Studio, so those views cannot develop
separate pouch silhouettes.

Studio and the lab both accept artwork through the file picker or direct
drag-and-drop. The preview-only lab uses the same Studio editing engine and
in-memory asset pipeline for PNG, JPG, WebP, and SVG. Its selected production
region is an initial-placement and snapping target rather than a movement
boundary; the continuous-web canvas updates the pouch's one CanvasTexture.
Blank board and matte-film previews now start white; selecting another authored
material remains an explicit user action.

The `/test` route provides:

- Mailer, center-seal pillow, and stand-up construction switching.
- Box inner/knife/outer size modes.
- Roll-end, rounded ear-lock, and notched display mailer styles.
- Multiple board calipers.
- A live carton fold slider driven by parent-child crease hinges.
- A live pouch inflation slider.
- Separate center-fin, bottom-gusset, heat-seal, and zipper controls.
- Dynamic minimum/maximum guidance in mm and inches for every pouch dimension.
- Pouch film-material switching.
- The real Studio artwork UI with upload, text, colour, layers, crop/adjust,
  proportional transforms, and pan/fit/zoom; artwork crosses region folds on
  one continuous film web.
- One canonical 2D artwork web mapped by UV to the regenerated 3D pouch.
- A generated 3D preview.
- A generated flat dieline/film web.
- Resolved dimensions and material caliper.

### Important scope boundary

The `/test` coefficients are research assumptions, not production-certified
converting rules. They are intentionally marked as experimental in the UI and
code. The proof demonstrates the correct software architecture:

```text
one parameter solver → one resolved structure → flat preview + folded/inflated 3D
```

It must not be presented as a certified die until each construction is checked
against converter-provided formulas or an authorized reference drawing.

## Recommended production roadmap

1. Define a versioned `ConstructionTemplate` schema.
2. Store material/caliper/score rules separately from visual materials.
3. Resolve inner, knife, and outer modes before creating paths.
4. Generate canonical cut, crease, bleed, and technical paths.
5. Derive the 3D panel graph or flexible surface from those same paths.
6. Preserve named artwork regions and orientation through every rebuild.
7. Validate folded dimensions against expected inner and outer bounds.
8. Add construction-specific regression fixtures for every supported material.
9. Export GLB only as a derived preview artifact, never as the manufacturing
   source of truth.

## Confidence and unknowns

High confidence:

- Pacdora regenerates/replaces adjustable packaging geometry.
- Its rigid carton example is a panel/hinge scene built from extruded shapes.
- Its adjustable pouch is parameter-driven and exposes soft-bag expansion.
- A fixed monolithic GLB is not the manufacturing authority.

Medium confidence:

- Exact division of work between Pacdora's server-side knife service and
  browser-side mesh generator.
- The precise meaning of every `inless`/`outless` coefficient for every stock.
- Whether the top-level `gltf` UUID on some templates is a source identifier,
  optional asset, cache key, or hybrid-model reference.

Unknown without Pacdora's private engineering data:

- Its proprietary per-template packaging formulas.
- Certified tolerances and converter-specific score compensation.
- The full soft-body profile library used for every pouch family.
