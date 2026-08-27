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

The corrected center-seal construction now has:

- Wide, nearly flat cross-web heat-seal bands at the top and bottom.
- A pinched shoulder immediately inside each heat seal.
- A broader, inflated middle that produces a pillow/hourglass outline.
- A separate back fin seal instead of a decorative line on the front face.
- Deterministic side wrinkles that diminish to zero across the seal bands.

The corrected stand-up construction now has:

- Independent front and back face membranes.
- A narrower gusset entry, broad artwork face, and full-width top seal.
- Flat side-seal rails built into the membrane topology rather than decorative
  bars placed over the surface.
- Optional paired zipper tracks sampled from the same curved face, so they do
  not float or poke through when the pouch is viewed from the side.
- A separately tessellated bottom-gusset membrane. Its front and back edges
  meet the face membranes while its centre folds sharply upward. Lifted lower
  corners create the Doypack U profile and leave two physical standing rails
  rather than a painted gusset line.

The two stable flat webs are consequently different:

```text
centre-seal web width  = 2 × face width + back-fin seal
centre-seal web height = body height + 2 × end seal

stand-up web width     = face width + 2 × side seal
stand-up web height    = back face + bottom gusset + front face + 2 × end seal
```

The mailer comparison also showed that base + four walls + lid was too simple.
The experimental mailer now includes two lid wings, four corner dust flaps, a
rolled/double front wall, a centre locking tongue, and matching lock slots.
Those parts are present in both the canonical blank and the folded 3D assembly.
They remain research geometry—not a copied or certified Pacdora die.

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

## `/test` implementation

The research proof is deliberately isolated from the production configurator:

```text
src/lib/pacdora-lab/
├── types.ts       shared contracts
├── materials.ts   caliper and preview material profiles
├── box.ts         dimension conversion + multi-part mailer dieline solver
├── pouch.ts       center-seal + stand-up web/mesh generators
└── index.ts       public library boundary
```

The `/test` route provides:

- Mailer, center-seal pillow, and stand-up construction switching.
- Box inner/knife/outer size modes.
- Multiple board calipers.
- A live carton fold slider.
- A live pouch inflation slider.
- Separate center-fin, bottom-gusset, heat-seal, and zipper controls.
- Pouch film-material switching.
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
