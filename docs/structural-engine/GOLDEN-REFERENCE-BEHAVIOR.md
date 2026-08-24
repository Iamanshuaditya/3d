# Golden Reference Behavior

This document records the fold behavior visible in the supplied reference
recording for the 300 x 150 x 200 mm lock-bottom/window carton. It is benchmark
evidence, not recovered source code and not a substitute for manufacturer
construction metadata.

The implementation contract is exported from
`src/lib/structure/golden-reference-behavior.ts` and is included in every local
golden evidence bundle as `golden-reference-behavior.json`.

## Recording facts

The analyzed recording is 29.4 seconds at 30 FPS (about 33.33 ms per frame).
The cleanest useful cycle is approximately:

```text
11.2 s  assembled / mostly assembled
   ↓ backward
20.5–22.0 s  essentially flat and held
   ↓ forward
22.2 s  folding begins
~27.0 s assembled again
```

The controls are not continuously visible enough to assign exact click-down
frames. Time windows in the contract therefore describe visible motion, not
recovered button timestamps.

## State model supported by the recording

The visible behavior is represented as six major states:

```text
0 flat
1 body forming
2 rectangular body erected
3 side/dust/secondary top flaps positioned
4 major top closure folded
5 final top/tuck closure settled
```

Some body-forming states may belong to one UI click with staggered hinge
transitions. The state model is intentionally a visual benchmark rather than a
claim about the competitor's internal state machine.

High-level Forward behavior is:

```text
body → secondary/dust flaps → major closure → final closure
```

Backward removes closure interference before flattening the body:

```text
major closure → secondary/dust flaps → body → flat
```

That ordering is substantially more important than reproducing an unverified
internal implementation detail.

## Motion envelope

For recreation and scoring, individual hinge motion should normally remain in:

```text
450–700 ms duration
50–150 ms stagger where several hinges participate
easeInOutCubic / equivalent power ease
no spring bounce
no overshoot or cardboard wobble
exact target snap at completion
```

The current structural default (550 ms, easeInOutCubic) deliberately sits inside
this observed envelope. Camera/orbit state is independent from folding state.

## High-confidence facts

The recording strongly supports:

- rigid planar panels rather than continuous mesh deformation;
- rotation around real crease lines;
- deterministic tween/keyframe motion rather than physics;
- top closure opening before body flattening;
- side/dust flaps moving as a separate phase;
- major wall and closure folds being roughly quarter-turn folds;
- Forward and Backward reusing substantially the same structural target states
  in reverse order.

## Facts that must remain unresolved

The recording cannot certify:

- exact source-code animation library;
- exact mouse-down timestamps;
- exact per-hinge numerical duration constants;
- exact board thickness in millimetres;
- exact bottom-lock construction and collision priority;
- exact glue-flap behavior;
- the original implementation's chosen root panel;
- exact signed mountain/valley direction for every crease;
- exact tuck/lock destinations.

Those fields must not be auto-authored into a production
`StructuralConstructionSpec`. When unavailable, they stay explicit unknowns.

## Acceptance use

The reference behavior contract is useful for checking that an authored golden
construction:

1. exposes the same broad stable-state sequence;
2. opens closure components before flattening the body;
3. uses crease-axis rigid rotations;
4. keeps major folds close to the observed quarter-turn range where applicable;
5. uses finite, smooth, non-spring transitions inside the visual timing envelope;
6. leaves camera state independent;
7. reverses deterministically without geometry rebuild or drift.

Passing these behavior checks still does not certify an invented bottom-lock or
crease sign. Geometry, construction metadata, and reference behavior remain
separate evidence layers.
