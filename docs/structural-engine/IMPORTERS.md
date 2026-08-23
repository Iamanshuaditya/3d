# Structural Importers

## Import rule

An importer converts recoverable vector source objects into
`CanonicalDieline`. It must preserve physical scale, vector semantics,
transforms, source provenance, and normalized manufacturing operations.

An importer is not an image tracer. PNG/JPEG evidence may support a human
review workflow, but it cannot enter the production-accurate geometry path.

Unsupported production geometry fails explicitly. Sampling, flattening,
clipping away, or silently skipping a classified source object is not an
acceptable fallback.

## Semantic profiles

Layer, object ID, stroke, color, or PDF separation rules belong to an explicit
source/import profile. Matching is an import classification aid only.

Example:

```text
source layer "CUT" -> operation "cut"
```

Downstream code reads `operation: "cut"`, not the layer name or color.
Mappings are not assumed to be universal between vendors or files.

## SVG

Implemented support includes:

- `path` commands M/L/H/V/C/S/Q/T/A/Z;
- line, polyline, polygon;
- sharp and rounded rectangle;
- circle and ellipse;
- nested transforms;
- `viewBox`, physical width/height, and `preserveAspectRatio` behavior;
- mm, cm, m, inch, point, pica, CSS pixel, and quarter-millimetre units;
- configurable layer, ID, stroke, explicit-operation, and default mapping;
- source and segment provenance.

Physical `width` and `height` are mandatory. A `viewBox` alone has no
authoritative manufacturing scale and rejects.

SVG shape attributes with explicit physical units first resolve into CSS
user units at the configured DPI; the `viewBox` transform then maps those user
units into the physical viewport. This order is browser-verified and matters
for non-uniform view boxes. It is incorrect to divide an inner `10mm` shape
length by a view-box axis scale before applying that transform.

Current fail-closed exclusions include:

- raster `<image>` as structural authority;
- unresolved `<use>` instances;
- nested `<svg>` geometry;
- clip paths and masks until exact clipping is implemented;
- embedded or external CSS and unsupported inline/presentation transforms or
  SVG2 geometry properties;
- active, scripted, animated, event-driven, or conditional SVG content;
- duplicate explicit IDs and normalized semantic mapping collisions;
- unsupported structural elements/commands;
- unclassified vector geometry in strict mode.

`display:none` hides its complete subtree. Visibility and layer inheritance
follow ancestry rather than allowing an ordinary nested group ID to replace an
authored semantic layer.

An arc with distinct endpoints is never omitted through a fixed source-space
epsilon. If extreme source scaling makes its angular representation
numerically ill-conditioned, import rejects explicitly rather than silently
turning a physically material curve into a line.

## DXF

Implemented planar ASCII-DXF support includes:

- `LINE`;
- `LWPOLYLINE`, including exact bulge arcs;
- legacy `POLYLINE`, including closure and bulge arcs;
- `ARC`;
- `CIRCLE`;
- `ELLIPSE`;
- a single non-rational clamped degree 1/2/3 `SPLINE` span that is exactly a
  line/quadratic/cubic Bezier.

The importer preserves a common affine mapping from conventional DXF
x-right/y-up model space into canonical x-right/y-down millimetres. Source
control points and identity source transforms remain in provenance.

`$INSUNITS` supplies physical scale when supported. Unitless/vendor-specific
drawings require an explicit source unit or positive
`millimetresPerSourceUnit`; the importer does not guess scale.

DXF operation semantics use configurable case-insensitive layer mappings or
an explicit caller default. No layer name is treated as universally semantic.

Current fail-closed exclusions include:

- 3D, mesh, curve-fit, or spline-fit legacy polylines;
- general multi-span, periodic, closed, or rational B-splines;
- hidden rational SPLINE weights even when the file's flags are inconsistent;
- non-default extrusion/object-coordinate systems;
- non-zero Z/elevation structural geometry;
- block `INSERT` expansion;
- classified unsupported entity types;
- paper-space geometry as model-space authority;
- unclassified geometry in strict mode.

A raw entity-record preflight validates record alignment and extrusion tags
because the current parsing dependency discards some such tags for selected
entity types. Dependency convenience must not weaken production correctness.

## Vector PDF

The golden PDF is a true vector document. Its importer is being implemented in
an isolated branch and is not yet certified or merged.

The required architecture has two coordinated passes:

1. recover exact painted vector paths and full transform state through the
   PDF.js operator stream;
2. inspect raw PDF resources/operators for named spot-separation semantics
   that PDF.js converts to display RGB.

The semantic pass and geometric pass must join through stable page/form paint
order and geometric fingerprints. A color-only rendered approximation cannot
recover `/DieCutBlue`, `/DieCutRed`, or `/DieCutGreen` authority.

For the authorized golden source, certification must prove:

- physical point-to-millimetre conversion;
- page/form transform composition;
- 70 outer cut edges;
- 8 window-cut edges;
- 24 crease source segments resolving to 16 chains;
- named separation provenance;
- deliberate approximately 0.3 mm details;
- no raster/OCR geometry path.

PDF clipping, unsupported shadings, transparency behavior that alters
structural paths, or geometry that cannot be aligned with its raw semantic
operator must reject or request source review. It may not be silently guessed.

## Import result and repair boundary

Import produces vector entities and issues; topology normalization is a
separate stage. Importers do not close gaps, split intersections, identify
panels, or infer fold behavior.

The downstream normalizer may propose repairs within the configured physical
tolerance, but every repair is reported with source provenance. Larger
presentation gaps, vendor quirks, or construction facts require an explicit
fixture/profile or human decision.

## Construction metadata is not import geometry

Cut/crease vectors can provide adjacency candidates. They do not reliably
provide:

- mountain/valley direction;
- assembled target angle;
- hierarchy/root;
- fold order and timing;
- glue seam;
- tuck/lock destination;
- collision priority;
- board thickness.

These facts use explicit authored metadata and independent validation. An
importer must never infer them silently just to produce an assembled preview.
