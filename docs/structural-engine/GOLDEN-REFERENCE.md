# Golden Structural Reference

## Product

The first structural-engine acceptance product is:

```text
Lock Bottom and top incl. window
300 x 150 x 200 mm
```

The product name and nominal assembled dimensions are supplied reference
metadata. The vector PDF itself confirms a 300 mm main body span and
approximately 200 mm/150 mm face spans, but it does not encode the semantic
order of the nominal dimensions.

## Authority and provenance

The authorized local PDF identified in
`fixtures/cloudlab-lock-bottom-window-300x150x200/reference-manifest.json` is
the only exact source currently available. Its SHA-256 is:

```text
b6b8cda57f693275174abfb6e2e3d74411122eb1057feac086ecd26df27df557
```

The source is a true vector PDF. It must be imported at the object/path level.
Rasterization may be used for visual comparison only and must never become the
production geometry path.

The original asset is intentionally absent from Git because redistribution
permission is unknown.

## Exact source contract

An acceptable importer result must preserve:

- a `712.4 x 470.0 mm` outer cut envelope within PDF numeric tolerance;
- one 70-edge closed outer cut cycle;
- one 8-edge closed internal window cut cycle;
- 24 red crease source segments resolving to 16 crease chains;
- the named PDF separations and original source-entity provenance;
- the source transform chain and physical point-to-millimetre conversion;
- deliberate approximately 0.3 mm line details and gaps;
- the fact that the source contains only straight segments.

The window is mandatory geometry. It is approximately 180 x 260 mm, with four
approximately 10 mm chamfers and an area of about 46,600 mm2. It may not be
represented as a texture mask or editor-only guide.

## Semantic normalization

For this fixture, the reviewed import mapping is:

```text
/DieCutBlue  -> cut
/DieCutRed   -> crease
/DieCutGreen -> exterior display/bleed-band evidence; not a second cut
```

Mappings remain source-profile configuration, not universal colour rules.
After import, canonical entities store semantic operations such as `cut` and
`crease`; spot colour remains provenance/presentation metadata.

## Geometry versus construction metadata

### Exact from source

- Cut paths.
- Crease paths.
- Window path.
- Physical coordinates.
- Adjacency candidates produced by the planar arrangement.
- Stroke/source provenance.

### Must be authored and validated

- Panel identities and selected root panel.
- Mountain or valley direction.
- Assembled angles.
- Hierarchical crease ownership.
- Fold state targets and sequence.
- Glue seam.
- Tuck and lock destinations.
- Board thickness and any 3D-only compensation.
- Printed outside/chirality convention.

No fold metadata is included in this fixture yet. An implementation must fail
with an explicit "construction metadata required" result rather than inventing
values.

## Required acceptance views

The final golden evidence set must use the same canonical panels in all views:

1. Source vector dieline.
2. Editor dieline with semantic, screen-space hairline guides.
3. Fully flat Three.js structure in the source coordinate contract.
4. Every authored stable fold state.
5. Assembled carton with asymmetric diagnostic artwork.
6. Manufacturing SVG/PDF produced from the same canonical source.

No geometry replacement is permitted at the terminal flat or assembled frame.

## Required quantitative proof

At minimum, report:

- maximum, RMS, and bidirectional Hausdorff contour distance in millimetres;
- outer and window perimeter difference;
- outer and window area difference;
- window mask IoU/XOR independently from the outer silhouette;
- crease endpoint, length, angular, and line-distance error;
- UV to sheet-coordinate round-trip error;
- 100-cycle terminal hinge and world-matrix drift;
- assembled bounding-box deviation from validated target dimensions.

The initial tolerances and pass thresholds are defined in `QUALITY-GATES.md`.

## Reference limitations

- The PDF contains no Bezier or arc geometry. Curve support must be verified by
  an additional licensed or independently authored fixture.
- The supplied screenshots do not prove exact 3D topology, mapping, or motion.
- A fixed-camera video file was not part of the audited assets.
- Board stock and manufacturing construction metadata remain unvalidated.
- A competitor/reference screenshot is not proof that a visual behavior is
  physically correct.

## Golden verdict

**FAIL - UNSCORED.**

The source is exact and importable, but the engine has not yet produced the
required canonical, panel, mesh, UV, manufacturing, animation, and checker
artifacts. This document establishes the acceptance contract; it is not an
acceptance result.
