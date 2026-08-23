# Canonical Vector Domain

## Authority

`CanonicalDieline` is the structural packaging authority. It stores vector
geometry and manufacturing semantics in physical millimetres. Editor guides,
topology, panels, meshes, hinges, UVs, measurements, and manufacturing output
must consume it; none may replace it with independently reconstructed
rectangles or screen coordinates.

The canonical sheet coordinate contract is:

```text
x increases rightward
y increases downward
all physical distances are millimetres
```

The corresponding flat Three.js contract is defined separately by the hinge
rig, but it must be an invertible direct mapping of these sheet coordinates.

## Vector semantics

The authoritative segment union is:

- line;
- circular arc in centre parameterization;
- rotated elliptical arc in centre parameterization;
- quadratic Bezier;
- cubic Bezier.

Curves remain curves in source authority. Adaptive flattening is a derived
rendering/analysis operation and never rewrites a canonical source curve.
There is deliberately no universal `segments = N` policy.

Every `VectorPath` stores:

- a stable ID;
- ordered semantic segments;
- explicit open/closed topology;
- a retained affine transform;
- source provenance.

Every imported segment may additionally retain its exact source entity,
source-segment index, and source parameter interval. Intersection splitting
must narrow that parameter interval rather than discard provenance.

## Affine transform contract

The matrix layout is SVG-compatible:

```text
x' = a*x + c*y + e
y' = b*x + d*y + f
```

`multiplyAffine(left, right)` means `left ∘ right`; `right` acts on the
point first. `composeAffine()` accepts matrices in application order.

Importers may preserve source coordinates in segment control points and place
the exact source-to-canonical conversion in `VectorPath.transform`. All
consumers evaluate the transformed physical path; no consumer may assume raw
control-point values are already screen or world coordinates.

Singular, non-finite, overflowing, or condition-number-greater-than-`1e12`
transforms reject. This is an explicit numerical policy, not an attempt to
repair malformed CAD silently.

## Manufacturing semantics

Geometry is normalized to operations such as:

```text
cut
crease
perforation
score
half-cut
window-cut
bleed
safe
glue
```

Finishing and explicitly namespaced custom operations are typed separately.
Source color, layer, or spot-separation names remain provenance/import aids;
they do not remain the structural meaning after classification.

Classification records whether meaning was explicit, mapped from a layer or
style, authored by an import profile, or inferred. Inference must carry a
confidence value and may not masquerade as exact source metadata.

## Physical tolerance budget

Defaults are:

| Quantity | Default |
|---|---:|
| floating-point coordinate epsilon | `1e-9 mm` |
| topology snap limit | `0.01 mm` |
| curve flattening chord error | `0.05 mm` |
| structural boundary comparison | `0.05 mm` |
| metric sample spacing | `0.05 mm` |
| adaptive subdivision safety depth | `32` |

Coordinate epsilon is not a CAD repair tolerance. A gap greater than epsilon
is reported. If it is within topology snap distance it is marked as requiring
an explicit repair; a path evaluator never invents an edge across it.

The metric certificate budget enforces:

```text
2 * topologySnapMm + metricSampleSpacingMm / 2
    <= boundaryComparisonMm
```

This prevents a permissive repair/sample policy from certifying a stricter
boundary threshold.

## Exact and derived calculations

Analytic operations include:

- segment endpoints;
- transformed bounds, including curve extrema;
- exact signed Green-integral area for lines, Beziers, and affine arcs;
- affine determinant/orientation behavior.

Closed-path area is evaluated in untranslated local coordinates after
subtracting a local anchor, then multiplied by the affine linear determinant.
Applying a large translation first is forbidden because it can quantize a
zero-area production contour into false non-zero area.

Adaptive tessellation supports:

- renderer input;
- point-to-path evaluation;
- self-intersection screening;
- supplementary distance/mask metrics.

The vector source remains authoritative when tessellation is used.

## Validation invariants

A canonical dieline rejects at least:

- duplicate entity/path IDs;
- unsupported semantic operations;
- source/path/segment provenance conflicts;
- invalid or collapsed transforms;
- non-finite and zero-length segments;
- sweeps outside one full revolution;
- discontinuous paths without explicit topology repair;
- an open path declared as a window cut;
- a closed contour with fewer than three physical points;
- zero-area windows/closed contours;
- adaptively detected self-intersection;
- invalid tolerance budgets.

Validation is fail-closed. A consumer must not catch an invalid canonical
structure and continue with approximate geometry.

## Geometric comparison

Path comparison reports separately:

- sampled lower-bound maximum distance;
- certified Hausdorff upper bound;
- certificate uncertainty;
- RMS distance;
- perimeter difference;
- exact signed/unsigned area difference;
- topology and winding mismatch.

Sparse sampling cannot produce a false PASS. If the requested uncertainty
cannot be certified, the comparison returns `indeterminate`.

## Current verification

The independent vector gate at commit `9a9cec4` passed `30/30`. Adversarial
coverage includes hidden between-sample deviations, degenerate and
self-crossing windows, repairable/over-budget gaps, transform overflow and
conditioning, provenance conflicts, topology mismatch, and line/Bezier/arc
area under reflected affine transforms and translations through `1e15`.

This scoped result verifies the vector foundation. It is not a claim that the
golden carton or the complete product quality gate has passed.
