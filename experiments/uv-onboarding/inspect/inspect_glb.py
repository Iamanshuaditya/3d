"""Stage 1 inspection: geometry / materials / UV analysis of a GLB.

Usage: python inspect_glb.py <model.glb> <output-dir>
Writes: report JSON + UV wireframe PNG + SVG per mesh/UV set.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw

MODEL = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

scene = trimesh.load(MODEL, process=False)
if isinstance(scene, trimesh.Trimesh):
    geoms = {"mesh": scene}
else:
    geoms = dict(scene.geometry)

report = {"file": str(MODEL), "size_mb": round(MODEL.stat().st_size / 1e6, 2), "meshes": []}


def uv_charts(faces: np.ndarray, uv: np.ndarray) -> np.ndarray:
    """Chart id per face: faces connected iff they share a mesh edge whose UVs agree."""
    edge_to_faces = defaultdict(list)
    for fi, f in enumerate(faces):
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            # key on rounded UVs of the edge so seam edges (duplicated verts w/
            # different UVs) do not connect charts
            ka = tuple(np.round(uv[a], 6))
            kb = tuple(np.round(uv[b], 6))
            edge_to_faces[frozenset((ka, kb))].append(fi)
    parent = list(range(len(faces)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for flist in edge_to_faces.values():
        for other in flist[1:]:
            ra, rb = find(flist[0]), find(other)
            if ra != rb:
                parent[rb] = ra
    roots = {}
    labels = np.empty(len(faces), dtype=int)
    for fi in range(len(faces)):
        r = find(fi)
        labels[fi] = roots.setdefault(r, len(roots))
    return labels


def draw_uv(faces, uv, labels, path_png, path_svg, size=2048):
    img = Image.new("RGB", (size, size), "white")
    d = ImageDraw.Draw(img)
    rng = np.random.default_rng(7)
    colors = {c: tuple(rng.integers(40, 220, 3)) for c in np.unique(labels)}
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">',
           f'<rect width="{size}" height="{size}" fill="white"/>']
    for fi, f in enumerate(faces):
        pts = [(float(uv[i][0]) * size, (1 - float(uv[i][1])) * size) for i in f]
        d.polygon(pts, outline=colors[labels[fi]])
        p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        svg.append(f'<polygon points="{p}" fill="none" stroke="rgb{colors[labels[fi]]}" stroke-width="0.5"/>')
    svg.append("</svg>")
    img.save(path_png)
    Path(path_svg).write_text("\n".join(svg))


for name, m in geoms.items():
    faces = m.faces
    verts = m.vertices
    entry = {
        "name": name,
        "vertices": int(len(verts)),
        "faces": int(len(faces)),
        "bbox_min": verts.min(axis=0).round(4).tolist(),
        "bbox_max": verts.max(axis=0).round(4).tolist(),
        "extents": (verts.max(axis=0) - verts.min(axis=0)).round(4).tolist(),
        "watertight": bool(m.is_watertight),
        "winding_consistent": bool(m.is_winding_consistent),
        "connected_components": int(len(trimesh.graph.connected_components(m.face_adjacency, min_len=1, nodes=np.arange(len(faces))))),
        "duplicate_vertex_ratio": round(1 - len(np.unique(np.round(verts, 6), axis=0)) / len(verts), 4),
        "euler_number": int(m.euler_number) if m.is_watertight else None,
        "degenerate_faces": int((m.area_faces < 1e-12).sum()),
    }
    vis = m.visual
    entry["visual_kind"] = vis.kind
    if vis.kind == "texture" and vis.uv is not None:
        uv = np.asarray(vis.uv)
        labels = uv_charts(faces, uv)
        n_charts = int(labels.max() + 1)
        sizes = np.bincount(labels)
        entry["uv"] = {
            "present": True,
            "range_u": [float(uv[:, 0].min()), float(uv[:, 0].max())],
            "range_v": [float(uv[:, 1].min()), float(uv[:, 1].max())],
            "charts": n_charts,
            "chart_face_counts_top10": sorted(sizes.tolist(), reverse=True)[:10],
            "charts_over_100_faces": int((sizes > 100).sum()),
        }
        stem = name.replace("/", "_")[:60]
        draw_uv(faces, uv, labels, OUT / f"uv-{stem}.png", OUT / f"uv-{stem}.svg")
        mat = vis.material
        entry["material"] = {
            "name": getattr(mat, "name", None),
            "type": type(mat).__name__,
            "baseColorTexture": getattr(mat, "baseColorTexture", None) is not None,
            "metallicRoughnessTexture": getattr(mat, "metallicRoughnessTexture", None) is not None,
            "normalTexture": getattr(mat, "normalTexture", None) is not None,
        }
    else:
        entry["uv"] = {"present": False}
    report["meshes"].append(entry)

out_json = OUT / "report.json"
out_json.write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
