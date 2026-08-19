"""Shared Stage 3 analyzer: charts, packing utilization, distortion, wireframe PNG.

Modes:
  python analyze_variant.py xatlas <outdir>          (reads xatlas_*.npy + clean glb)
  python analyze_variant.py smart <outdir>           (reads smart_*.npy + clean glb)
  python analyze_variant.py original <outdir>        (reads clean glb's own UVs)
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
mode, outdir = sys.argv[1], Path(sys.argv[2])
outdir.mkdir(parents=True, exist_ok=True)

clean = trimesh.load(HERE.parent / "inspect/pouch-clean.glb", process=False, force="mesh")
V, F = np.asarray(clean.vertices), np.asarray(clean.faces)

if mode == "xatlas":
    vmap = np.load(HERE / "xatlas_vmap.npy")
    faces = np.load(HERE / "xatlas_indices.npy")
    uvs = np.load(HERE / "xatlas_uvs.npy")
    pos = V[vmap]
elif mode == "smart":
    loops_uv = np.load(HERE / "smart_loops_uv.npy")
    tri_loops = np.load(HERE / "smart_tri_loops.npy")
    tri_verts = np.load(HERE / "smart_tri_verts.npy")
    # flatten loops into per-corner vertices (duplicated at seams by construction)
    uvs = loops_uv[tri_loops.ravel()]
    pos = V[tri_verts.ravel()]
    faces = np.arange(len(uvs)).reshape(-1, 3)
elif mode == "original":
    uvs = np.asarray(clean.visual.uv)
    faces = F
    pos = V
else:
    raise SystemExit("unknown mode")

# ---- chart labels via union-find on shared UV edges
edge_map = defaultdict(list)
for fi, f in enumerate(faces):
    for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
        ka = tuple(np.round(uvs[a], 6))
        kb = tuple(np.round(uvs[b], 6))
        edge_map[frozenset((ka, kb))].append(fi)
parent = list(range(len(faces)))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
for fl in edge_map.values():
    for o in fl[1:]:
        ra, rb = find(fl[0]), find(o)
        if ra != rb:
            parent[rb] = ra
roots = {}
labels = np.array([roots.setdefault(find(i), len(roots)) for i in range(len(faces))])
n_charts = int(labels.max() + 1)
chart_sizes = np.bincount(labels)

# ---- distortion: ratio of UV-space triangle area to 3D triangle area (normalized)
def tri_area2(p):
    return 0.5 * np.abs(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]))
uv_tris = uvs[faces]
a_uv = tri_area2(uv_tris)
p_tris = pos[faces]
a_3d = np.linalg.norm(np.cross(p_tris[:, 1] - p_tris[:, 0], p_tris[:, 2] - p_tris[:, 0]), axis=1) * 0.5
valid = (a_3d > 1e-12) & (a_uv > 1e-14)
scale = a_uv[valid] / a_3d[valid]
scale /= np.median(scale)
area_distortion = {
    "p5": float(np.percentile(scale, 5)),
    "median": 1.0,
    "p95": float(np.percentile(scale, 95)),
    "spread_95_5": float(np.percentile(scale, 95) / max(np.percentile(scale, 5), 1e-9)),
}

# ---- packing utilization: rasterize coverage at 512^2
R = 512
img = Image.new("L", (R, R), 0)
d = ImageDraw.Draw(img)
for f in faces:
    d.polygon([(float(uvs[i][0]) * R, (1 - float(uvs[i][1])) * R) for i in f], fill=255)
coverage = np.asarray(img).astype(bool).mean()

# ---- wireframe
S = 2048
wf = Image.new("RGB", (S, S), "white")
dw = ImageDraw.Draw(wf)
rng = np.random.default_rng(11)
colors = {c: tuple(rng.integers(30, 210, 3)) for c in range(n_charts)}
for fi, f in enumerate(faces):
    dw.polygon([(float(uvs[i][0]) * S, (1 - float(uvs[i][1])) * S) for i in f],
               outline=colors[labels[fi]])
wf.save(outdir / f"uv-{mode}.png")

stats = {
    "mode": mode,
    "faces": int(len(faces)),
    "charts": n_charts,
    "charts_over_100_faces": int((chart_sizes > 100).sum()),
    "largest_charts": sorted(chart_sizes.tolist(), reverse=True)[:8],
    "packing_coverage": round(float(coverage), 3),
    "area_distortion": area_distortion,
}
(outdir / f"stats-{mode}.json").write_text(json.dumps(stats, indent=2))
print(json.dumps(stats, indent=2))
