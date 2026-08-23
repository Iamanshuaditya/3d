# Structural Hinge Rig

## Source-derived axes

A hinge starts as one or more collinear source crease spans shared by exactly
two structural panels. Generated edge IDs are not durable construction
metadata. A fold definition binds the complete set of source addresses and the
source digest/import schema that produced them.

Multiple consecutive source paints may represent one physical crease. They
must be validated as a connected, straight chain and animated as one degree of
freedom. The golden PDF contains 24 crease paints but 16 physical straight
crease chains; four diagonal hinges contain three source spans each.

Topology-only presentation-gap connections have no source span and can never
become a hinge.

## Authored construction facts

Linework establishes position, length, direction, and adjacency. It does not
reliably establish:

- mountain or valley direction;
- signed assembled angle;
- root panel and parent/child hierarchy;
- sequence and collision priority;
- seam, glue, tuck, and lock destinations;
- board-thickness compensation.

Those facts use explicit runtime-validated metadata. Metadata is hash-locked,
must reference exact source addresses, and fails when an address becomes
missing, ambiguous, non-collinear, differently adjacent, or stale.

## Hierarchical transform

For crease endpoints `A` and `B` in canonical sheet space:

```text
axis = normalize(B - A)
```

The scene hierarchy aligns a hinge group's local X axis with that crease:

```text
ParentPanelFrame
  -> Anchor translated to A
      -> AxisFrame (local X aligned with B-A)
          -> FoldGroup (rotation.x = signed absolute angle)
              -> CanonicalFrameInverse
                  -> ChildPanelFrame
```

At zero angle the axis frame and its inverse cancel, so the child returns to
its exact canonical sheet pose. Downstream child hinges inherit every upstream
transform naturally.

Equivalent matrix form:

```text
Mchild = Mparent * T(A) * Raxis(angle) * T(-A) * MflatChild
```

The implementation uses hierarchy rather than recomputing unrelated world
poses on every frame.

## Flat-state invariant

Zero is the nominal dieline angle for every structural hinge. It is not a
separately generated flat model.

At zero:

- each crease axis maps back to its exact source chain;
- each panel boundary maps back to its source-derived topology loop;
- the window remains the same geometric hole;
- UVs recover the same sheet coordinates;
- no thickness compensation changes the production crease.

## Board thickness

The source crease remains nominal and exact. Any visual neutral-axis or
stacking compensation is a derived 3D offset applied only away from the flat
state. Returning to zero must remove that compensation exactly.

## Pose and transition model

Hinge state is a map of absolute target angles. Deltas are forbidden.

```text
FoldState      = absolute angle per hinge
FoldTransition = timed actions between adjacent states
```

Each action may author target angle, delay, duration, and easing. Completion
snaps to the exact target. Backward traverses the same state graph in reverse;
it is not an independently invented animation.

The first tuning range is 450–700 ms per hinge, 50–150 ms stagger, and
`easeInOutCubic`, without spring, overshoot, or physics.

## Camera separation

Camera/orbit state is not fold state:

```text
Scene
  -> Camera + controls
  -> PackageRoot + hinge hierarchy
```

Fit assembled, fit flat, top view, and reset camera are explicit presentation
commands. A fold transition does not silently fly the camera.

## Golden authored status

Exact topology supports a body strip of a likely seam panel, 200 mm broad
face, 150 mm side, 200 mm windowed broad face, and approximately 150 mm side,
all 300 mm high. Selecting the windowed broad face as root is a useful preview
hypothesis, not a source-derived manufacturing fact.

Fold direction, hierarchy, closure order, seam role, tuck/lock destinations,
and board thickness remain pending authored validation. Until that metadata is
validated, the system may show exact flat geometry but must not label an
assembled pose production-approved.

## Required checks

- every hinge source chain is complete, connected, straight, and shared by the
  declared panel pair;
- source endpoints, total length, direction, and inverse sheet mapping meet the
  physical tolerance;
- every non-root panel has exactly one parent hinge;
- hierarchy is connected and acyclic;
- all terminal states equal authored absolute angles;
- 100 assembled/flat cycles produce zero meaningful angle, matrix, vertex, and
  UV drift;
- rapid retargeting remains finite and settles deterministically;
- no geometry is rebuilt during transitions.
