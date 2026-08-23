# Structural Panel Model

## Authority boundary

A structural panel is a bounded face of the normalized planar arrangement. It
is not a rectangle and it is not a Three.js mesh.

The authoritative contract is:

```text
CanonicalDieline
  -> normalized source spans
  -> PlanarGraph face
  -> StructuralPanel
```

Each panel retains an ordered outer loop, zero or more ordered hole loops,
physical bounds, source-face identity, and the source crease edges incident on
that face. Bounds are derived metadata for fitting and search; they may never
be extruded as panel geometry.

## Boundary loops

A topology loop is an ordered sequence of edge uses. Each use records both the
edge and traversal direction. Source edges retain the exact source vector
segment, transform, source parameter range, manufacturing operation, and
provenance.

Adaptive points stored for containment and QA are derived. They do not replace
the ordered vector edge uses.

Reviewed topology-only connections are discriminated edges with:

- no manufacturing operation;
- no source span;
- an explicit source-hash-locked engineering reason;
- an independently checked physical limit.

They can close a reviewed presentation gap in the face arrangement, but they
cannot become a cut path, production export path, or hinge axis.

## Holes

An internal window is a hole loop owned by exactly one panel. It is not a
guide, alpha mask, texture trick, or overlaid rectangle.

The rendering derivation is:

```text
panel.outerBoundary -> THREE.Shape
panel.holes[]        -> shape.holes[]
```

Both printed and inner faces use the same triangulated opening. The exposed
board-edge geometry includes every hole perimeter as well as the outer
perimeter.

## Derived render geometry

Curves are flattened only for the renderer, under an explicit maximum chord
error in millimetres. There is no global fixed segment count. The canonical
curve remains unchanged.

A known board thickness produces three material classes:

1. printed outside face;
2. unprinted inside face;
3. exposed outer and internal cut edges.

The nominal flat face remains on the authoritative sheet plane. Thickness and
fold compensation live in derived construction space and cannot move a source
cut or crease.

## Flat sheet mapping

The structural renderer uses one documented affine sheet mapping. Its scale is
global for the complete blank, not selected independently per panel.

```text
canonical x mm -> world x
canonical y mm -> world z
board depth    -> world y
```

At all fold angles equal to zero, projecting every panel back through the
inverse mapping must recover the panel's canonical topology loops. The union
of panel faces must recover the source blank, including the real window.

## Artwork coordinates

Every printed-face vertex derives UV from the same canonical sheet coordinate:

```text
u = 1 - sheetX / sheetWidth
v = 1 - sheetY / sheetHeight
```

The two inversions are the existing outside-print convention. They are global,
not per-panel corrections. Adjacent panels therefore sample adjacent artwork,
and an asymmetric outside-face chirality test must pass for every panel.

## Build lifecycle

Panel geometry is built once after import and topology validation. Fold and
unfold operations update hinge transforms only. They do not retriangulate,
recreate textures, or change UV attributes.

## Required checks

- every panel loop is simple and has non-zero physical area;
- every hole is contained by exactly one panel under even/odd nesting parity;
- triangulated projected area agrees with panel area within the render
  tolerance;
- no triangle covers a hole;
- cut edges follow all notches, angled tabs, curves, and window perimeters;
- printed and inner normals oppose each other;
- thickness equals the authored physical value;
- UV-to-sheet round trips meet the physical tolerance;
- flat projected boundaries meet the source comparison threshold.

The private golden fixture currently establishes 17 panel regions and one
eight-edge window owner. Its render-derived proof remains pending until the
panel geometry implementation and independent mesh checker pass.
