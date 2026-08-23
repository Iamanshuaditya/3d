# Progressive unfolding

How a product goes from assembled to flat, and how to give a new product that
behaviour without touching a component.

---

## The model

Structural state is a **pose**: absolute angles, keyed by hinge id.

```ts
type HingeAngles = Readonly<Record<string, number>>;   // degrees
```

A product's motion is an ordered list of stages:

```ts
type UnfoldStep = { id: string; label: string; targets: HingeAngles };
type UnfoldPlan = { assembled: HingeAngles; steps: UnfoldStep[]; reachesFlat: boolean };
```

The pose at stage *k* is `assembled` overridden by steps `1..k`. Targets are
absolute, never deltas, which is why:

- clicking mid-animation is safe — the animation holds no state, only the
  integer stage does;
- hammering the button cannot overshoot or drift;
- reverse and reset are the same operation with a different index.

`unfoldReducer` clamps to `[0, steps.length]`. `CartonModel` eases each hinge
toward its target with a frame-rate-independent exponential
(`1 - exp(-dt / 0.16)`), snapping instead when the viewer prefers reduced
motion.

---

## Capability, not product type

```ts
resolveProductPresentation(config)
//  { mode: "static" }                     bottles, jars, pouches, labels
//  { mode: "open-close", plan }           one articulation, no honest flat pose
//  { mode: "progressive-unfold", plan }   ends at the printed dieline
//  { mode: "unsupported", reason }        declared articulation we cannot drive
```

`UnfoldControl` renders from the plan's own labels, so it is not packaging
specific — a product could call its stages "Explode" or "Flatten" and the
component would not change. Products with no articulation render no control.

---

## Giving a carton an unfold sequence

**Nothing** is required: omit `spec.unfold` and a topological plan is derived —
primary articulation first, then joints by descending depth within the primary
subtree, then the rest, with a terminal "lay flat" safety step. A new spec
unfolds sensibly the day it is added.

Author a sequence when construction order matters (it usually does):

```ts
unfold: {
  mode: "hinge-graph",
  steps: [
    { id: "open",      label: "Open the lid", reverseLabel: "Close the lid",
      hingeIds: ["LID_TOP"], to: "open" },
    { id: "tuck",      label: "Release the tuck flap",  hingeIds: ["LID_TUCK"], to: "flat" },
    { id: "lid-flaps", label: "Unfold the lid side flaps",
      hingeIds: ["LID_LEFT", "LID_RIGHT"], to: "flat" },
    { id: "lid",       label: "Lay the lid flat",       hingeIds: ["LID_TOP"], to: "flat" },
    { id: "dust",      label: "Unfold the dust flaps",
      hingeIds: ["DUST_BL", "DUST_BR", "DUST_FL", "DUST_FR", "FRONT_ROLL"], to: "flat" },
    { id: "walls",     label: "Lay the walls flat",
      hingeIds: ["BACK", "FRONT", "LEFT", "RIGHT"], to: "flat" },
  ],
}
```

Hinge ids are panel ids. `to` is `"flat" | "open" | "assembled" | <degrees>`;
`"open"` is only legal on the primary articulation and throws otherwise.

### Rules the tests enforce

1. Every hinge id must exist in the articulation graph.
2. A joint must reach flat **no later than its parent** — a wall never lies
   down carrying a flap that is still standing.
3. A construction that cannot genuinely flatten may not author a sequence at
   all (`cartonCanFlatten`), so the animation cannot tell a lie.

---

## The flat pose

At the last stage every hinge is at 0 and each panel's centre lands at its
dieline offset from the root panel — asserted to 0.1 mm. The carton renders as
its **printed sheet**: the unprinted board faces are dropped
(`setDielineView`), because a carton printed on the outside folds away from its
print and would otherwise show its inside.

The camera flies to a framing **below** the sheet, because that printed side
faces down once the blank is flat — which is what makes the final stage
reproduce the editor canvas instead of its mirror image. A fill light comes on
with it so the blank reads as white board. See `ARCHITECTURE_AUDIT.md` §5.

A perspective camera is kept rather than swapping to orthographic: OrbitControls'
distance clamps, the hover-parallax rig and every authored preset are tuned for
perspective, and at that distance it is the square-on *angle* that makes the
pose legible, not the absence of convergence.

---

## What cannot unfold, and why

**The tapered clamshell (burger box).** Its trays are generated shell geometry —
chamfered loops, gussets, a rim strip — not folding dieline panels. It exposes
one lid joint and reports `open-close`. It has no flat pose that corresponds to
its dieline, and inventing one would animate a lie.

**Arbitrary GLBs.** A mesh file carries no structural information. Mechanical
unfolding needs a hinge graph, and that has to be authored. `GlbArticulationSpec`
defines the contract (node, parent, axis, pivot, angles, optional sequence);
a product that declares it today reports `unsupported` rather than silently
rendering as static. Wiring a driver for it is a bounded next step — the plan,
state machine, UI and camera work are already general.
