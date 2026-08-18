# Product Onboarding System

Converts an arbitrary existing 3D product (GLB) into a **customization-ready
digital product**: named region meshes with a customization UV, per-region
customer canvases, structured metadata, print templates, and automated
validation — consumed unchanged by the existing three.js configurator
(`/studio?product=<id>`).

Proven on two materially different products:
- `products/camera-001` — multi-part vintage camera (18 nodes, wrap + planar
  strategies, existing-material preservation).
- `products/pouch-002` — single-mesh AI-scanned pouch (face-level region
  carving, three planar regions, non-rectangular gusset footprint).

## Layout

> New here (human or AI)? Read **AGENT-GUIDE.md** first — the step-by-step
> handbook for onboarding a new model, with decision rules and the fix loop.

```
product-onboarding/
├── onboard.py            CLI: inspect | build | validate | integrate
├── lib/
│   ├── inspector.py      capability report (geometry/UV/materials/shape class)
│   ├── strategies.py     mapping strategies: wrap | planar | reuse_existing
│   ├── build.py          manifest -> surgical GLB edit + regions.json
│   ├── assets.py         product.json, templates, diagnostics, cameras
│   └── validate_math.py  render-free validation incl. chirality
├── harness/
│   ├── harness.html      generic three.js proof (production texture path)
│   └── shoot.mjs         headless screenshot driver (playwright-core + Chrome)
├── labeler/labeler.html  browser region-labeling tool (mesh click + face paint)
├── tools/                product-family heuristics (e.g. pouch face classifier)
└── products/<id>/        source.glb + manifest.json + generated outputs
```

## Onboarding product #3 — exact process

Prereqs: `uv venv && uv pip install -r requirements.txt` (or reuse
`experiments/uv-onboarding/.venv`); Chrome; `npm i` in this dir (playwright-core);
a static server for harness/labeler: `python3 -m http.server 8779` at repo root.

1. **Drop the model**: `mkdir products/<id>` and copy the GLB to
   `products/<id>/source.glb`.
2. **Inspect** (automatic): `python onboard.py inspect products/<id>`.
   Read the per-mesh report: shape class (planar/cylindrical/curved/complex),
   existing-UV quality (charts/coverage/overlap), recommended strategy.
3. **Label regions** (human, minutes): open
   `http://localhost:8779/product-onboarding/labeler/labeler.html?model=/product-onboarding/products/<id>/source.glb`
   — click meshes (or face-paint on single-mesh products), name regions, pick
   strategy + axis, set the physical reference measurement, download
   `manifest.json` into `products/<id>/`.
   For recurring product families, a heuristic script (see
   `tools/classify_pouch_faces.py`) can generate face sets instead.
4. **Build** (automatic): `python onboard.py build products/<id>` →
   `product-customizable.glb`, `regions.json`, `product.json`,
   `uv-template-*.svg/png`, `diagnostic-*.png`.
5. **Validate** (automatic): `python onboard.py validate products/<id>` —
   must print `"passed": true`. If chirality fails, toggle `flip_u`
   (or `flip_v`) in the manifest and rebuild — the checks tell you which.
   Then visual proof: `node harness/shoot.mjs /product-onboarding/products/<id> products/<id>/validation/harness.png`.
6. **Integrate** (one import): `python onboard.py integrate products/<id>`,
   then in `src/lib/configurator/product-config.ts` add
   `import xJson from "./generated/<id>.product.json"`,
   `export const xProduct = onboardedProduct(xJson)`, and a `PRODUCTS` entry.
   `npm run typecheck`. Open `/studio?product=<id>`.

## Contracts (read before changing anything)

- **UV channels**: TEXCOORD_0 = customization mapping (0–1 per region),
  TEXCOORD_1 = original UV. glTF does NOT persist UV-set names — channel order
  IS the contract, recorded in `regions.json.uvContract`. Original textures are
  repointed to `texCoord: 1` so the asset still renders its source look.
- **V orientation**: raw glTF accessor space, v=0 at the physical bottom;
  the runtime CanvasTexture uses `flipY=true` (see `texture-manager.ts`), so
  canvas-top = physical-top. Beware: **trimesh flips V on load** — always
  validate/write via raw accessors (see `build.py` / `validate_math.py`).
- **Region meshes are found by NAME** by the configurator
  (`editableSurfaces[].meshName`). Names come from the manifest.
- **Physical scale**: source units are arbitrary. `manifest.physical.reference`
  (one known extent in cm) calibrates cm-per-unit; every region's canvas gets
  true physical dimensions from geometry (wrap = perimeter arc length).
- **Preservation**: non-customizable nodes pass through byte-identical
  (validated). Customizable meshes keep original UV + textures on channel 1.

## Layout modes

`manifest.layout` decides the customer-facing 2D shape:
- `{"mode": "separate"}` (default): one canvas/tab per region — for products
  whose regions are physically separate print jobs (camera wrap + name plate).
- `{"mode": "shared", "order": [...], "surfaceId": "film"}`: ONE continuous
  production web — regions packed side by side (vertically centered) into a
  single canvas, like a flexible-film dieline. The configurator gets one
  surface with `meshNames` + `sections` and no rotations; customers upload
  once and drag artwork anywhere across front/gusset/back (pouch-002).

## Generated dielines

Every surface's `product.json` includes a `dieline` (cuts / creases / safety
paths in editor px) derived from geometry: region UV-boundary loops become the
safety outlines (e.g. a pouch gusset's eye shape — no hand-measured
coordinates), shared-web slice boundaries become crease lines. The editor
renders it via the same `dieline` prop pouch-001 uses; data-driven overlays
take precedence (`surface.dieline` in StudioShell/ProductCustomizer).

## Strategies

| strategy | for | notes |
|---|---|---|
| `wrap` | bands/labels around an axis | U = outline **arc length** (true distances on stadium sections), seam via `seam_deg`, seam-crossing corners duplicated |
| `planar` | flat plates/panels | orthographic along `axis`; `flip_u`/`flip_v` set reading direction |
| `reuse_existing` | authored, clean UVs | keeps source UV (optionally renormalized) |

Strategies are per-REGION: one product can mix all three. Add new strategies in
`strategies.py` (`STRATEGIES` registry) — they receive world-space corners and
return per-corner UVs + physical metadata.

## Validation (rerunnable)

`validate` checks per region: TEXCOORD_0 present/in-range, overlap ≈ 0,
strategy reproducibility from exported geometry, adaptive canvas probes
(2D point → 3D position), canvas-top = physical-top, **chirality** (text must
read left-to-right from outside — this catches mirroring that monotonic checks
miss), TEXCOORD_1 + texture-channel preservation, non-customizable nodes
unchanged. The harness then proves the identical rendering path production uses
(GLTFLoader → CanvasTexture(flipY) → material.map on the named mesh).

## Known hard limits (fail loudly, by design)

- **Single-primitive meshes only**: a node whose mesh has multiple primitives
  (per-material submeshes) raises `NotImplementedError` with guidance — split
  per material first (Blender) or extend `build.py`.
- **One node per customizable region** (combine meshes beforehand if needed).
- **No Draco-compressed sources** — decompress first (`gltf-transform`).
- **Wrap/planar axes are world-axis-aligned**; oblique surfaces and complex
  curved shells (`no_strategy_yet_use_labeler_or_planar` in the inspector)
  have no dedicated strategy yet — planar projection is the workable fallback
  for shallow curvature.
- `reuse_existing` estimates physical size from the mesh bounding box unless
  `physicalWidthCm`/`physicalHeightCm` are supplied in the region manifest
  (the note lands in `regions.json.mapping.physicalDimsNote`). Smoke-tested in
  `products/_test-reuse/`.
- Labeler face-paint paints front-facing faces only (occlusion-safe brush);
  one painted mesh per region. For very large face sets, a scripted classifier
  (see `tools/`) is the more practical route.

## What still requires human judgment

- Choosing regions + labels (the labeler makes this minutes, not code).
- Strategy/axis choice per region (inspector recommends; validator verifies).
- `flip_u`/`flip_v` — one validate-fix-rebuild round when the chirality check
  fails.
- The physical reference measurement (must come from the client/spec).
- Debris cleanup for messy AI scans (`experiments/uv-onboarding` has the tools;
  pouch-002 used its cleaned mesh).

## Licensing status of the pipeline

trimesh (MIT), numpy (BSD), Pillow (HPND), pygltflib (MIT), three.js (MIT),
playwright-core (Apache-2.0), xatlas pip (MIT, optional fallback — not used in
the current path). Blender is used only as an optional external tool
(inspection renders), never linked. PartField/PartUV were evaluated and
REJECTED for production (NVIDIA non-commercial license). Camera source model is
a third-party example asset for testing only — not shippable.
