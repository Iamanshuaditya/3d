"""Parametric garment generator: a clean, watertight-enough T-shirt GLB plus its
onboarding manifest.

Modelled directly in CENTIMETRES (so cmPerUnit == 1 and the onboarding
pipeline's physical calibration is exact), Y-up, with the printable chest area
carved out of the shirt surface as its own node. Carving at generation time —
rather than offsetting a floating patch above the garment — means the print
area is genuinely part of the cloth: no z-fighting, no shadow gap, no seam.

Usage: python tools/generate_garments.py [garment-id ...]   (default: all)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

HERE = Path(__file__).parent.parent

N_THETA = 72          # cross-section resolution
N_RINGS = 60          # torso resolution up the body
SUPERELLIPSE = 2.6    # 2 = ellipse; higher = flatter front/back, like cloth


def superellipse_ring(half_width: float, half_depth: float, y: float) -> np.ndarray:
    """One horizontal cross-section of the torso."""
    t = np.linspace(0.0, 2.0 * np.pi, N_THETA, endpoint=False)
    c, s = np.cos(t), np.sin(t)
    p = 2.0 / SUPERELLIPSE
    x = half_width * np.sign(c) * np.abs(c) ** p
    z = half_depth * np.sign(s) * np.abs(s) ** p
    return np.stack([x, np.full_like(x, y), z], axis=1)


def grid_faces(rows: int, cols: int, closed: bool = True) -> np.ndarray:
    """Quad grid -> triangles. `closed` wraps the last column to the first."""
    faces = []
    for r in range(rows - 1):
        for c in range(cols if closed else cols - 1):
            a = r * cols + c
            b = r * cols + (c + 1) % cols
            d = (r + 1) * cols + c
            e = (r + 1) * cols + (c + 1) % cols
            faces.append([a, d, e])
            faces.append([a, e, b])
    return np.array(faces, dtype=np.int64)


def interp(profile: list[tuple[float, float]], ys: np.ndarray) -> np.ndarray:
    pts = np.array(profile, dtype=float)
    return np.interp(ys, pts[:, 0], pts[:, 1])


def fan_cap(ring: np.ndarray, centre: np.ndarray, flip: bool):
    """Close a ring with a triangle fan to `centre`."""
    verts = np.vstack([ring, centre[None, :]])
    hub = len(ring)
    faces = [
        [i, (i + 1) % len(ring), hub] if not flip else [(i + 1) % len(ring), i, hub]
        for i in range(len(ring))
    ]
    return verts, np.array(faces, dtype=np.int64)


def sleeve(side: int, root: np.ndarray, direction: np.ndarray, length: float,
           r_root: float, r_cuff: float, rings: int = 14):
    """A tapered tube swept along `direction`, elliptical in section, cuff capped."""
    direction = direction / np.linalg.norm(direction)
    u = np.cross(np.array([0.0, 1.0, 0.0]), direction)
    u /= np.linalg.norm(u)
    v = np.cross(direction, u)
    theta = np.linspace(0.0, 2.0 * np.pi, N_THETA, endpoint=False)

    verts = []
    for t in np.linspace(0.0, 1.0, rings):
        r = r_root + (r_cuff - r_root) * t
        centre = root + direction * (length * t)
        verts.append(
            centre[None, :]
            + (r * np.cos(theta))[:, None] * u[None, :]
            + (r * 0.78 * np.sin(theta))[:, None] * v[None, :]
        )
    verts = np.vstack(verts)
    faces = grid_faces(rings, N_THETA)

    cuff_base = len(verts) - N_THETA
    hub = len(verts)
    verts = np.vstack([verts, verts[cuff_base:].mean(axis=0)[None, :]])
    fan = [
        [cuff_base + i, cuff_base + (i + 1) % N_THETA, hub] if side > 0
        else [cuff_base + (i + 1) % N_THETA, cuff_base + i, hub]
        for i in range(N_THETA)
    ]
    return verts, np.vstack([faces, np.array(fan, dtype=np.int64)])


def build_tshirt() -> tuple[trimesh.Trimesh, dict]:
    """Torso + shoulder yoke + collar + two sleeves, all in centimetres."""
    hem_y, shoulder_y = 0.0, 66.0
    ys = np.linspace(hem_y, shoulder_y, N_RINGS)
    half_w = interp([(0, 25.5), (12, 25.0), (34, 25.6), (50, 26.0),
                     (58, 25.2), (63, 23.0), (66, 20.5)], ys)
    half_d = interp([(0, 7.8), (20, 8.3), (48, 9.2), (60, 8.6), (66, 6.8)], ys)

    rings = [superellipse_ring(w, d, y) for w, d, y in zip(half_w, half_d, ys)]
    verts = np.vstack(rings)
    faces = grid_faces(N_RINGS, N_THETA)

    # Shoulder yoke: torso rim -> neck opening, two rings so it reads as a slope.
    neck_r, neck_d, neck_y = 9.4, 7.4, 70.6
    yoke = []
    for t, y in ((0.55, 68.4), (1.0, neck_y)):
        w = 20.5 + (neck_r - 20.5) * t
        d = 6.8 + (neck_d - 6.8) * t
        yoke.append(superellipse_ring(w, d, y))
    top_rim = verts[-N_THETA:]
    yoke_verts = np.vstack(yoke)
    yoke_faces = grid_faces(3, N_THETA) + (len(verts) - N_THETA)
    verts = np.vstack([verts, yoke_verts])
    faces = np.vstack([faces, yoke_faces])
    assert top_rim.shape[0] == N_THETA

    # Hem cap (never seen, but keeps the mesh closed for inspection tooling).
    hub = len(verts)
    verts = np.vstack([verts, np.array([[0.0, hem_y, 0.0]])])
    hem = [[(i + 1) % N_THETA, i, hub] for i in range(N_THETA)]
    faces = np.vstack([faces, np.array(hem, dtype=np.int64)])

    # Sleeves, angled down and out from the shoulder line.
    for side in (-1, 1):
        root = np.array([side * 21.0, 60.0, 0.0])
        direction = np.array([side * 1.0, -0.62, 0.0])
        sv, sf = sleeve(side, root, direction, length=21.0, r_root=11.2, r_cuff=8.8)
        faces = np.vstack([faces, sf + len(verts)])
        verts = np.vstack([verts, sv])

    shirt = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    shirt.fix_normals()

    collar_rings = [
        superellipse_ring(neck_r, neck_d, neck_y),
        superellipse_ring(neck_r + 1.0, neck_d + 0.9, neck_y + 1.1),
        superellipse_ring(neck_r + 0.4, neck_d + 0.35, neck_y + 2.0),
    ]
    collar = trimesh.Trimesh(
        vertices=np.vstack(collar_rings),
        faces=grid_faces(3, N_THETA),
        process=False,
    )
    collar.fix_normals()

    return shirt, {"chest_box": {"x": (-14.0, 14.0), "y": (36.0, 62.0)}, "collar": collar}


def cotton(name: str, colour: list[int]) -> PBRMaterial:
    return PBRMaterial(name=name, baseColorFactor=colour,
                       roughnessFactor=0.92, metallicFactor=0.0)


def split_chest(shirt: trimesh.Trimesh, box: dict) -> np.ndarray:
    """Faces of the printable chest panel.

    Selected by the torso's own (ring, column) grid rather than by a raw
    centroid test, and regularised to a contiguous block. A centroid test alone
    leaves a sawtooth boundary, which shows up as a ragged UV footprint, a
    ragged dieline outline and — most visibly — a ragged highlight when the
    customer hovers the panel.
    """
    centroids = shirt.triangles_center
    normals = shirt.face_normals
    (x0, x1), (y0, y1) = box["x"], box["y"]
    rough = (
        (normals[:, 2] > 0.35)
        & (centroids[:, 0] > x0) & (centroids[:, 0] < x1)
        & (centroids[:, 1] > y0) & (centroids[:, 1] < y1)
    )

    torso_faces = 2 * (N_RINGS - 1) * N_THETA
    quad = np.arange(len(rough)) // 2
    ring = quad // N_THETA
    column = quad % N_THETA
    is_torso = np.arange(len(rough)) < torso_faces
    picked = rough & is_torso
    if not picked.any():
        return picked

    r0, r1 = int(ring[picked].min()), int(ring[picked].max())
    # Longest contiguous column run in the ring that has the most coverage.
    counts = np.bincount(ring[picked], minlength=N_RINGS)
    reference = int(counts.argmax())
    present = np.zeros(N_THETA, dtype=bool)
    present[column[picked & (ring == reference)]] = True
    best_start, best_len, start, length = 0, 0, None, 0
    for c in range(N_THETA):
        if present[c]:
            if start is None:
                start, length = c, 0
            length += 1
            if length > best_len:
                best_start, best_len = start, length
        else:
            start, length = None, 0
    c0, c1 = best_start, best_start + best_len - 1

    return is_torso & (ring >= r0) & (ring <= r1) & (column >= c0) & (column <= c1)


def build(garment_id: str) -> None:
    shirt, meta = build_tshirt()
    chest_mask = split_chest(shirt, meta["chest_box"])
    if chest_mask.sum() < 50:
        raise SystemExit(f"chest selection is too small ({chest_mask.sum()} faces)")

    chest = shirt.submesh([np.where(chest_mask)[0]], append=True, repair=False)
    body = shirt.submesh([np.where(~chest_mask)[0]], append=True, repair=False)
    chest.visual = trimesh.visual.TextureVisuals(material=cotton("CHEST_mat", [255, 255, 255, 255]))
    body.visual = trimesh.visual.TextureVisuals(material=cotton("BODY_mat", [255, 255, 255, 255]))
    meta["collar"].visual = trimesh.visual.TextureVisuals(
        material=cotton("COLLAR_mat", [244, 244, 244, 255]))

    scene = trimesh.Scene({"CHEST": chest, "BODY": body, "COLLAR": meta["collar"]})
    out_dir = HERE / "products" / garment_id
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.export(out_dir / "source.glb")

    extents = scene.bounds[1] - scene.bounds[0]
    manifest = {
        "id": garment_id,
        "name": "Classic T-Shirt (unisex, M)",
        "source": "source.glb",
        "sourceNote": "parametric garment generated by tools/generate_garments.py",
        "physical": {
            "reference": {"extent": "y", "cm": round(float(extents[1]), 2)},
            "note": "modelled in centimetres; reference equals measured extent (cmPerUnit=1)",
        },
        "template": {"pxPerCm": 40},
        "cameraDistanceScale": 0.78,
        "materialProfile": "cotton-fabric",
        "modelYOffset": -round(float(scene.bounds[0][1] + extents[1] / 2), 2),
        "regions": [
            {
                "id": "front-chest",
                "label": "Front chest",
                "customizable": True,
                "meshName": "FRONT_CHEST",
                "select": {"by": "nodes", "nodes": ["CHEST"]},
                "strategy": {"type": "planar", "axis": "z"},
                # A garment panel can be printed or embroidered; packaging
                # surfaces omit this and keep the print-only control set.
                "renderModes": ["print", "embroidery"],
            },
            {
                "id": "garment",
                "label": "Garment",
                "customizable": False,
                "select": {"by": "rest"},
            },
        ],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{garment_id}: {len(shirt.faces)} faces "
          f"({int(chest_mask.sum())} chest) "
          f"extent {np.round(extents, 2).tolist()} cm -> {out_dir}")


GARMENTS = {"tshirt": build}

if __name__ == "__main__":
    ids = sys.argv[1:] or list(GARMENTS)
    for gid in ids:
        GARMENTS[gid](gid)
