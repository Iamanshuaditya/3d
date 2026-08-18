# Product Onboarding — Loop State

> Durable spine for the onboarding-system build (loop-engineering pattern: STATE.md
> + append-only RUNLOG.md + maker/checker split; the repo's CLI tooling was judged
> unnecessary — concepts applied directly).

## Goal
Turn the pouch proof into a **general, reusable onboarding system**: arbitrary GLB →
inspect → strategy per region → customization mapping → customer 2D space →
customization-ready GLB + metadata → validated through the production three.js path.
Second object forces generalization; pouch must keep working.

## Current object
`products/camera-001/source.glb` — vintage camera (from 3DAIGC-API example assets,
test-use only, NOT shipped). **Why chosen:** 18 meshes / 18 materials / 29,649 tris,
existing per-mesh UVs, mixed geometry (flat top plate, cylindrical lens barrel,
leather-wrapped body), real-world customization analogue (camera skins). Challenges
every pouch assumption: multi-component, multi-material, curved, existing UVs,
no front/back/bottom semantics. Rejected: bottle (parametric, already onboarded,
by-construction UVs = zero learning), vistaprint pouch (same class as pouch #1),
tank/ogre/figurines (not products / weaker semantics).

## Known facts (from pouch experiment + code reading)
- Configurator contract: meshes found BY NAME (`editableSurfaces[].meshName(s)`),
  CanvasTexture assigned to `material.map` → samples TEXCOORD_0. flipY=true.
- Sections map canvas cm-rects → meshes with contentRotation/textureRotation.
- glTF does NOT persist UV layer names — order is the contract.
- Mathematically optimal unwraps (xatlas) are customer-hostile on organic meshes;
  fixed predictable rects win. But camera has CLEAN AUTHORED UVs — reuse path
  must be first-class, per region.
- PartField/PartUV: non-commercial license, rejected for production.
- Approved deps: trimesh/numpy/PIL (MIT/BSD), pip xatlas (MIT, fallback),
  Blender headless as external GPL tool (outputs unencumbered), three.js.

## Architecture (current best)
```
product-onboarding/
├── onboard.py           CLI: inspect | build | validate
├── lib/                 inspector, regions, strategies, exporter, templates, validate_math
├── harness/             generic three.js harness (production texture path) + screenshot driver
├── labeler/             browser face/mesh labeling tool → regions manifest
└── products/<id>/       source.glb, manifest.json, generated: product-customizable.glb,
                         regions.json, product.json, uv-template.svg/png,
                         diagnostic-texture.png, validation/
```
Manifest = human-authored input (regions via selectors: by_mesh / by_material /
by_faces from labeler; strategy per region; physical calibration). Everything after
manifest = deterministic.

## UV contract
TEXCOORD_0 = customization mapping (fixed template rects per region).
TEXCOORD_1 = original UV (original textures preserved). Recorded in product.json.

## Physical scale
Source meshes may be unitless. Manifest requires `physical.reference` =
{axis|extent, cm}; pipeline derives cm-per-unit; per-region physical size computed
from geometry, not assumed. Camera demo uses width 13.6 cm (typical rangefinder,
placeholder spec — flagged, client-suppliable).

## Open questions
- [ ] Which camera meshes are customizable regions? (needs inspection + labeler)
- [ ] Are existing camera UVs per-mesh contiguous/non-overlapping? (inspector)
- [ ] Cylindrical strategy needed for lens, or is lens non-customizable?
- [ ] How to register generated product.json in product-config.ts cleanly (data-driven)?

## Completion criteria status (evidence in RUNLOG.md + products/*/validation/)
- Second product converted: DONE (camera-001; plus pouch-002 as single-mesh family proof)
- Semantic regions without per-product code: DONE (manifest + labeler + by:faces)
- Dynamic strategy selection: DONE (wrap/planar/reuse per region; inspector recommends)
- Customer-friendly 2D: DONE (per-region canvases, physical cm, footprint outlines)
- Correct 3D result: DONE (math probes + chirality + harness + REAL studio)
- Production renderer: DONE (/studio?product=camera-001 & pouch-002, text via real editor)
- Reusable pipeline: DONE (same CLI/manifest for both products)
- Region tooling: DONE (labeler.html, mesh-click + face paint)
- Metadata: DONE (regions.json + product.json, uvContract explicit)
- Asset preservation: DONE (validated byte-preserved nodes; original UV+texture ch.1)
- Physical scale: DONE (manifest.physical.reference -> cmPerUnit; wrap uses arc length)
- Automated validation: DONE (onboard.py validate + harness, rerunnable)
- Regression: DONE (meshy-pouch-001 untouched & working; legacy text quirk pre-existing)
- Commercial viability: DONE (MIT/BSD-only path; PartField/PartUV rejected; camera asset test-only)
- Documentation: DONE (README.md)

## Next action
COMPLETE (checker gaps remediated in I5). Future work: multi-primitive support,
conformal strategy for complex shells, labeler-driven face sets at scale.

## Iteration log pointer
See RUNLOG.md.
