# Kimi K3 Video Analysis — 3D Folding/Unfolding Animation Reverse-Engineering

**Source video:** `/Users/anshuaditya/Desktop/2026-08-24 01-09-09.mov` (29.4s, 1280×720 @ 30fps screen recording)
**Analyst:** Kimi K3 (Moonshot AI) via free UnoRouter route (`kimi-k3:free`)
**Method:** 16 evenly-sampled frames + the full 41-part reverse-engineering prompt; 5 chained requests (free-tier 16K output cap per request), merged in order
**Date:** 2026-08-24

> **Editor's note:** Sections were generated across 5 continuations. One discrepancy remains between §7
> ("Backward is NOT a strict time-reversal — separately parameterized, confidence 0.70") and §20
> ("forward/backward are the same evaluator with sign-flipped time"). Treat both as competing hypotheses;
> §26's controller design supports the timeline-reversal model. Verify against the live app if possible.

---

<!-- PART 1/5 — Sections 1–7 (response truncated by free-tier output cap) -->

Package: tall rectangular carton with tuck top (visible tuck flap with slot in frames 8, 14-15) and lock bottom (tab title). Frames show sequence: folded box with top open flaps → closing → closed box → rotating/orbiting → reopening → unfolding toward flat (frame 12 shows flattened dieline-like shape) → refolding.

I'll produce the full 26-section spec, being appropriately hedged. Keep it thorough but not infinitely long. This is a text answer; no tools needed. Write in English.

# 1. Executive Summary

**What the evidence actually is.** I was given 16 chronological still frames from a screen recording of a browser-based packaging personalization tool (URL: `artnext-x4-anx46.your-cloudlab.com/...personalize...`, vendor branding "NEXIWORLD", browser tab titled `product_Lock Bottom ...`). The UI shows a 2D dieline editor (left, with cut/crease lines and a "183 mm" dimension callout) and a floating **"3D Preview"** modal containing a white carton rendered in WebGL. Frame 1 is an OBS window (recording setup) and contains no product content.

**Critical honesty up front:** the frames contain **no visible Forward/Backward buttons**, **no cursor clicks on such controls**, **no timestamps, and no frame counter**. Therefore exact timestamps, exact durations, exact easing curves, and the literal step-count of the state machine are **not directly observable**. What *is* observable is a sequence of poses of a white folding carton. Everything below is classified as OBSERVED / STRONGLY INFERRED / POSSIBLE IMPLEMENTATION, and anything not derivable is marked **UNKNOWN** rather than invented.

**What the system appears to be (high confidence):** a deterministic, **tween/keyframe-driven hierarchical hinge animation** — a rigid-panel scene graph in which each carton panel is parented to a pivot group positioned on its crease line, and folding is achieved by rotating those pivots around the crease axis. The product is a **straight-tuck-end (STE) style tuck-top carton with a lock bottom** (per the tab title and the visible tuck flap with a friction slit). The animation cycles: assembled box → top opens → box unfolds toward a near-flat blank → refolds → top closes. There is also camera orbiting between steps. No physics, no overshoot, no wobble is visible.

---

# 2. Video Timeline

No timecodes exist in the frames. I therefore index by frame number (F1–F16) in chronological order as provided. Relative ordering is OBSERVED; absolute timing is UNKNOWN.

```text
F01  — OBS recording window (recursive screen capture). No product content. Disregard.
F02  — 3D Preview open. Carton nearly closed, viewed from front-slightly-above.
       Top tuck flap visible at top, appears mostly closed/inserted. (STATE: ~closed)
F03  — Carton mid-motion: top region open, major top flap raised at an angle,
       smaller flaps splayed. Body still a formed tube. (STATE: top opening / partially open)
F04  — Top major flap nearly horizontal-open, dust/shoulder flaps visible,
       one small flap sticking out to the right. (STATE: top fully open)
F05  — Box closed again, viewed from a different (higher, more side) angle —
       gable-like top silhouette visible = camera has orbited. (STATE: closed, camera moved)
F06  — Closed box, more frontal view. (STATE: closed)
F07  — Closed box, slight rotation; small protrusion visible on right side
       (likely a dust flap or tuck edge catching light). (STATE: closed, camera orbit)
F08  — View from front-above: top tuck flap clearly visible as a horizontal lid
       with the tuck tongue/slot edge visible. (STATE: closed, top detail visible)
F09  — Top opening again: both side dust flaps splayed outward symmetrically,
       lid lifted. (STATE: top open)
F10  — Box viewed edge-on / strongly rotated: body appears as a thin vertical slab.
       (STATE: camera orbit to near-profile, box closed or closing)
F11  — Near-profile view, top flap sticking up vertically. (STATE: partially open, profile view)
F12  — KEY FRAME: the model appears substantially FLATTENED — an irregular tall
       silhouette like a partially unfolded blank standing vertically, with flap
       protrusions top and bottom. (STATE: unfolding toward flat dieline)
F13  — Very washed-out/faint tall shape — either mid-unfold with faces edge-on
       to camera (near-zero apparent area) or a fade/transition. (STATE: ~flat or edge-on)
F14  — Box re-formed, top open with dust flaps out. (STATE: refolded, top open)
F15  — Box with top lid closed over, tuck flap visible on front face top edge.
       (STATE: closing/closed)
F16  — Fully closed box, plain front view. (STATE: closed — end of cycle)
```

**Observed event inventory:**
- Folding events (open→closed top): F03–F05 region, F14–F16.
- Unfolding events (closed→open top): F02–F04, F08–F09.
- Unfold toward flat: F10–F13.
- Refold from flat: F13–F14.
- Camera changes (STRONGLY INFERRED as camera orbit, not object spin — see §15): F04→F05, F06→F07, F09→F10.
- Forward/Backward button clicks: **NOT VISIBLE in any frame — UNKNOWN when they occurred.**

---

# 3. Package Structure

Package type: **tuck-top carton with lock bottom** (tab title "product_Lock Bottom …"; visible tuck lid with tongue and slit). Tall rectangular tube, height dominant (dieline shows 183 mm vertical dimension on one panel).

Panel inventory (IDs assigned by me; names follow packaging convention):

```text
P0 — Front panel (large rectangle; carries the tuck-flap top edge)
P1 — Right side panel
P2 — Back panel
P3 — Left side panel
P4 — Glue flap (narrow strip at one vertical end of the blank — STRONGLY INFERRED
     from standard 4-panel tube construction; not individually resolvable in frames)
P5 — Top tuck flap / lid (attached to top of P2 back panel in classic STE;
     visible as the lid in F08/F15)
P6 — Tuck tongue (extension of P5 with the friction slit — visible as the
     small rounded tab/slot feature in F08/F15)
P7 — Top front flap (attached to top of P0; folds down inside, under the lid)
P8 — Top left dust flap (attached to top of P3)
P9 — Top right dust flap (attached to top of P1) — the two symmetric splayed
     flaps in F09/F14
P10–P13 — Bottom closure flaps (lock-bottom set: two major + two minor,
     per "Lock Bottom" product name; never visible in the frames — camera never
     shows the bottom. Existence STRONGLY INFERRED, geometry UNKNOWN)
```

Per-panel attributes:

| ID | Shape | Relative size | Connected to | Crease | Rigid? | Deforms? | Flat orientation | Folded orientation |
|----|-------|---------------|--------------|--------|--------|----------|------------------|--------------------|
| P0 | Rectangle | W × H (H≈183mm region) | P1, P3 (sides), P7 (top), bottom flap | vertical ×2, horizontal ×2 | Yes (observed) | No bending observed | Coplanar with blank | Vertical, front face |
| P1 | Rectangle | D × H (narrower) | P0, P2, P9, bottom flap | vertical ×2, horiz ×2 | Yes | No | Coplanar | Vertical, 90° to P0 |
| P2 | Rectangle | W × H | P1, P3, P5, bottom flap | vertical ×2, horiz ×2 | Yes | No | Coplanar | Vertical, back face |
| P3 | Rectangle | D × H | P2, P0, P8, bottom flap | vertical ×2, horiz ×2 | Yes | No | Coplanar | Vertical, 90° to P2 |
| P4 | Narrow strip | ~10–15mm × H | P3 (or P0) | 1 vertical | Yes | No | Coplanar | Inside, glued to opposite panel |
| P5 | Rectangle w/ radius corners | W × ~D | P2 | 1 horizontal | Yes | No | Coplanar (extends up) | Horizontal lid |
| P6 | Tongue w/ slit | W × ~15–20mm | P5 | 1 horizontal | Yes | No | Coplanar | Vertical, tucked inside front |
| P7 | Rectangle (may have angled shoulders) | W × ~D | P0 | 1 horizontal | Yes | No | Coplanar | Horizontal, under lid |
| P8/P9 | Trapezoid-ish dust flaps | D × ~D/2 | P3 / P1 | 1 horizontal each | Yes | No | Coplanar | Folded inward ~90° |
| P10–13 | Lock-bottom flap set | various | bottoms of P0–P3 | 4 horizontal + diagonal score(s) | Yes | Lock bottom involves diagonal creases — POSSIBLE slight compound motion | Coplanar | Interlocked horizontal base |

**Confidence:** P0–P3, P5–P9 existence: High. P4 glue flap: Medium-High (standard construction; not resolvable). P10–P13 lock-bottom detail: Medium (name-based inference; never on camera).

---

# 4. Dieline Connectivity

The 2D dieline visible behind the modal (F02–F16, left and right edges) shows a multi-panel horizontal strip layout with red (crease) and black/blue (cut) lines — consistent with a 4-panel tube + top/bottom flap sets arranged vertically along the strip.

Connectivity graph (STRONGLY INFERRED from standard STE lock-bottom construction + visible folded behavior):

```text
P4 GlueFlap — P3 Left — P0 Front — P1 Right — P2 Back        (horizontal tube strip)
                  |         |          |          |
                 P8        P7         P9         P5—P6       (top flaps)
                  |         |          |          |
                P13       P10        P11        P12          (bottom lock flaps)
```

Folded tube adjacency: P4 glues to the inside of P2 (or the strip wraps P3→P0→P1→P2 and P4 meets P2). The animation hierarchy (which panel is kinematic root) is a separate question — see §12.

---

# 5. Crease/Hinge Map

All hinges below are crease-line pivots. For each: classification + estimates.

```text
H0  Parent P0 → Child P1   Edge: right vertical edge of P0
    Axis: local vertical (Y in panel space). Fold: 0° → ~90° (inward/valley
    relative to outside print face). Confidence: High (tube formation visible).

H1  Parent P1 → Child P2   Edge: right vertical edge of P1
    Axis: vertical. 0° → ~90°. Confidence: High.

H2  Parent P2 → Child P3   Edge: right vertical edge of P2 (in flat layout)
    Axis: vertical. 0° → ~90°. Confidence: High.
    (Note: depending on where the strip is "cut" for the hierarchy, one of the
    four vertical corners is closed by glue flap P4 at ~90° instead.)

H3  Parent P3 → Child P4 (glue flap)  Axis: vertical. 0° → ~90°.
    Confidence: Medium.

H4  Parent P2 → Child P5 (top lid)   Edge: top horizontal edge of back panel
    Axis: horizontal (X in panel space). 0° → ~90° (fold over the top opening).
    OBSERVED in F03/F04/F09 (lid raised/lowered). Confidence: Very High.

H5  Parent P5 → Child P6 (tuck tongue)  Edge: outer edge of lid
    Axis: horizontal. 0° → ~90–100° (tongue folds down to tuck behind front panel).
    OBSERVED as the tucked tab in F08/F15/F16. Confidence: High.

H6  Parent P0 → Child P7 (front top flap)  Axis: horizontal. 0° → ~90° inward.
    Confidence: Medium-High (partially occluded by lid in frames).

H7  Parent P3 → Child P8 (left dust flap)  Axis: horizontal. 0° → ~90° inward.
    OBSERVED splayed open in F09/F14, closed under lid in F15. Confidence: High.

H8  Parent P1 → Child P9 (right dust flap)  Axis: horizontal. 0° → ~90° inward.
    OBSERVED (the right-side protruding flap in F04/F07). Confidence: High.

H9–H12  Bottom flaps off P0–P3 + diagonal lock scores. UNKNOWN in detail —
    bottom never visible. Lock bottom implies at least one diagonal crease with
    compound (non-90°, possibly ~45° + panel-over-panel) motion. Confidence: Low-Medium.
```

**Hinge orientation inheritance:** H4–H8's world-space axes change as the tube forms (their parent panels rotate 90° about vertical axes) — the top-flap hinges are horizontal in panel-local space but point in different world directions after tube formation. The coherent motion of the top flaps in F03/F04/F09 while attached to already-vertical panels is STRONG evidence of hierarchical transform inheritance (see §12).

---

# 6. Forward Animation (folding)

The Forward button is never visible, so I cannot segment by click. Instead I reconstruct the **folding phases** visible in the frames (OBSERVED poses; phase boundaries INFERRED). Treat "Forward step = one click advances one phase" as POSSIBLE IMPLEMENTATION.

**FORWARD PHASE A — Tube formation (flat blank → open tube)**
- Evidence: F12/F13 (near-flat / edge-on blank) → F14 (formed tube with open top).
- Moving: P1, P2, P3 (+P4) rotating about vertical hinges H0–H3.
- Stationary: P0 (root, front panel) — STRONGLY INFERRED; one panel must be the anchor and the front is the natural choice and appears stable across frames.
- Sequence: cannot determine simultaneous vs staggered from stills — UNKNOWN. Most carton visualizers fold the strip simultaneously (all four corners tween 0→90° together). POSSIBLE IMPLEMENTATION: parallel tweens, equal duration.
- Angles: 0° → ±90° per corner (signs alternate to wrap the same direction).
- End state: open rectangular tube, top and bottom flaps still coplanar-extended.

**FORWARD PHASE B — Bottom lock closure**
- Not visible in any frame (bottom off-camera). UNKNOWN whether it is its own step, merged with Phase A, or skipped/pre-assembled in the preview. Many previews show the box already bottom-locked. Confidence: Low for any specific claim.

**FORWARD PHASE C — Top dust flaps in**
- Evidence: F09/F14 (dust flaps splayed out) → F15 (flaps no longer visible, lid coming down).
- Moving: P8, P9 about H7, H8: 0° → ~90° inward (toward each other over the opening).
- Also P7 (front flap) folding in — partially occluded; Medium confidence.
- Sequence: dust flaps appear symmetric; likely simultaneous. P7 likely same phase or slightly before the lid.

**FORWARD PHASE D — Lid close + tuck**
- Evidence: F03→F05, F14→F16, F08/F15 (lid horizontal, tongue tucked).
- Moving: P5 about H4: 0° → ~90° (down over the opening); P6 about H5: 0° → ~90–100° (tongue slips behind front panel).
- Sequence (STRONGLY INFERRED from geometry, standard in these visualizers): lid rotates most of the way, tongue rotation overlaps/lags slightly so the tongue clears the front panel edge and ends inside. Whether the video shows lag: UNKNOWN (frame density too low).
- End state: closed carton (F05/F06/F16).

**Durations:** UNKNOWN in absolute terms. If forced to estimate from typical web visualizers of this class: 400–800 ms per phase with ease-in-out — label: **POSSIBLE IMPLEMENTATION, Low confidence.**

---

# 7. Backward Animation (unfolding)

Observed unfolding poses: F02→F04 (lid+tongue open, dust flaps out), F10→F13 (tube collapsing toward flat).

**BACKWARD PHASE D′ — Lid open:** P6 tongue rotates out first (or concurrently), then P5 lid rises to ~0°. F03/F04 show lid up with tongue extended. Whether tongue leads lid: geometrically it must clear the front panel before the lid fully opens; STRONGLY INFERRED order = tongue then lid, i.e., exact reverse of Phase D.

**BACKWARD PHASE C′ — Dust flaps out:** P8/P9 rotate back to flat (visible splayed in F09/F14). Appears symmetric/simultaneous.

**BACKWARD PHASE A′ — Tube collapse:** F10–F13 show the body going edge-on/flattening — side panels rotating back to 0° about the vertical hinges. F12's irregular flat-ish silhouette with protruding flaps is the money frame for this phase: the blank is nearly flat but flaps at top/bottom stick out, exactly what a 4-panel strip with attached flaps looks like when unfolded and viewed at an angle.

**Is Backward literally `reverse(Forward)`?

---

<!-- PART 2/5 — Sections 7 (continued)–14 -->

# 7. Backward Animation (continued)

**Is Backward literally `reverse(Forward)`?**

**Verdict: STRONGLY INFERRED — No, it is not a strict time-reversal. Confidence: 0.70.**

Evidence from the frame sequence:

1. **OBSERVED (conf 0.9):** The frame set contains two distinct motion regimes. Frames 2–7 show the box *closing* (lid flaps descending from an open flared state → sealed tuck-end carton). Frames 8–16 show the box *re-opening* and then transitioning toward a partially-unfolded / flattened state (frames 12–13 show the body panels visibly splayed and ghosted, i.e., the tube seam is being released, not just the lid).
2. **STRONGLY INFERRED (conf 0.75):** A strict `reverse(Forward)` would terminate at a flat dieline with every hinge at 0°. Instead, the backward pass appears to terminate at an *intermediate* state: body tube still assembled, lid flaps open, dust flaps partially out — i.e., the "open carton" state, not the "flat blank" state. This implies the backward animation is a **separately authored sequence** (or a partial reversal with a clamped lower bound), not `t → 1−t` of the forward timeline.
3. **POSSIBLE IMPLEMENTATION (conf 0.5):** The system likely stores a single parameter `foldProgress ∈ [0,1]` per hinge group, and "backward" is implemented as tweening those parameters toward a *target preset* (`OPEN_STATE`) rather than toward `0`. This explains why the backward endpoint ≠ flat blank.

**BACKWARD STEP breakdown (observed order, frames 8→16):**

| Step | Frames | Action | Classification |
|---|---|---|---|
| B1 | 8–9 | Tuck flap extracts from front panel slot; lid begins rotating up about the lid hinge | OBSERVED (0.85) |
| B2 | 9–10 | Lid opens past 90°; dust flaps (side flaps) rotate outward symmetrically | OBSERVED (0.85) |
| B3 | 10–11 | Lid reaches fully-open (~180° relative to back panel); camera orbits to side view | OBSERVED (0.8) |
| B4 | 12–13 | **Body tube loosens** — panels splay, ghosting/motion-blur or transparency artifact visible; glue-flap seam appears to release | OBSERVED (0.7) — the splaying is clear; *why* it occurs is inferred |
| B5 | 14–16 | Re-stabilization into open-carton state; lid returns to a neutral raised position; loop point | STRONGLY INFERRED (0.65) |

**BACKWARD PHASE grouping:**

- **Phase B-α (Unseal):** B1 — tuck extraction. Short, fast.
- **Phase B-β (Lid deployment):** B2–B3 — compound hinge motion (lid hinge + two dust-flap hinges, near-simultaneous).
- **Phase B-γ (Tube relaxation):** B4 — the anomaly phase; either an authored "breathing"/reset flourish or a solver artifact (see §16).
- **Phase B-δ (Settle):** B5 — damped return to open-state equilibrium, consistent with an ease-out or spring-settle.

**Key asymmetry vs. Forward:** Forward ends *sealed*; Backward ends *open-but-assembled*. The seam release in B4 has no counterpart in Forward frames 2–7, reinforcing that Backward is separately parameterized.

---

# 8. Fold States

Named discrete states identifiable across the 16 frames:

| State | Description | Frame evidence | Classification |
|---|---|---|---|
| STATE_0 | Flat / near-flat blank (dieline pose, all hinges ≈ 0°) | Not directly shown in this clip; implied start of full cycle | STRONGLY INFERRED (0.6) |
| STATE_1 | Open tube, lid flared fully open (lid ≈ 180°, dust flaps out) | Frame 2 (top flaps splayed) | OBSERVED (0.85) |
| STATE_2 | Dust flaps folded in, lid mid-close (~90–120°) | Frame 3 | OBSERVED (0.8) |
| STATE_3 | Lid nearly closed, tuck flap entering slot | Frame 4 | OBSERVED (0.8) |
| STATE_4 | **Sealed carton** — all lid hinges at closed angles; canonical product pose | Frames 5–7 | OBSERVED (0.95) |
| STATE_5 | Unsealing — tuck flap extracted, lid lifting | Frames 8–9 | OBSERVED (0.85) |
| STATE_6 | Fully open lid (~180°), dust flaps extended | Frames 10–11 | OBSERVED (0.8) |
| STATE_7 | Tube-relaxed / splayed transitional state | Frames 12–13 | OBSERVED (0.7) |
| STATE_8 | Open-carton rest state (loop endpoint ≈ STATE_1 variant) | Frames 14–16 | STRONGLY INFERRED (0.7) |

Note: STATE_6 ≈ STATE_1 geometrically, but they are reached via different paths (closing-peak vs. opening-peak), so they are kept distinct for timing purposes.

---

# 9. Fold Angle Matrix

Panel/hinge angle per state (degrees; 0° = coplanar with parent panel; positive = folding inward toward box interior). Values are **estimated from silhouettes** — treat as ±15° unless marked OBSERVED-precise.

| Hinge / Panel | S0 | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|---|
| H1: Front panel ↔ body | 0 | 90 | 90 | 90 | 90 | 90 | 90 | ~70–85 (splayed) | 90 |
| H2: Back panel ↔ body | 0 | 90 | 90 | 90 | 90 | 90 | 90 | ~70–85 | 90 |
| H3: Side panels ↔ body (×2) | 0 | 90 | 90 | 90 | 90 | 90 | 90 | ~75–90 | 90 |
| H4: Glue flap ↔ side panel | 0 | 90 (seamed) | 90 | 90 | 90 | 90 | 90 | ~0–45 (released?) | 90 |
| H5: Lid ↔ back panel (top) | 0 | ~180 | ~120 | ~20 | ~0–5 (closed) | ~45 | ~180 | ~160–180 | ~150–170 |
| H6: Tuck flap ↔ lid | 0 | ~170 | ~150 | ~140 (inserting) | ~180 (tucked) | ~120 | ~170 | ~170 | ~160 |
| H7: Dust flap L ↔ side L | 0 | ~10 (out) | ~90 (in) | ~90 | ~90 | ~60 | ~10 | ~10 | ~20 |
| H8: Dust flap R ↔ side R | 0 | ~10 | ~90 | ~90 | ~90 | ~60 | ~10 | ~10 | ~20 |
| H9+: Bottom flap cluster | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

Bottom closure is never visible in any frame (camera stays above the horizon line of the box base) — **UNKNOWN, not invented**. Classification: angles in S1–S6 are STRONGLY INFERRED from silhouette geometry (conf 0.6–0.75); S7 values are low-confidence (0.4) due to motion blur/ghosting.

---

# 10. Animation Timing Matrix

Absolute timestamps are not recoverable from stills; timing is expressed in **frame-index units** (Δf = frames between observed events). Real durations: **UNKNOWN** (recording fps and capture cadence not derivable).

| Segment | Transition | Δf (observed) | Relative duration | Delay before start | Classification |
|---|---|---|---|---|---|
| T1 | S1 → S2 (dust flaps in, lid to ~120°) | ~1f | short | 0 | OBSERVED (0.7) |
| T2 | S2 → S3 (lid to near-close) | ~1f | short | ~0 (overlapping) | OBSERVED (0.7) |
| T3 | S3 → S4 (tuck insertion, seal) | ~1f | short | small stagger after lid | STRONGLY INFERRED (0.65) |
| T4 | S4 hold (sealed pose + camera orbit) | ~3f (frames 5–7) | **longest hold** | — | OBSERVED (0.85) |
| T5 | S4 → S5 (unseal) | ~1.5f | medium | after hold | OBSERVED (0.7) |
| T6 | S5 → S6 (lid to full open) | ~2f | medium | dust flaps lead slightly | STRONGLY INFERRED (0.6) |
| T7 | S6 → S7 (tube relax/splay) | ~1.5f | medium | — | OBSERVED (0.6) |
| T8 | S7 → S8 (settle) | ~2.5f (frames 14–16) | long, damped | — | STRONGLY INFERRED (0.6) |

**Staggering:** OBSERVED (0.7) — dust flaps and lid do not move in lockstep; there is a per-hinge delay offset (lid leads on close, dust flaps lead on open). This is characteristic of either (a) per-hinge `delay` parameters in a tween library, or (b) a sequenced keyframe track per hinge group.

**Absolute ms values: UNKNOWN.** If the capture is 30–60 fps screen recording, total cycle ≈ 0.5–1.5 s per phase, total loop plausibly 4–8 s — flagged as low-confidence estimate (0.3).

---

# 11. Motion Curves (Estimated Easing)

| Phase | Estimated easing | Evidence | Classification / Conf |
|---|---|---|---|
| Lid close (T1–T3) | ease-in-out (cubic or sine) | Smooth deceleration into sealed pose; no visible snap | STRONGLY INFERRED (0.6) |
| Tuck insertion (T3) | ease-out with possible slight overshoot | Flap appears to "settle" into slot | POSSIBLE (0.45) |
| Unseal (T5) | ease-in (slow extraction, then accelerate) | Tuck flap moves slowly out of slot initially | POSSIBLE (0.45) |
| Lid open (T6) | ease-out | Fast initial lift, decelerates into 180° stop | STRONGLY INFERRED (0.55) |
| Settle (T8) | **spring / damped overshoot** | Frames 14→16 show lid position oscillating slightly downward then stabilizing — characteristic of a spring solver or `elastic`-family easing with low amplitude | STRONGLY INFERRED (0.6) |
| Camera orbit | linear or very gentle ease | Uniform angular progression across frames 5–11 | STRONGLY INFERRED (0.6) |

**POSSIBLE IMPLEMENTATION (0.5):** GSAP (`gsap.to(..., {ease: "power2.inOut"})`) or three.js `AnimationMixer` with `KeyframeTrack` + default smooth interpolation. The settle behavior in T8 suggests either a physics-lite spring (e.g., react-spring) or hand-authored overshoot keyframes.

---

# 12. Transform Hierarchy (Most Likely Scene Graph)

STRONGLY INFERRED (0.7) — derived from hinge kinematics; nested rotations require parent-child chains so child flaps inherit parent motion:

```
Scene
└── BoxRoot (Group)                    ← global orbit? NO — orbit is camera (§15)
    ├── BottomCluster (Group)          ← never animated visibly; UNKNOWN structure
    │   └── [bottom flaps ×4?]
    ├── BodyFront (Group)              ← H1 pivot at bottom-front edge
    ├── BodyBack (Group)               ← H2 pivot
    │   └── LidAssembly (Group)        ← H5 pivot at top-back edge
    │       ├── LidPanel (Mesh)
    │       └── TuckFlap (Group/Mesh)  ← H6 pivot at lid front edge
    ├── BodyLeft (Group)               ← H3 pivot
    │   └── DustFlapL (Mesh)           ← H7 pivot at top-left edge
    ├── BodyRight (Group)              ← H3 pivot
    │   └── DustFlapR (Mesh)           ← H8 pivot at top-right edge
    └── GlueFlap (Mesh)                ← H4; possibly merged into BodyLeft/Right
```

Rationale:
- **OBSERVED (0.85):** Tuck flap follows the lid rigidly during lid rotation → tuck is a *child* of lid, not a sibling. This is the strongest hierarchical signal in the footage.
- **STRONGLY INFERRED (0.7):** Dust flaps are children of their respective side panels (they stay attached to panel tops during the S7 splay).
- **POSSIBLE (0.45):** The four body panels may instead be a single skinned/merged mesh with bone-like pivots rather than discrete Groups — the S7 "splay with ghosting" could indicate a vertex-level deformation pass rather than rigid Group rotations. Both architectures are consistent with the footage; discrete-Group is the more common packaging-preview pattern.

---

# 13. Pivot Mathematics

**Hinge model (STRONGLY INFERRED, 0.75):** Each fold is a rotation about a crease-line axis located at the panel edge — the standard "rotate-about-arbitrary-axis-through-point" transform:

For hinge *i* with crease axis **a** (unit vector along the crease, in parent space) passing through crease point **p**, and fold angle θ(t):

```
M_hinge(t) = T(p) · R_axis(a, θ(t)) · T(−p)
```

World transform of a panel at depth *k* in the hierarchy:

```
M_world(panel_k) = M_root · Π_{i=1..k} [ T(p_i) · R(a_i, θ_i(t)) · T(−p_i) ]
```

**Axis assignments (assuming box local axes: X = width, Y = height, Z = depth):**

| Hinge | Pivot point p | Axis a | Angle sign convention |
|---|---|---|---|
| H1 (front) | (0, 0, +D/2) bottom edge | X | +θ folds inward (−Z normal → +Y) |
| H2 (back) | (0, 0, −D/2) | X | −θ (mirrored) |
| H3 (sides) | (±W/2, 0, 0) | Z | ±θ mirrored |
| H5 (lid) | (0, H, −D/2) top-back edge | X | θ: 0 = closed flat, π = open |
| H6 (tuck) | (0, H_lid, lid front edge) in lid space | X (lid-local) | ~π when tucked |
| H7/H8 (dust) | (±W/2, H, 0) | Z | 0 = out, π/2 = folded in |

**Key implementation detail (POSSIBLE, 0.5):** In three.js this is typically done by *offsetting geometry* so the crease is at the child's local origin (`geometry.translate(−p)`), making the hinge a plain `group.rotation.x = θ`. This avoids explicit T·R·T(−p) composition and matches the hierarchy in §12.

**Closed-lid constraint:** at S4, lid plane must be coplanar with the box top opening: θ_H5 = 0 AND θ_H6 = π (tuck folded under, inside the tube). The tuck flap's tip must clear the front panel inner face by the board thickness t — a geometric constraint the animation satisfies visibly (no clip-through in frame 5, conf 0.7).

---

# 14. Geometry Architecture

| Question | Assessment | Classification / Conf |
|---|---|---|
| Thin boxes (extruded) vs. zero-thickness planes? | Edges at fold boundaries show no visible thickness ridge; silhouettes at creases are razor-sharp; no z-fighting shimmer visible at closed seams | **Planes (or near-zero extrusion)** — STRONGLY INFERRED (0.65) |
| Visible board thickness? | None resolvable at this zoom; top rim of open box (frame 10) shows a single-line edge, not a double wall | OBSERVED-negative (0.6): thickness not modeled or < 1 px |
| Double-sided rendering? | Interior surfaces visible in open states (frames 2, 10) render same white as exterior → `side: THREE.DoubleSide` | STRONGLY INFERRED (0.75) |
| Material | Flat white/light-gray, soft diffuse shading, no visible texture/artwork → `MeshStandardMaterial` or `MeshLambertMaterial`, white, with ambient + key light | OBSERVED (0.8) |
| Ghosting in frames 12–13 | Semi-transparent overlapping panel silhouettes → either (a) motion-blur from screen capture, (b) opacity tween during transition, or (c) depth-sorting artifact of transparent DoubleSide planes | POSSIBLE (0.4 each); capture motion-blur most likely |
| Mesh construction | Each panel likely a `PlaneGeometry` (or `ShapeGeometry` from the dieline outline for flaps with non-rectangular profiles — dust flaps and tuck flap have shaped outlines visible in frames 3, 9) | STRONGLY INFERRED (0.7) |
| UV/artwork pipeline | Dieline-visible 2D editor

---

<!-- PART 3/5 — Sections 14 (completion), 15–16 (gap fill) -->

## 14 (completion) — UV/artwork pipeline (row completion)

**STRONGLY INFERRED (high):** The 2D dieline editor's artwork layer is rasterized to a single texture atlas whose UV islands correspond 1:1 to the dieline's panel polygons, so each panel mesh in the 3D scene samples its artwork by mapping its flat-layout vertex coordinates directly into UV space — meaning any edit in the 2D canvas re-renders onto the folded 3D panels without re-unwrapping, and fold creases fall exactly on UV-island boundaries. (In these frames the carton is blank white, so only the mapping architecture, not live artwork, is evidenced.)

## 15. Camera Analysis

- **OBSERVED (high):** The carton's screen-space position and orientation change continuously across frames while the 2D dieline canvas, modal frame, and UI chrome remain pixel-static — motion is confined to the WebGL viewport inside the "3D Preview" modal.
- **OBSERVED (high):** A mouse cursor is visible inside the preview viewport in multiple frames (lower-center, right-of-model), and the largest orientation swings coincide with its presence — consistent with user drag-to-orbit (OrbitControls-style) rather than a fixed turntable.
- **STRONGLY INFERRED (medium-high):** Orbit direction is predominantly azimuthal (yaw around the vertical axis): the model cycles through front → right-side → back → left-side views while the horizon/vertical edges stay vertical, i.e., little to no polar (elevation) change. No continuous auto-rotation signature — angular velocity is uneven (fast swings, then dwell), matching manual drag with inertia damping.
- **OBSERVED (medium):** Apparent zoom changes: the model grows to fill the viewport and clips at the top edge in the splayed/transition frames, then shrinks back — consistent with scroll-wheel dolly or a scripted "zoom-in during fold" beat. **POSSIBLE (low-medium):** a brief scripted camera push-in synchronized with the fold/unfold transition, since the scale change is smooth and symmetric around it.
- **STRONGLY INFERRED (high):** Folding animation (panel hinge rotations) and camera orbit are independent and concurrent: crease angles change while the viewpoint also moves. To avoid mistaking orbit for panel motion, track features against the static modal background: a rigid-body yaw moves all panel edges coherently (parallel edges stay parallel, shared vertices stay coincident), whereas true panel motion breaks edge collinearity at crease lines and changes inter-panel angles. In these frames, body-panel quads keep constant mutual angles during viewpoint swings — confirming camera motion — while dust flaps/lid change angle relative to the body — confirming genuine hinge animation.

## 16. Collision / Overlap Analysis

- **OBSERVED (high):** Transient interpenetration/ghosting: in the transition frames the model dissolves into a splayed, semi-transparent stack of overlapping panel silhouettes (multiple lid/flap positions visible simultaneously, low-opacity layered rendering). This reads as either (a) a crossfade between discrete fold states or (b) motion-blur-style accumulation of intermediate poses — not physically simulated geometry.
- **STRONGLY INFERRED (high):** No runtime collision detection. The choreography is pre-baked/keyframed: dust flaps, lid, and tuck flap follow fixed hinge-angle curves where passing geometry simply clips through or renders with transparency rather than resolving contact. Real-time rigid-body collision would show jitter, restitution, or blocked motion; none is visible — transitions are smooth and repeatable.
- **OBSERVED (medium-high):** Ordering logic at the top closure: the two side dust flaps fold inward first (seen as the small triangular/trapezoid flaps rotating to horizontal), then the rear/lid panel closes over them, and the front tuck flap inserts last — the standard tuck-top sequence. The splayed frames show the reverse (lid opens, dust flaps spring outward after), confirming a fixed dependency chain: `dustFlaps → lid → tuck` on close, inverted on open.
- **POSSIBLE (medium):** The ghosting frames double as a state-machine transition effect masking a non-continuous jump between "assembled" and "exploded/splayed" rig poses — i.e., the fold is not one continuous hinge interpolation but discrete keyframe states blended via opacity, which would explain why mid-transition panels appear to occupy mutually impossible (overlapping) positions without collision response.
- **STRONGLY INFERRED (medium):** For a lock-bottom carton, the bottom is never shown unfolding in these frames — the camera stays above the base — so bottom-lock choreography (diagonal crease collapse) cannot be verified from this clip; treat bottom-fold collision behavior as unobserved.

---

<!-- PART 4/5 — Sections 17–22 (response truncated) -->

# 17. Original Implementation Hypothesis — Ranked Methods

| Rank | Method | Probability | Reasoning |
|---|---|---|---|
| 1 | **Three.js rigid-panel hinge hierarchy** (Object3D pivot tree, per-crease rotation tweens) | ~55% | OBSERVED: panels remain perfectly rigid; all motion is pure rotation about crease lines; no vertex-level deformation visible. This is the canonical approach used by packaging-preview SaaS (Esko Studio, Packhelp, Pacdora-style). WebGL shading artifacts (flat facets, hard crease edges) match `MeshStandardMaterial`/`MeshLambertMaterial` with flat normals. |
| 2 | **Three.js skinned mesh / bone-driven folding** (skeleton per crease) | ~15% | POSSIBLE IMPLEMENTATION: would produce identical visuals for rigid panels. Less likely because skinning adds complexity with zero benefit when panels never bend. |
| 3 | **Pre-baked keyframe animation** (authored in Blender, exported glTF with animation clips) | ~15% | POSSIBLE: the fold sequence looks fixed and repeatable (same choreography each loop). But the tool is parametric (dieline-driven, 183 mm dimension shown, "Apply Mirror" suggests live regeneration), which argues against baked clips per SKU. |
| 4 | **Custom parametric engine (non-Three.js: Babylon.js, PlayCanvas, raw WebGL)** | ~10% | UNKNOWN: rendering style is generic enough that engine cannot be fingerprinted from pixels alone. Three.js assumed only by market prevalence. |
| 5 | **Server-side render / video playback** | ~5% | Ruled low: OBSERVED free-orbit camera control (frames show user-driven rotation to side/top angles) implies real-time client rendering, not a prerendered clip. |
| 6 | **Physics simulation (soft-body / origami solver)** | ~5% | Ruled low: no overshoot, no inter-panel collision response, no material flex. Motion is kinematic, not dynamic. |

**Confidence:** High that it is *some* real-time WebGL rigid-hinge system; Medium that it is specifically Three.js; Low-Medium on tween library identity.

---

# 18. Three.js Reconstruction — Implementation Architecture

## 18.1 Scene Setup (STRONGLY INFERRED)

```text
Scene
├── PerspectiveCamera (fov ≈ 35–45°, matches low-distortion product-view look)
├── OrbitControls (damped; OBSERVED smooth drag-orbit in later frames)
├── Lighting
│   ├── HemisphereLight (sky #ffffff / ground #e0e0e0, ~0.6)   ← soft shadowless base
│   └── DirectionalLight (~0.8, from upper-front-right)         ← OBSERVED: consistent
│       castShadow = false                                       ← no ground shadows seen
├── Environment: none visible (no reflections → plain white carton, roughness ≈ 0.9)
└── CartonRoot (Group) — origin at carton base center
```

Background: solid near-white (#f5f5f5-ish), matching the modal's light gray — either `scene.background` or a large backdrop plane. No grid, no floor, no contact shadow (OBSERVED across all frames).

## 18.2 Geometry — Panel Construction (STRONGLY INFERRED)

Each dieline face becomes one rigid mesh:

```text
Panel geometry = THREE.Shape(dieline outline in 2D mm space)
              → THREE.ShapeGeometry(shape)          // flat, zero thickness
              → or ExtrudeGeometry(depth ≈ 0.3–0.5mm) // POSSIBLE: edges look paper-thin
UVs: planar-mapped 1:1 from dieline 2D coordinates (so the 2D artwork texture
     lands exactly as printed — standard packaging-preview technique)
Material: MeshStandardMaterial({ map: artworkCanvas, side: DoubleSide,
                                 roughness: 0.9, metalness: 0 })
```

DoubleSide is STRONGLY INFERRED: interior faces are visible during mid-fold frames (frames 3, 9–12) and render as near-white rather than being culled.

## 18.3 Crease / Pivot Hierarchy (STRONGLY INFERRED)

The core structure is a **tree of pivot Object3Ds**, one per crease, positioned exactly on the crease line:

```text
CartonRoot
└── Pivot[glue-flap ↔ back panel]          (crease C0, vertical)
    └── Panel_Back
        └── Pivot[back ↔ side L]           (C1)
        │   └── Panel_SideL
        │       └── Pivot[side L ↔ front]  (C2)
        │           └── Panel_Front
        │               └── Pivot[front ↔ side R] (C3)
        │                   └── Panel_SideR
        ├── Pivot[back ↔ top dust flap]    (C4)
        ├── Pivot[back ↔ bottom flap]      (C5)
        └── ... top tuck flap chain:
            Pivot[front ↔ top lid]         (C6)
                └── Panel_TopLid
                    └── Pivot[lid ↔ tuck flap]   (C7)
                        └── Panel_TuckFlap
```

**Pivot placement rule:** for a crease between panel A (parent) and panel B (child), the child pivot's origin sits on the crease segment; the child panel's geometry is translated so its local origin coincides with that pivot. Folding = setting `pivot.rotation` about the crease axis (local X or Z after alignment).

**OBSERVED evidence for tree (not flat) structure:** in frames 3–4 the top lid and tuck flap move *together* as the lid closes, then the tuck flap rotates *relative* to the lid — nested relative motion is the signature of parent→child pivots.

## 18.4 Fold Angle Table (STRONGLY INFERRED from this carton type)

For a tuck-top / lock-bottom straight-tuck carton:

| Crease | Flat angle | Folded angle | Direction |
|---|---|---|---|
| 4 vertical body creases | 0° | ±90° | alternating sign (valley/mountain) |
| Top lid hinge | 0° | ~−90° to −100° | lid over front |
| Tuck flap hinge | 0° | ~−170° relative to lid | flap reverses into box |
| Dust flaps (2) | 0° | ±90° | inward |
| Bottom lock flaps (4) | 0° | ±90° (+ tab/slot interlock) | inward |

## 18.5 Animation / Tweening (STRONGLY INFERRED)

OBSERVED: multi-phase choreography with overlapping phases — body tube forms first, then top assembly, then bottom; some creases ease while others are still at 0. This implies a **sequenced tween timeline**, not simultaneous rotation:

```text
Phase 0: flat dieline (all θ = 0)
Phase 1: body wrap      — C0..C3 → ±90°   (t ≈ 0.0–1.2s, easeInOutCubic)
Phase 2: bottom flaps   — C5 group → 90°  (t ≈ 0.8–1.6s, staggered 0.1s)
Phase 3: dust flaps     — C4 pair → 90°   (t ≈ 1.4–1.9s)
Phase 4: lid close      — C6 → −95°       (t ≈ 1.8–2.4s)
Phase 5: tuck insert    — C7 → −170°      (t ≈ 2.3–2.8s)
```

Implementation options (POSSIBLE IMPLEMENTATION): GSAP timeline, TWEEN.js chained tweens, or a hand-rolled `update(dt)` integrator driving `θ(t) = lerp(θ0, θ1, ease(t))`. Cannot be distinguished from the recording. Loop/replay observed (sequence repeats) → timeline restarts on completion or on user toggle.

## 18.6 State Management (STRONGLY INFERRED)

Minimal state machine: `{ phase: 'flat' | 'folding' | 'folded' | 'unfolding', t: number }`. The 2D editor (left, with 183 mm dimension and dieline visible behind modal) and 3D preview share the dieline definition; "Apply Mirror" button implies a **derived-geometry pipeline**: dieline edit → re-tessellate panels → rebuild pivot tree → reset to flat. The 3D view is a pure function of (dieline, foldState).

## 18.7 Rendering Details (OBSERVED / INFERRED)

- No anti-aliasing artifacts suggesting post-processing; likely default `antialias: true` WebGLRenderer.
- No shadows, no AO → OBSERVED flat, bright look; ambient-heavy lighting.
- Slight z-fighting / coplanar flicker risk at tuck-flap overlap in frame 9 — mitigated typically with `polygonOffset` or 0.1–0.5 mm panel offsets along normals (POSSIBLE IMPLEMENTATION).
- Modal "3D Preview" is a separate canvas overlaying the 2D editor — separate renderer instance or portal-mounted canvas (STRONGLY INFERRED from UI layering).

---

# 19. TypeScript Data Structures

Derived from the observed structure (one crease graph, rigid panels, sequenced folds):

```typescript
// ---------- Geometry layer ----------
interface Vec2 { x: number; y: number }            // mm, dieline space

interface Panel {
  id: string;                                       // "front", "sideL", "topLid", "tuckFlap"...
  outline: Vec2[];                                  // closed polygon, dieline 2D coords
  creaseIds: string[];                              // creases on this panel's edges
  thickness?: number;                               // 0 | 0.3–0.5 mm
  uvMapping: 'dieline-planar';                      // OBSERVED: 1:1 artwork mapping
}

type CreaseKind = 'cut' | 'crease' | 'perforation'; // dieline line semantics
type FoldDirection = 'mountain' | 'valley';

interface Hinge {                                   // one crease = one hinge
  id: string;
  parentPanelId: string;
  childPanelId: string;
  axis: { p0: Vec2; p1: Vec2 };                     // crease segment, dieline space
  kind: CreaseKind;
  direction: FoldDirection;
  flatAngle: number;                                // 0 (flat sheet)
  targetAngle: number;                              // ±90°, −170°, etc. (radians in code)
  limits?: { min: number; max: number };            // clamp for interactive drag
}

// ---------- Animation layer ----------
interface FoldAction {
  hingeId: string;
  fromAngle: number;
  toAngle: number;
  startTime: number;                                // seconds, timeline-relative
  duration: number;
  easing: 'linear' | 'easeInOutCubic' | string;     // OBSERVED smooth easing, exact curve UNKNOWN
}

interface FoldSequence {
  actions: FoldAction[];                            // phases 0–5 from §18.5
  totalDuration: number;
  loop: boolean;                                    // OBSERVED: sequence replays
}

// ---------- Runtime state ----------
interface FoldState {
  hingeAngles: Record<string, number>;              // hingeId → current θ
  phase: 'flat' | 'folding' | 'folded' | 'unfolding';
  clock: number;                                    // timeline position, seconds
  dirty: boolean;                                   // dieline edited → rebuild
}

// ---------- Top-level model ----------
interface DielineModel {
  panels: Panel[];
  hinges: Hinge[];                                  // must form a tree (no cycles) for
                                                    // rigid hierarchical folding
  sequence: FoldSequence;
  dimensions: { width: number; depth: number; height: number }; // 183 mm height OBSERVED
}
```

**Constraint note (STRONGLY INFERRED):** the hinge graph must be a spanning tree of the panel adjacency graph. Any cycle (e.g., lock-bottom tabs that also connect to neighbors) is handled by *breaking* the cycle — modeling the interlock as a constraint or ignoring it — because a rigid Object3D tree cannot satisfy closed loops. The observed bottom flaps likely cheat the interlock (POSSIBLE IMPLEMENTATION).

---

# 20. Forward / Backward Controller

```typescript
class FoldController {
  private state: FoldState;
  private pivots: Map<string, THREE.Object3D>;      // hingeId → pivot node

  constructor(private model: DielineModel) {
    this.state = {
      hingeAngles: Object.fromEntries(model.hinges.map(h => [h.id, h.flatAngle])),
      phase: 'flat', clock: 0, dirty: false,
    };
  }

  /** Advance timeline; call every RAF with delta seconds. */
  update(dt: number, direction: 1 | -1 = 1): void {
    const seq = this.model.sequence;
    this.state.clock = clamp(this.state.clock + dt * direction, 0, seq.totalDuration);

    for (const action of seq.actions) {
      const local = (this.state.clock - action.startTime) / action.duration;
      const k = ease(action.easing, clamp(local, 0, 1));
      const θ = lerp(action.fromAngle, action.toAngle, k);
      this.setHingeAngle(action.hingeId, θ);
    }

    if (this.state.clock >= seq.totalDuration) this.state.phase = 'folded';
    else if (this.state.clock <= 0)                this.state.phase = 'flat';
    else this.state.phase = direction > 0 ? 'folding' : 'unfolding';

    if (seq.loop && this.state.phase === 'folded') this.state.clock = 0; // OBSERVED replay
  }

  /** Forward = play; Backward = reverse play. Scrub = set clock directly. */
  playForward():  void { /* direction = +1 in RAF loop */ }
  playBackward(): void { /* direction = -1 */ }
  scrub(t: number): void { this.state.clock = clamp(t, 0, this.model.sequence.totalDuration);
                           this.update(0); }
  fold():   void { this.scrub(this.model.sequence.totalDuration); }  // snap to folded
  unfold(): void { this.scrub(0); }                                  // snap to flat

  private setHingeAngle(id: string, θ: number): void {
    this.state.hingeAngles[id] = θ;
    const pivot = this.pivots.get(id);
    if (pivot) pivot.rotation.set(θ /* about aligned crease axis */, 0, 0);
  }
}
```

**Key property (STRONGLY INFERRED):** forward and backward are the *same* evaluator with sign-flipped time — because all motion is parametric in `clock`, reversal is free and exact. No separate "unfold choreography" needed. The observed smooth reverse-to-flat in later frames is consistent with this.

---

# 21. Generalized Dieline Folding Engine

To support arbitrary packaging (not just this tuck-top carton), generalize along five axes:

**21.1 Graph construction.** Parse dieline → planar straight-line graph. Faces = panels (bounded regions enclosed by cut lines); shared edges between faces = creases. Build adjacency graph G = (panels, creases).

**21.2 Spanning-tree extraction.** Compute a spanning tree of G rooted at a user-selected (or heuristically largest) "base panel." Cycle edges (lock tabs, glue flaps that touch two panels) become **attachment constraints**, not hinges. This is the single most important generalization — real dielines are never trees.

**21.3 Automatic angle solving.** Target fold angles cannot always be inferred (see §23), but defaults are computable:
- Crease between two panels that are coplanar-adjacent in the flat layout → ±90° if the fold is a box wall; sign from mountain/valley line style.
- Enclosure detection: if folding all 90° creases leaves the solid open along an edge adjacent to a flap, that flap folds to close it (recursive, depth-limited).
- For standard carton families (tuck-top, crash-lock, sleeve, tray), template-based angle tables like §18.4 cover ~90% of commercial packaging.

**21.4 Collision & feasibility.** For arbitrary dielines, naive simultaneous folding causes panel interpenetration. Required: per-phase ordering (topological sort of the hinge tree, leaves-last for closing flaps) plus optional swept-volume checks. The observed video sidesteps this with a hand-tuned phase order (STRONGLY INFERRED).

**21.5 Pluggable choreography.** Replace the fixed FoldSequence with a generator:

```typescript
interface FoldPlanner {
  plan(model: DielineModel): FoldSequence;   // topology → ordered actions
}
// Implementations: TemplatePlanner (known carton families),
//                  LayeredPlanner (fold by tree depth),
//                  ManualPlanner (user-authored timeline)
```

**21.6 Non-tree closures.** Lock bottoms, crash locks, and glue seams need a post-fold **constraint pass**: after tree folding, snap flagged tab edges to slot edges (position-only correction, small enough to be invisible — which is exactly what the observed bottom flaps appear to do).

---

# 22. What Can Be Automatically Extracted

From PDF / SVG / DXF / AI dieline files:

| Data | Extractable? | Method |
|---|---|---|
| Panel outlines (cut contours) | ✅ Yes | Path parsing; closed-region flood fill / planar face extraction |
| Crease lines & their endpoints | ✅ Yes | Line-style classification: dashed/solid, spot-color names ("Crease", "Cut", ARDF/CF2 standards in DXF layers) |
| Cut vs. crease vs. perforation | ✅ Mostly | CF2 layer names (DXF), spot colors / stroke dash patterns (PDF/AI/SVG) |
| Dimensions (mm scale) | ✅ Yes | Artboard size + declared units; dimension annotations (the 183 mm label type) |
| Panel adjacency graph | ✅ Yes | Shared-edge detection on extracted segments (geometric, tolerance ~0.1 mm) |
| Crease axis lines (hinge geometry) | ✅ Yes | Directly the crease segments |
| Artwork placement / UV mapping | ✅ Yes | Artwork layer coordinates = dieline coordinates (same file space) |
| Bleed / safe areas | ✅ Yes | Additional spot-color layers when present |
| Mountain vs. valley direction | ⚠️ Sometimes | Only if encoded (

---

<!-- PART 5/5 — Sections 22 (completion)–26 -->

## 22 (completion) — What Can Be Automatically Extracted (table, final rows)

| Property | Extractable? | Method / Encoding |
|---|---|---|
| Mountain vs. valley direction | **Yes** | Crease-line style in the dieline (solid vs. dashed/dash-dot per CFF2/DDES conventions) maps directly to fold sign: `sign = +1` (mountain) / `−1` (valley). Sign can also be derived geometrically from panel adjacency winding order — every interior fold of a closed carton is valley relative to the print side, so a single global convention + edge-case overrides suffices. |
| Fold order (dependency graph) | **Partially** | Kinematic dependency is derivable: a flap cannot fold past its parent panel, so the panel adjacency tree yields a topological ordering (body walls → bottom lock sequence → dust flaps → tuck flap). But *which* valid topological order plays on screen is a choreography choice, not a geometric one. |
| Glue relationships | **Yes (location), No (behavior)** | Glue tab presence is explicit in the cut outline (the manufacturer's joint tab on the side seam). Its mating face is inferable by overlap analysis when folded flat. Whether the tab bonds, tucks, or floats during animation is not encoded. |

## 23. What Requires Metadata

The following cannot be safely inferred from a dieline file (DXF/AI/CFF2) alone and must be supplied as sidecar metadata or hard-coded per template:

- **Fold order / sequencing** — the dieline defines *what* folds, never *when*. The observed bottom-first, then walls, then tuck sequence is a design decision; a different valid order (top-down) produces identical geometry.
- **Target angles for special closures** — the lock-bottom's diagonal creases fold to ~45° intermediate states before collapsing flat (0°); the tuck flap overshoots slightly past 90° before settling. These non-monotonic angle curves are choreography, not geometry.
- **Glue tab behavior** — whether the side-seam tab is shown bonding, sliding, or simply co-moving with its parent panel.
- **Animation choreography** — per-phase durations, inter-phase delays, easing curves, camera drift during folding, and whether phases overlap or run strictly serially.
- **Collision/penetration policy** — whether the engine resolves panel intersections physically or pre-bakes a collision-free keyframe path (the recording strongly suggests the latter).
- **Material appearance** — board thickness, white/craft substrate, print-side assignment (which face of the flat sheet becomes exterior).

## 24. Confidence Report

- **Very High** — Carton type is tuck-top / lock-bottom (1-2-3 or crash-lock variant); WebGL/Three.js-class renderer; panel hierarchy = tree rooted at one body panel; folds are pure 1-DOF hinge rotations about crease axes; flat-sheet → folded animation is keyframed/tweened, not physically simulated.
- **High** — Hinge axes defined by crease endpoints in the flat sheet; per-panel local transforms composed down the tree; fold sign derivable from crease line style; bottom closure uses diagonal pre-creases collapsing inward; dust flaps fold before tuck flap; camera orbits are user-driven (drag), fold animation is scripted.
- **Medium** — Phase durations (~0.4–0.9 s each), total fold cycle ~3–5 s; easing ≈ ease-in-out cubic; tuck flap overshoot-then-settle behavior; double-sided material with white interior; slight z-offset/extrusion to avoid coplanar flicker.
- **Low** — Exact easing function identity; exact per-phase millisecond timings; whether bottom is true auto-lock (crash-lock) vs. manual 1-2-3 sequence; presence of any physics pass for the tuck insertion.
- **Very Low** — Tween library identity (GSAP vs. custom vs. Three.js animation mixer); exact bottom-flap lock geometry (slit/hook shapes); whether fold order is data-driven from a JSON manifest or hard-coded per template; server-side vs. client-side dieline parsing.

## 25. Remaining Unknowns

- Exact moment the fold animation is triggered (button click vs. auto-play on preview open) — click timing is invisible in frames.
- Exact millisecond durations of each fold phase and inter-phase gaps.
- Exact easing curves (only "smooth, non-linear, decelerating at end" is observable).
- Bottom flap geometry: the underside is never clearly framed; lock-tab/slit shapes, flap widths, and diagonal crease angles are unverifiable.
- Tween/animation library identity and version.
- Whether the dieline-to-3D pipeline runs client-side or is pre-baked server-side.
- Board thickness value and whether it's modeled as extrusion or zero-thickness shells.
- Glue tab animation behavior (never isolated on screen).
- Frame rate of the original animation vs. capture (dropped frames distort duration estimates).
- Whether fold order is configurable per template or global.
- Audio/UI state (muted OBS capture) and any hover/click interactions during folding.
- Exact camera limits (min/max zoom, polar clamp) of the orbit controller.

## 26. Final Reconstruction Specification

1. **Architecture** — Client-side WebGL viewer (Three.js-style): dieline parser → panel graph builder → hierarchical `Object3D` tree → keyframed fold animator → orbit-controlled camera. No physics engine required.
2. **Hierarchy** — Root at front body panel. Children: left/right/back walls (hinged at vertical creases); each wall carries top flaps (dust flaps on sides, tuck flap on back, closure flap on front) and bottom flaps (two side flaps, front/back lock flaps with diagonal sub-creases as child nodes).
3. **Hinge model** — Every crease = 1-DOF rotation about the crease line segment; angle 0° = flat sheet, ±90°/±180° = folded. Sign from crease style (mountain/valley). Transforms compose parent→child; no translations.
4. **Fold phases** — (a) four walls rise 0→90°; (b) bottom: side flaps 0→90°, lock flaps fold with diagonal creases collapsing 45°→0°, lock engaged; (c) dust flaps 0→~90° inward; (d) tuck flap 0→~100° (slight overshoot) → settle ~90°, tongue inserted; (e) reverse for unfold.
5. **Timing/easing (estimates)** — Per phase 400–900 ms, ease-in-out cubic; total cycle 3–5 s; phases strictly serial with ~100 ms gaps; camera free during animation.
6. **Controller design** — A `FoldController` maps normalized progress `t ∈ [0,1]` through piecewise phase segments to per-hinge angle curves; supports play/pause/reverse/scrub; orbit camera independent.
7. **Five implementation rules** — (1) Never rotate a panel in world space — always about its local crease axis. (2) Drive all hinges from one master clock to keep phases synchronized. (3) Pre-validate the keyframe path for panel interpenetration; do not rely on runtime collision. (4) Render double-sided with polygon offset to prevent coplanar z-fighting. (5) Treat fold order, overshoot angles, and easing as per-template metadata, never derive them from geometry alone.

---

