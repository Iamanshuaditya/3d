# Architecture audit

What the customization engine was before this work, what it could not do, and
what changed. Everything below was verified by reading and running the code,
not inferred from filenames.

---

## 1. Current architecture map

### 1.1 Artwork: 2D is the source of truth

```
upload (StudioPanel)
  -> useCustomizer.uploadFiles              EXIF-normalised, object URL kept locally
  -> DesignDocument.surfaces[id].elements   plain data, undo/redo via History<T>
  -> DesignEditor (react-konva)             one <Stage>, artwork layer + UI layer
  -> composite into an offscreen canvas     substrate colour + artwork ONLY
  -> THREE.CanvasTexture(flipY = true)      texture-manager.ts
  -> material.map on the named mesh         ProductModel / CartonModel / PouchModel
```

Two details in that chain matter and were preserved exactly:

- The **UI layer is excluded** from the composite, so panel highlights, rulers,
  dielines and transformer handles can never print.
- `flipY = true` reconciles Konva's y-down canvas with glTF's v-up UVs. Every
  onboarding strategy emits `v = 0` at the physical bottom to match.

Texture uploads are gated by a dirty flag (`markDirty` / `consumeDirty`) read
inside `useFrame`, so a pointer-move re-uploads once per frame at most.

### 1.2 Products: onboarding pipeline -> ProductConfig

```
source.glb
  -> onboard.py inspect      per-mesh shape class, UV quality, strategy hint
  -> manifest.json           human/agent judgment: regions, strategy, physical ref
  -> onboard.py build        surgical pygltflib edit:
                               TEXCOORD_0 = customization UV
                               TEXCOORD_1 = original UV (textures repointed)
                               region node renamed to the contract mesh name
                               non-customizable nodes pass through unchanged
  -> regions.json            durable record incl. uvContract + physical scale
  -> product.json            ProductConfig-shaped: surfaces, dieline, cameras
  -> onboard.py validate     UV range, overlap, strategy reproducibility,
                             canvas->3D probes, orientation, CHIRALITY,
                             preservation, dieline quality gate
  -> onboard.py integrate    copies GLB + product.json into the app
  -> product-config.ts       one import + one PRODUCTS entry
```

This is the strongest part of the repository and was extended, not replaced.
Fifteen products ship through it today.

### 1.3 Cartons: one spec drives mesh, canvas, dieline and motion

```
CartonSpec (panels: rect + parent + angle)
  -> cartonTopology()        parent/child tree, depth, root
  -> resolveHinge()          which edge is shared -> axis + sign + crease position
  -> buildCartonTree()       nested hinge groups; UV of each panel IS its
                             dieline rect, so artwork flows across folds
  -> applyHingeAngles()      writes a pose onto the tree
  -> dielineOverlay()        the same spec draws the editor's cut/crease guides
```

Adding a box is writing a spec. No modelling, and the editor canvas and the
mesh cannot drift apart because they read the same numbers.

---

## 2. Limitations found (verified, not assumed)

### 2.1 Progressive unfolding was structurally impossible

| Claim | Verified |
|---|---|
| `fold` is one global scalar | Yes — `applyFold(tree, spec, fold, lid)` multiplied *every* hinge by the same `fold`. |
| The studio always passes `fold={1}` | Yes — `StudioShell.tsx` hard-coded `fold={1}`. |
| `lidOpen` controls one hinge class | Yes — only hinges with `isLid` moved; everything else was pinned to its assembled angle. |
| Geometry exposes individual hinges, state does not | Yes — `CartonTree.hinges[]` carried `{id, group, axis, sign, angleDeg, isLid}` per joint, and nothing outside the renderer could address them. |
| The clamshell behaves differently | Yes — `buildTaperedClamshell` generates two chamfered tray shells with ONE lid joint; its walls are not folding dieline panels at all. |

So the geometry was ready and the *state model* was the blocker: three numbers
(`fold`, `lidOpen`, and each hinge's fixed `angleDeg`) cannot express "the tuck
flap is open but the walls are still up".

Two more findings that only surface once a carton is actually laid flat:

- The mailer's dust flaps and front roll-over were **0.01 mm placeholder
  panels**. They contributed hinges but no visible board, so the assembled box
  had no flaps and the flat pose could not reproduce its own printed dieline.
- On the flattened blank the **printed face points down**. A carton printed on
  the outside folds away from its print, so the board face that meets the
  camera from above is the unprinted inside. See §5.

### 2.2 Embroidery had no seat in the architecture

| Question | Finding |
|---|---|
| How are uploads represented? | `ImageElement` with `src` (object/data URL) plus source pixel dimensions. Nothing described *how* the artwork is reproduced. |
| Where could processing be inserted? | Between the design document and the Konva artwork layer — the composite step already stands between them. |
| How do textures reach the GLB? | One `CanvasTexture` per surface, bound to `material.map` by mesh name. |
| Multiple texture channels? | No. Every material bound `map` only; no normal, roughness or mask slot was used anywhere. |
| Can we add maps without breaking products? | Yes, if they are opt-in per product. Packaging materials are built in separate branches keyed on `materialProfile`. |
| Can a garment use the onboarding system? | Yes, unchanged — planar strategy, face-selected region, standard validation. |

---

## 3. What changed

### 3.1 Structural state: global scalar -> per-hinge pose

| Before | After |
|---|---|
| `applyFold(tree, spec, fold, lid)` | `applyHingeAngles(tree, angles)` — one absolute pose |
| `fold: number`, `lidOpen: number` | `HingeAngles = Record<hingeId, degrees>` |
| lid-only articulation | `ArticulatedHinge[]` derived from the panel tree |
| order implied by the renderer | `UnfoldPlan` — authored in the spec or derived from topology |
| — | `unfoldReducer` — a clamped integer stage, so clicks cannot corrupt state |

Stage *k*'s pose is `assembled` overridden by steps `1..k`. Because targets are
absolute rather than incremental, recomputing a stage always gives the same
pose no matter how the user got there — which is what makes hammering the
button, or clicking mid-animation, safe.

### 3.2 `canOpen` -> derived capability

`resolveProductPresentation(config)` returns one of `static`, `open-close`,
`progressive-unfold`, or `unsupported`. The UI asks a product what it can do
rather than asking what it is. A construction that cannot genuinely flatten
cannot report `progressive-unfold`, and a product that declares GLB
articulation the runtime cannot yet drive reports `unsupported` instead of
silently degrading.

### 3.3 Artwork: flat image -> non-destructive render treatment

`ImageElement.treatment` is `{ mode: "print" }` or
`{ mode: "embroidery", settings }`. The customer's asset is never rewritten;
stitching is derived from `(asset, physical size, settings)` and thrown away
freely. Switching back to Print restores the original bytes — verified at zero
pixel delta by `scripts/verify-embroidery-shots.py`.

`EditableSurface.renderModes` states which methods a surface offers, so
packaging never grows a control it cannot honour.

### 3.4 Materials: one map -> a material profile with relief

`materialProfile: "cotton-fabric"` builds a `MeshPhysicalMaterial` with cloth
sheen, a repeating weave **bump** map (leaving the tangent-space normal slot
free), plus per-surface embroidery normal and roughness maps composited under
the same transforms the editor uses. Every other profile is untouched.

---

## 4. Data flow after the work

```
                          PRODUCT CONFIG
                                |
        +-----------------------+------------------------+
        |                       |                        |
  Surface mapping        Presentation             Material / effect
  UV + template          static | open-close      print | embroidery
  (onboarding)           | progressive-unfold     (renderModes)
        |                       |                        |
        +-----------------------+------------------------+
                                |
                        DESIGN DOCUMENT          <- 2D source of truth
                                |
                     +----------+-----------+
                     |                      |
              artwork canvas         derived stitch maps
              (Konva composite)      (colour / normal / roughness)
                     |                      |
                     +----------+-----------+
                                |
                        THREE.JS LIVE PREVIEW
```

---

## 5. Exterior artwork chirality (found, measured, fixed)

### The defect

Measured on every printable panel of both cartons: the printed quad was the
outermost board surface (correct) but its face normal pointed **into** the box
(`normal · outward = -1.000`). So the exterior was seen through the back of the
printed face and **artwork read mirrored on the assembled carton**.

The diagnosis that mattered: chirality is not winding and not the normal. It is
whether the map from `(u, v)` to `(screen-right, screen-up)` preserves
orientation for someone looking at the printed face. Compare the signed area of
a triangle in UV space against its signed area as that viewer sees it — same
sign reads correctly, opposite sign is mirrored. That check is now
`tests/unfold/carton-chirality.test.ts`, and it was negative on 14/14 mailer
panels and on every main clamshell panel.

### Why it is a one-line change and not a sign flip

A carton printed on the outside is folded with the printed face turned AWAY
from the blank's own top side — physically, the sheet is **flipped over before
folding**. Flipping a sheet reverses one axis. `toUv` mapped `u = x / width`
straight through, skipping the flip.

Inverting u applies the flip once, coherently, across the whole sheet:

```ts
function toUv(spec, x, y) { return [1 - x / spec.width, 1 - y / spec.height]; }
```

Because the inversion is global rather than per-panel, adjacent panels still
sample adjacent canvas regions, so **artwork stays continuous across every
crease**. A per-panel flip would have fixed chirality and broken continuity;
that is why it is done here and not in the panel builder.

### The consequence, and the migration it required

Flipping the sheet means the panel drawn on the LEFT of the printed dieline
becomes the box's RIGHT-hand wall. Panel ids and section labels name a panel's
**final position on the product** — which is what a customer means by "left
side" — so the migration was to move the metadata, not to rename the walls:

| | before | after |
|---|---|---|
| `sections.left` (mesh `LEFT`) | `xCm: 0.8` | `xCm: 30.8` |
| `sections.right` (mesh `RIGHT`) | `xCm: 30.8` | `xCm: 0.8` |

`contentRotation` is unchanged: removing a mirror does not change the rotation
component. The centre column (lid, back, base, front, roll) is symmetric about
the sheet and did not move at all.

### What deliberately did NOT change

- **The editor canvas** — still the true printed sheet, seen from the printed
  side.
- **The production PDF** — `dielineOverlay` and the artwork raster are
  untouched; `npm run validate:pdf` still passes with identical page geometry.
- **Geometry, hinges, unfolding** — no mesh moved. The fix is entirely in the
  UV mapping.

### The clamshell's separate problem

The tapered clamshell builds its gussets, rim strips, locking ears and tabs
from hand-authored corner lists that take a few corners of a neighbouring
panel's rect. The geometry mirrors across `side` and again between the base
tray and the lid, but those lists did not — so half of them were mirrored
*independently* of the systematic defect above, in both directions.

Those fragments have no continuity contract with any neighbour, so
`addThickPanel` now normalises the pairing at build time rather than asking
eight coordinate lists to each know which tray and which side they are on.
Panels that already read correctly are left exactly as authored, so the large
printable walls are untouched.

### The flat pose

The flattened blank shows its printed side, which faces down — so the dieline
camera preset now sits **below** the sheet looking up, with a fill light to
match. That is what makes the final stage reproduce the editor canvas rather
than its mirror image. Verified per-vertex in `flat-dieline.test.ts` and
visually in `docs/research/diagnostics/unfold-mailer/stage-06.png`.

## 6. Invariants now enforced by tests

| Invariant | Where |
|---|---|
| Flattened panel transform == dieline panel transform (< 0.1 mm) | `flat-dieline.test.ts` |
| Every flat panel is coplanar and printed-side up | `flat-dieline.test.ts` |
| Per-vertex UV == its own dieline coordinate (catches quarter-turns and UV drift) | `flat-dieline.test.ts` |
| Artwork reads unmirrored on every assembled panel of every carton | `carton-chirality.test.ts` |
| The printed face is on the outside of every enclosing wall | `carton-chirality.test.ts` |
| UVs identical at every unfold stage (artwork never shifts) | `flat-dieline.test.ts` |
| Children flatten no later than their parents | `unfold-plan.test.ts` |
| Rapid/interleaved clicks are deterministic and cannot overflow | `unfold-state.test.ts` |
| A construction that cannot flatten cannot claim it can | `unfold-plan.test.ts` |
| No stitch endpoint outside the artwork's alpha | `stitch-math.test.ts` |
| Stitch scale follows millimetres, not raster resolution | `stitch-math.test.ts` |
| Narrow strokes get satin, broad areas get fill | `stitch-math.test.ts` |
| A logo's physical size is independent of canvas resolution | `pipeline-contracts.test.ts` |
| Moving/rotating a logo does not invalidate its stitching | `pipeline-contracts.test.ts` |
| Only surfaces that declare it offer embroidery | `pipeline-contracts.test.ts` |
| Rigging an authored GLB leaves its rest pose byte-identical | `glb-articulation.test.ts` |
| Un-rigging restores parenting, so a StrictMode remount still articulates | `glb-articulation.test.ts` |
| A declared hinge parent that is not an ancestor fails loudly | `glb-articulation.test.ts` |
| Print -> embroidery -> print restores the asset exactly | `scripts/verify-embroidery-shots.py` |
| Every product family still renders | `harness/regression_products.mjs` |
