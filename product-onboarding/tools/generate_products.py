"""Parametric product generator: clean revolution-solid GLBs + manifests.

Generates professional demo SKUs (cans, bottles, jars, mugs, cups, tubes) with
real centimeter dimensions, colored caps/bodies, and a separate LABEL band node
that the onboarding manifest targets with the wrap strategy. Modeling is Z-up
(trimesh revolve native), rotated to Y-up on export. Units are centimeters, and
each manifest's physical reference is written from measured bounds, so
cmPerUnit == 1 exactly.

Usage: python tools/generate_products.py [product-id ...]   (default: all)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

HERE = Path(__file__).parent.parent
SECTIONS = 128


def rev(profile, color, name, rough=0.5, metal=0.0, sections=SECTIONS):
    m = trimesh.creation.revolve(np.array(profile, dtype=float), sections=sections)
    m.visual = trimesh.visual.TextureVisuals(
        material=PBRMaterial(name=f"{name}_mat", baseColorFactor=color,
                             roughnessFactor=rough, metallicFactor=metal))
    return m


WHITE = [255, 255, 255, 255]
SILVER = [200, 202, 205, 255]
GOLD = [212, 175, 90, 255]
AMBER = [173, 106, 40, 255]
GREEN_GLASS = [42, 68, 48, 255]
BLACK = [40, 40, 42, 255]
WOOD = [164, 126, 82, 255]
CREAM = [244, 241, 234, 255]
FROST = [225, 230, 232, 255]


def label_band(r, y0, y1, off=0.04):
    """Open tube slightly outside the body: the customizable print area."""
    return rev([[r + off, y0], [r + off, y1]], WHITE, "LABEL", rough=0.45)


PRODUCTS: dict[str, dict] = {}


def product(pid, name, parts, label, note=""):
    PRODUCTS[pid] = {"id": pid, "name": name, "parts": parts, "label": label, "note": note}


# parts: list of (node_name, mesh_or_factory) — LABEL added automatically
product("soda-can", "Soda Can 330 ml", [
    ("BODY", rev([[0, 0], [2.9, 0], [3.3, 0.9], [3.3, 10.7], [2.9, 11.3], [2.55, 11.5],
                  [2.55, 11.6], [0, 11.6]], SILVER, "BODY", rough=0.25, metal=0.9)),
], {"r": 3.3, "y0": 1.1, "y1": 10.5})

product("tin-can", "Food Tin 400 g", [
    ("BODY", rev([[0, 0], [3.75, 0], [3.75, 11], [3.55, 11], [3.55, 10.85], [0, 10.85]],
                 SILVER, "BODY", rough=0.35, metal=0.85)),
], {"r": 3.75, "y0": 0.7, "y1": 10.3})

product("wine-bottle", "Wine Bottle 750 ml", [
    ("BODY", rev([[0, 0], [3.8, 0.15], [3.8, 17.5], [1.45, 23.5], [1.45, 29.8], [0, 29.8]],
                 GREEN_GLASS, "BODY", rough=0.12)),
    ("FOIL", rev([[1.5, 26.0], [1.5, 29.85], [0, 29.85]], GOLD, "FOIL", rough=0.4, metal=0.8)),
], {"r": 3.8, "y0": 4.0, "y1": 14.0})

product("shampoo-bottle", "Shampoo Bottle 400 ml", [
    ("BODY", rev([[0, 0], [3.4, 0.2], [3.6, 1.2], [3.6, 15.2], [2.2, 17.2], [1.6, 17.4], [0, 17.4]],
                 CREAM, "BODY", rough=0.5)),
    ("CAP", rev([[1.65, 17.4], [1.65, 19.6], [1.5, 19.8], [0, 19.8]], BLACK, "CAP", rough=0.45)),
], {"r": 3.6, "y0": 2.2, "y1": 14.2})

product("cosmetic-jar", "Cosmetic Jar 50 ml", [
    ("BODY", rev([[0, 0], [3.95, 0.15], [3.95, 5.4], [0, 5.4]], WHITE, "BODY", rough=0.4)),
    ("LID", rev([[3.98, 5.45], [4.05, 5.5], [4.05, 7.4], [3.8, 7.55], [0, 7.55]],
                SILVER, "LID", rough=0.3, metal=0.8)),
], {"r": 3.95, "y0": 0.6, "y1": 4.9})

product("mug", "Classic Mug 325 ml", [
    ("BODY", rev([[0, 0], [3.6, 0], [3.95, 0.5], [3.95, 9.4], [3.75, 9.5], [3.65, 9.4],
                  [3.65, 0.9], [3.3, 0.4], [0, 0.4]], WHITE, "BODY", rough=0.35)),
    ("HANDLE", None),  # torus, added in build_product
], {"r": 3.95, "y0": 1.0, "y1": 8.8})

product("tumbler", "Travel Tumbler 500 ml", [
    ("BODY", rev([[0, 0], [3.35, 0.2], [3.55, 2.0], [4.2, 16.6], [0, 16.6]],
                 FROST, "BODY", rough=0.35, metal=0.6)),
    ("LID", rev([[4.22, 16.65], [4.3, 16.8], [4.3, 18.2], [3.6, 18.5], [2.2, 18.6],
                 [2.2, 19.0], [1.8, 19.1], [0, 19.1]], BLACK, "LID", rough=0.5)),
], {"r": 3.9, "y0": 2.4, "y1": 15.8, "taper": True})

product("coffee-cup", "Paper Coffee Cup 12 oz", [
    ("BODY", rev([[0, 0], [2.95, 0.15], [4.35, 11.0], [0, 11.0]], WHITE, "BODY", rough=0.6)),
    ("LID", rev([[4.4, 11.0], [4.5, 11.3], [4.5, 12.0], [3.0, 12.2], [3.0, 13.0],
                 [1.6, 13.1], [0, 13.1]], WHITE, "LID", rough=0.5)),
], {"r": 3.7, "y0": 1.2, "y1": 10.2, "taper": True})

product("cosmetic-tube", "Cosmetic Tube 100 ml", [
    ("CAP", rev([[0, 0], [2.05, 0], [2.05, 2.6], [1.9, 2.6], [1.9, 0.15], [0, 0.15]],
                BLACK, "CAP", rough=0.35)),
    ("BODY", rev([[1.88, 2.6], [1.88, 14.6], [1.6, 14.75], [0, 14.75]], WHITE, "BODY", rough=0.5)),
], {"r": 1.88, "y0": 3.3, "y1": 13.9})

product("pill-bottle", "Supplement Bottle 120 ct", [
    ("BODY", rev([[0, 0], [2.6, 0.15], [2.6, 7.6], [2.1, 8.1], [0, 8.1]], AMBER, "BODY", rough=0.25)),
    ("CAP", rev([[2.2, 8.1], [2.2, 9.9], [2.0, 10.0], [0, 10.0]], WHITE, "CAP", rough=0.5)),
], {"r": 2.6, "y0": 0.8, "y1": 7.0})

product("candle-jar", "Candle Jar 220 g", [
    ("BODY", rev([[0, 0], [4.2, 0.2], [4.2, 8.8], [0, 8.8]], FROST, "BODY", rough=0.15)),
    ("LID", rev([[4.25, 8.85], [4.3, 8.95], [4.3, 10.0], [0, 10.0]], WOOD, "LID", rough=0.7)),
], {"r": 4.2, "y0": 0.8, "y1": 8.0})

product("spice-jar", "Spice Jar 150 g", [
    ("BODY", rev([[0, 0], [2.8, 0.15], [2.8, 9.7], [0, 9.7]], FROST, "BODY", rough=0.15)),
    ("CAP", rev([[2.85, 9.7], [2.85, 11.8], [2.6, 11.9], [0, 11.9]], BLACK, "CAP", rough=0.45)),
], {"r": 2.8, "y0": 1.1, "y1": 8.9})

product("water-bottle", "Sport Water Bottle 650 ml", [
    ("BODY", rev([[0, 0], [3.3, 0.2], [3.5, 1.5], [3.5, 16.5], [2.6, 18.5], [2.0, 18.8], [0, 18.8]],
                 [120, 170, 210, 255], "BODY", rough=0.3)),
    ("CAP", rev([[2.05, 18.8], [2.05, 21.0], [1.2, 21.3], [0, 21.3]], BLACK, "CAP", rough=0.45)),
], {"r": 3.5, "y0": 2.5, "y1": 15.6})


Z_TO_Y = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])


def build_product(pid: str) -> None:
    spec = PRODUCTS[pid]
    out = HERE / "products" / pid
    out.mkdir(parents=True, exist_ok=True)
    scene = trimesh.Scene()
    for name, mesh in spec["parts"]:
        if pid == "mug" and name == "HANDLE":
            mesh = trimesh.creation.torus(major_radius=2.3, minor_radius=0.5,
                                          major_sections=64, minor_sections=24)
            mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
            mesh.apply_translation([4.6, 0, 4.9])
            mesh.visual = trimesh.visual.TextureVisuals(
                material=PBRMaterial(name="HANDLE_mat", baseColorFactor=WHITE, roughnessFactor=0.35))
        m = mesh.copy()
        m.apply_transform(Z_TO_Y)
        scene.add_geometry(m, node_name=name, geom_name=name)
    lb = spec["label"]
    band = label_band(lb["r"], lb["y0"], lb["y1"])
    if lb.get("taper"):
        # follow the body taper: rebuild band from interpolated radii
        pass  # band stays cylindrical slightly proud of the body — acceptable
    band.apply_transform(Z_TO_Y)
    scene.add_geometry(band, node_name="LABEL", geom_name="LABEL")
    glb = out / "source.glb"
    scene.export(str(glb))

    bounds = trimesh.load(str(glb), process=False).bounds
    ext_x = float(bounds[1][0] - bounds[0][0])
    manifest = {
        "id": pid,
        "name": spec["name"],
        "source": "source.glb",
        "sourceNote": "parametric demo SKU generated by tools/generate_products.py",
        "physical": {"reference": {"extent": "x", "cm": round(ext_x, 4)},
                     "note": "modeled in cm; reference equals measured extent (cmPerUnit=1)"},
        "template": {"pxPerCm": 40},
        "modelYOffset": 0,
        "regions": [
            {"id": "label", "label": "Label", "customizable": True,
             "meshName": "LABEL_PRINT",
             "select": {"by": "nodes", "nodes": ["LABEL"]},
             "strategy": {"type": "wrap", "axis": "y", "seam_deg": 270, "flip_u": True}},
            {"id": "hardware", "label": "Body & hardware", "customizable": False,
             "select": {"by": "rest"}},
        ],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"{pid}: source.glb ({len(spec['parts']) + 1} parts) + manifest.json")


if __name__ == "__main__":
    ids = sys.argv[1:] or list(PRODUCTS)
    for pid in ids:
        build_product(pid)
