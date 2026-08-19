"""Stage 3 variant A: Blender Smart UV Project on the cleaned pouch.

blender -b -P blender_smart_uv.py -- <clean.glb> <outdir>
Writes a second UV layer SMART_UV (original preserved), exports OBJ-style UV dump
as .npy for the shared chart/wireframe analyzer, plus timing stats.
"""
import json
import sys
import time
from pathlib import Path

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
MODEL, OUT = Path(argv[0]), Path(argv[1])
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(MODEL))
objs = [o for o in bpy.data.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]

me = objs[0].data
me.uv_layers.new(name="SMART_UV")
me.uv_layers.active = me.uv_layers["SMART_UV"]

t0 = time.time()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.003)
bpy.ops.object.mode_set(mode="OBJECT")
elapsed = time.time() - t0

# Dump loop UVs + triangle loop indices for external analysis
me.calc_loop_triangles()
uv_layer = me.uv_layers["SMART_UV"].data
loops_uv = np.empty((len(uv_layer), 2), dtype=np.float32)
uv_layer.foreach_get("uv", loops_uv.ravel())
tri_loops = np.empty((len(me.loop_triangles), 3), dtype=np.int64)
me.loop_triangles.foreach_get("loops", tri_loops.ravel())
tri_verts = np.empty((len(me.loop_triangles), 3), dtype=np.int64)
me.loop_triangles.foreach_get("vertices", tri_verts.ravel())
np.save(OUT / "smart_loops_uv.npy", loops_uv)
np.save(OUT / "smart_tri_loops.npy", tri_loops)
np.save(OUT / "smart_tri_verts.npy", tri_verts)
(OUT / "smart_stats.json").write_text(json.dumps({
    "seconds": round(elapsed, 1),
    "tris": len(me.loop_triangles),
    "loops": len(uv_layer),
}))
print("SMART-UV done", elapsed, "s")
