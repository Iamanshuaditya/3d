"""Parametric generator for articulated GLB products.

Produces a folding countertop display: a base plate, an upright back panel,
a tilted header card and two side wings that fold in. Everything is authored
in its ASSEMBLED pose — the pose the customer should see first — with node
transforms left at identity, so hinge pivots and axes are plain world
coordinates that a person can read off the model.

This is the reference case for `GlbArticulationSpec`: a product whose parts are
real 3D shapes rather than a flat dieline, and which therefore cannot be
expressed as a procedural carton, but which still folds flat for shipping.

Usage: python tools/generate_displays.py [display-id ...]   (default: all)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

HERE = Path(__file__).parent.parent

# Dimensions in centimetres. Modelled in cm so cmPerUnit == 1 exactly.
BASE_W, BASE_D, BOARD = 26.0, 16.0, 0.4
BACK_W, BACK_H = 26.0, 30.0
HEADER_W, HEADER_H = 30.0, 12.0
WING_W = 8.0
HEADER_TILT_DEG = 12.0
WING_FOLD_DEG = 55.0
# The print plate stands just proud of its board, the same way the parametric
# label bands do — no z-fighting, no decal offset to tune.
PROUD = 0.03


def board(name: str, size, colour, rough=0.82) -> trimesh.Trimesh:
    mesh = trimesh.creation.box(extents=size)
    mesh.visual = trimesh.visual.TextureVisuals(
        material=PBRMaterial(name=f"{name}_mat", baseColorFactor=colour,
                             roughnessFactor=rough, metallicFactor=0.0))
    return mesh


def plate(name: str, width: float, height: float, colour) -> trimesh.Trimesh:
    """A single-sided print plate facing +Z.

    Deliberately not a thin box: a closed box gives a planar projection two
    coincident face sets, which the onboarding validator reports as 50% UV
    overlap with the rear set mirrored. One quad, one normal, no overlap.
    """
    vertices = np.array([
        [-width / 2, -height / 2, 0.0],
        [width / 2, -height / 2, 0.0],
        [width / 2, height / 2, 0.0],
        [-width / 2, height / 2, 0.0],
    ], dtype=float)
    mesh = trimesh.Trimesh(vertices=vertices, faces=np.array([[0, 1, 2], [0, 2, 3]]), process=False)
    mesh.visual = trimesh.visual.TextureVisuals(
        material=PBRMaterial(name=f"{name}_mat", baseColorFactor=colour,
                             roughnessFactor=0.55, metallicFactor=0.0))
    return mesh


def placed(mesh: trimesh.Trimesh, pivot, offset, axis=None, angle_deg=0.0):
    """Position a part at `pivot + offset`, optionally rotated about `pivot`."""
    transform = np.eye(4)
    transform[:3, 3] = np.asarray(pivot, dtype=float) + np.asarray(offset, dtype=float)
    if axis is not None and angle_deg:
        rotation = trimesh.transformations.rotation_matrix(
            np.deg2rad(angle_deg), np.asarray(axis, dtype=float), np.asarray(pivot, dtype=float))
        transform = rotation @ transform
    out = mesh.copy()
    out.apply_transform(transform)
    return out


KRAFT = [214, 196, 168, 255]
WHITE = [250, 249, 246, 255]
DARK = [92, 96, 104, 255]


def build_counter_display(display_id: str) -> None:
    # ---- geometry, all in the assembled pose --------------------------------
    base_pivot = (0.0, BOARD, -BASE_D / 2)          # back edge of the base plate
    back_centre_y = BOARD + BACK_H / 2
    back_z = -BASE_D / 2 + BOARD / 2

    parts: dict[str, tuple[trimesh.Trimesh, str]] = {}

    parts["BASE"] = (
        placed(board("BASE", (BASE_W, BOARD, BASE_D), KRAFT), (0, BOARD / 2, 0), (0, 0, 0)),
        "world",
    )
    parts["BACK_BOARD"] = (
        placed(board("BACK_BOARD", (BACK_W, BACK_H, BOARD), KRAFT),
               (0, back_centre_y, back_z), (0, 0, 0)),
        "BACK",
    )
    parts["BACK_FACE"] = (
        placed(plate("BACK_FACE", BACK_W - 1.0, BACK_H - 1.0, WHITE),
               (0, back_centre_y, back_z + BOARD / 2 + PROUD), (0, 0, 0)),
        "BACK",
    )

    header_pivot = (0.0, BOARD + BACK_H, back_z)
    header_offset = (0.0, HEADER_H / 2, 0.0)
    parts["HEADER_BOARD"] = (
        placed(board("HEADER_BOARD", (HEADER_W, HEADER_H, BOARD), KRAFT),
               header_pivot, header_offset, (1, 0, 0), HEADER_TILT_DEG),
        "HEADER",
    )
    parts["HEADER_FACE"] = (
        placed(plate("HEADER_FACE", HEADER_W - 1.0, HEADER_H - 1.0, WHITE),
               header_pivot, (0.0, HEADER_H / 2, BOARD / 2 + PROUD), (1, 0, 0), HEADER_TILT_DEG),
        "HEADER",
    )

    # Rotating the left-hand offset (-x) about +Y by a POSITIVE angle swings it
    # toward +z, i.e. forward past the base — which is the way a counter
    # display's wings close. The right-hand wing is the mirror of that.
    wing_fold = {"WING_LEFT": WING_FOLD_DEG, "WING_RIGHT": -WING_FOLD_DEG}
    for side, name in ((-1, "WING_LEFT"), (1, "WING_RIGHT")):
        pivot = (side * BACK_W / 2, back_centre_y, back_z)
        parts[f"{name}_BOARD"] = (
            placed(board(f"{name}_BOARD", (WING_W, BACK_H - 2.0, BOARD), DARK),
                   pivot, (side * WING_W / 2, 0, 0), (0, 1, 0), wing_fold[name]),
            name,
        )

    scene = trimesh.Scene()
    # Group nodes carry the hinges; the rigger inserts its rotation above them,
    # and the model's own nesting is what makes a wing follow the back panel.
    for group, parent in (("BACK", "world"), ("HEADER", "BACK"),
                          ("WING_LEFT", "BACK"), ("WING_RIGHT", "BACK")):
        scene.graph.update(frame_to=group, frame_from=parent, matrix=np.eye(4))
    for name, (mesh, parent) in parts.items():
        scene.add_geometry(mesh, node_name=name, parent_node_name=parent)

    out_dir = HERE / "products" / display_id
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.export(out_dir / "source.glb")

    extents = scene.bounds[1] - scene.bounds[0]
    articulation = {
        "mode": "glb-nodes",
        "hinges": [
            {
                "nodeName": "BACK",
                "parentNodeName": None,
                "axis": [1, 0, 0],
                "pivot": [round(v, 4) for v in base_pivot],
                "assembledAngleDeg": 0,
                "flatAngleDeg": -90,
            },
            {
                "nodeName": "HEADER",
                "parentNodeName": "BACK",
                "axis": [1, 0, 0],
                "pivot": [round(v, 4) for v in header_pivot],
                "assembledAngleDeg": 0,
                "flatAngleDeg": -HEADER_TILT_DEG,
            },
            {
                "nodeName": "WING_LEFT",
                "parentNodeName": "BACK",
                "axis": [0, 1, 0],
                "pivot": [round(-BACK_W / 2, 4), round(back_centre_y, 4), round(back_z, 4)],
                "assembledAngleDeg": 0,
                "flatAngleDeg": -WING_FOLD_DEG,
            },
            {
                "nodeName": "WING_RIGHT",
                "parentNodeName": "BACK",
                "axis": [0, 1, 0],
                "pivot": [round(BACK_W / 2, 4), round(back_centre_y, 4), round(back_z, 4)],
                "assembledAngleDeg": 0,
                "flatAngleDeg": WING_FOLD_DEG,
            },
        ],
        # Construction order is a fact about the product: the wings and header
        # have to come in before the back panel can lie down.
        "sequence": [
            {"id": "header", "label": "Fold the header down", "hingeIds": ["HEADER"], "to": "flat"},
            {"id": "wings", "label": "Fold in the side wings",
             "hingeIds": ["WING_LEFT", "WING_RIGHT"], "to": "flat"},
            {"id": "back", "label": "Lay the display flat", "hingeIds": ["BACK"], "to": "flat"},
        ],
    }

    manifest = {
        "id": display_id,
        "name": "Folding Counter Display",
        "source": "source.glb",
        "sourceNote": "parametric display generated by tools/generate_displays.py",
        "physical": {
            "reference": {"extent": "y", "cm": round(float(extents[1]), 2)},
            "note": "modelled in centimetres; reference equals measured extent (cmPerUnit=1)",
        },
        "template": {"pxPerCm": 24},
        "materialProfile": "standard",
        "modelYOffset": -round(float(scene.bounds[0][1] + extents[1] / 2), 2),
        "cameraDistanceScale": 1.15,
        "articulation": articulation,
        "regions": [
            {
                "id": "back-panel", "label": "Back panel", "customizable": True,
                "meshName": "BACK_PRINT",
                "select": {"by": "nodes", "nodes": ["BACK_FACE"]},
                "strategy": {"type": "planar", "axis": "z"},
            },
            {
                "id": "header-card", "label": "Header card", "customizable": True,
                "meshName": "HEADER_PRINT",
                "select": {"by": "nodes", "nodes": ["HEADER_FACE"]},
                "strategy": {"type": "planar", "axis": "z"},
            },
            {"id": "structure", "label": "Structure", "customizable": False,
             "select": {"by": "rest"}},
        ],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{display_id}: {len(parts)} parts, extent "
          f"{np.round(extents, 2).tolist()} cm -> {out_dir}")


DISPLAYS = {"counter-display": build_counter_display}

if __name__ == "__main__":
    for display_id in (sys.argv[1:] or list(DISPLAYS)):
        DISPLAYS[display_id](display_id)
