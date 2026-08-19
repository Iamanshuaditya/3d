"""Headless Blender: import GLB, dump UV/material info, render checker from 6 views.

blender -b -P blender_checker_render.py -- <model.glb> <checker.png> <outdir>
"""
import json
import math
import sys
from pathlib import Path

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
MODEL, CHECKER, OUTDIR = Path(argv[0]), Path(argv[1]), Path(argv[2])
OUTDIR.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(MODEL))

info = {"objects": []}
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for o in meshes:
    me = o.data
    info["objects"].append({
        "name": o.name,
        "mesh": me.name,
        "verts": len(me.vertices),
        "polys": len(me.polygons),
        "uv_layers": [uv.name for uv in me.uv_layers],
        "active_uv": me.uv_layers.active.name if me.uv_layers.active else None,
        "materials": [m.name if m else None for m in me.materials],
        "custom_props": dict(o.items()) and {k: str(v) for k, v in o.items() if not k.startswith("_")},
    })
info["images"] = [
    {"name": im.name, "size": list(im.size), "filepath": im.filepath}
    for im in bpy.data.images if im.name != "Render Result"
]
(OUTDIR / "blender-info.json").write_text(json.dumps(info, indent=2))
print("BLENDER-INFO:", json.dumps(info))

# Replace all materials with an emission checker using the ACTIVE (original) UV.
checker = bpy.data.images.load(str(CHECKER))
mat = bpy.data.materials.new("CheckerDiag")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = checker
emit = nt.nodes.new("ShaderNodeEmission")
out = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
for o in meshes:
    o.data.materials.clear()
    o.data.materials.append(mat)

# Frame all objects with an orthographic-ish camera from 6 directions.
xs, ys, zs = [], [], []
for o in meshes:
    for corner in o.bound_box:
        world = o.matrix_world @ __import__("mathutils").Vector(corner)
        xs.append(world.x); ys.append(world.y); zs.append(world.z)
center = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2)
radius = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))

cam_data = bpy.data.cameras.new("Cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = radius * 1.25
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "FLAT"
scene.display.shading.color_type = "TEXTURE"
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.film_transparent = True

views = {
    "front": (0, -1, 0), "back": (0, 1, 0),
    "left": (-1, 0, 0), "right": (1, 0, 0),
    "top": (0, 0, 1), "bottom": (0, 0, -1),
}
from mathutils import Vector
for name, direction in views.items():
    d = Vector(direction)
    cam.location = Vector(center) + d * radius * 3
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = d.to_track_quat("Z", "Y")
    scene.render.filepath = str(OUTDIR / f"checker-{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name)
