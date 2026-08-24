"""Model inspector: capability report for an arbitrary GLB.

Per mesh: geometry stats, connected components/debris, existing-UV quality
(charts, coverage, overlap, contiguity), material/texture info, and a geometric
shape classification (planar / cylindrical / curved-shell / complex) that feeds
strategy recommendation. Pure trimesh/numpy — no Blender required.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import trimesh


# ---------------------------------------------------------------- UV analysis

def uv_chart_labels(faces: np.ndarray, uv: np.ndarray) -> np.ndarray:
    """Chart id per face: faces connect iff they share a mesh edge whose UV
    endpoints agree (seams = duplicated verts with different UVs)."""
    edge_map: dict = defaultdict(list)
    for fi, f in enumerate(faces):
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            ka = tuple(np.round(uv[a], 6))
            kb = tuple(np.round(uv[b], 6))
            edge_map[frozenset((ka, kb))].append(fi)
    parent = list(range(len(faces)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for fl in edge_map.values():
        for other in fl[1:]:
            ra, rb = find(fl[0]), find(other)
            if ra != rb:
                parent[rb] = ra
    roots: dict = {}
    return np.array([roots.setdefault(find(i), len(roots)) for i in range(len(faces))])


def uv_coverage_and_overlap(faces: np.ndarray, uv: np.ndarray, res: int = 256):
    """Rasterize triangles into a res^2 grid; coverage = filled fraction of the
    0-1 square, overlap = fraction of filled texels hit by >1 triangle."""
    from PIL import Image, ImageDraw

    img = Image.new("L", (res, res), 0)
    d = ImageDraw.Draw(img)
    for f in faces:
        d.polygon([(float(uv[i][0]) * res, (1 - float(uv[i][1])) * res) for i in f], fill=255)
    covered_px = float(np.asarray(img, dtype=bool).mean())
    # overlap estimate: total analytic triangle area vs rasterized covered area.
    # If triangles tile the square without overlap the two agree; excess = overlap.
    tri = uv[faces]
    edge_a = tri[:, 1] - tri[:, 0]
    edge_b = tri[:, 2] - tri[:, 0]
    # NumPy 2.5 requires np.cross inputs to be 3D. UV triangles are planar, so
    # compute the scalar z-component of the 2D cross product directly.
    cross_z = edge_a[:, 0] * edge_b[:, 1] - edge_a[:, 1] * edge_b[:, 0]
    tri_area = 0.5 * np.abs(cross_z).sum()
    overlap = float(max(0.0, tri_area - covered_px) / max(tri_area, 1e-9))
    return covered_px, overlap


# ------------------------------------------------------------ shape analysis

def classify_shape(mesh: trimesh.Trimesh) -> dict:
    """Rough per-mesh shape class from PCA + normal statistics.

    planar:       normals cluster around one direction
    cylindrical:  normals ~perpendicular to one axis, wide angular spread
    curved_shell: smooth normal variation, single sheet
    complex:      everything else
    """
    n = mesh.face_normals
    areas = mesh.area_faces
    w = areas / areas.sum()
    mean_n = (n * w[:, None]).sum(axis=0)
    mean_len = np.linalg.norm(mean_n)  # 1.0 = perfectly planar
    # cylinder axis candidate: smallest-eigenvalue direction of weighted normal
    # covariance (normals of a cylinder lie in the plane perpendicular to axis)
    cov = (n * w[:, None]).T @ n
    eigvals, eigvecs = np.linalg.eigh(cov)
    axis = eigvecs[:, 0]
    perp = 1.0 - np.abs(n @ axis)  # ~1 when normal ⟂ axis
    cyl_score = float((perp * w).sum())
    result = {
        "planarity": round(float(mean_len), 3),
        "cylindricity": round(cyl_score, 3),
        "axis": [round(float(v), 4) for v in axis],
    }
    if mean_len > 0.9:
        result["class"] = "planar"
    elif cyl_score > 0.9 and mean_len < 0.5:
        result["class"] = "cylindrical"
    elif mean_len < 0.15 and cyl_score < 0.8:
        result["class"] = "closed_or_complex"
    else:
        result["class"] = "curved_shell"
    return result


# ----------------------------------------------------------------- inspector

def inspect_glb(path: str | Path, uv_raster_res: int = 192) -> dict:
    scene = trimesh.load(str(path), process=False)
    # One entry per scene-graph node, with the node's WORLD transform applied so
    # spatial stats mean what a three.js viewer sees. Single-mesh files get one
    # synthetic node.
    instances: list[tuple[str, str, trimesh.Trimesh]] = []
    if isinstance(scene, trimesh.Trimesh):
        instances.append(("mesh", "mesh", scene))
    else:
        for node in scene.graph.nodes_geometry:
            transform, gname = scene.graph[node]
            g = scene.geometry[gname].copy()
            g.apply_transform(transform)
            instances.append((node, gname, g))

    all_bounds = scene.bounds
    report = {
        "file": str(path),
        "size_mb": round(Path(path).stat().st_size / 1e6, 2),
        "scene_extent": (all_bounds[1] - all_bounds[0]).round(5).tolist(),
        "meshes": [],
    }
    for node, gname, m in instances:
        faces = np.asarray(m.faces)
        comps = trimesh.graph.connected_components(
            m.face_adjacency, min_len=1, nodes=np.arange(len(faces)))
        comp_sizes = sorted((len(c) for c in comps), reverse=True)
        entry = {
            "geometry": gname,
            "node": node,
            "vertices": int(len(m.vertices)),
            "faces": int(len(faces)),
            "extent": (m.bounds[1] - m.bounds[0]).round(5).tolist(),
            "centroid_offset": (m.bounds.mean(axis=0) - all_bounds.mean(axis=0)).round(4).tolist(),
            "components": len(comp_sizes),
            "debris_components_le50": int(sum(1 for s in comp_sizes if s <= 50)),
            "watertight": bool(m.is_watertight),
            "shape": classify_shape(m),
        }
        vis = m.visual
        if vis.kind == "texture" and vis.uv is not None:
            uv = np.asarray(vis.uv)
            labels = uv_chart_labels(faces, uv)
            coverage, overlap = uv_coverage_and_overlap(faces, uv, uv_raster_res)
            entry["uv"] = {
                "present": True,
                "charts": int(labels.max() + 1),
                "coverage": round(coverage, 3),
                "overlap_fraction": round(overlap, 3),
                "u_range": [round(float(uv[:, 0].min()), 3), round(float(uv[:, 0].max()), 3)],
                "v_range": [round(float(uv[:, 1].min()), 3), round(float(uv[:, 1].max()), 3)],
            }
        else:
            entry["uv"] = {"present": False}
        mat = getattr(vis, "material", None)
        entry["material"] = {
            "name": getattr(mat, "name", None),
            "baseColorTexture": bool(getattr(mat, "baseColorTexture", None)),
            "baseColorFactor": (list(map(int, mat.baseColorFactor))
                                 if getattr(mat, "baseColorFactor", None) is not None else None),
        } if mat is not None else None
        # strategy recommendation — names match lib/strategies.py STRATEGIES keys
        # so the value can be pasted into a manifest directly.
        rec = "reuse_existing"
        if not entry["uv"]["present"] or entry["uv"].get("overlap_fraction", 0) > 0.15:
            rec = {"planar": "planar",
                   "cylindrical": "wrap"}.get(entry["shape"]["class"],
                                              "no_strategy_yet_use_labeler_or_planar")
        elif entry["uv"]["charts"] > 40:
            rec = "planar"  # fragmented authored UV: projection beats reuse
        entry["recommended_strategy"] = rec
        report["meshes"].append(entry)
    return report


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("glb")
    ap.add_argument("-o", "--out", default=None)
    args = ap.parse_args()
    rep = inspect_glb(args.glb)
    text = json.dumps(rep, indent=2)
    if args.out:
        Path(args.out).write_text(text)
    print(text)


if __name__ == "__main__":
    main()
