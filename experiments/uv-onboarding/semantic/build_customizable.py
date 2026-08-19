"""Stages 6-8: semantic split + CUSTOMIZATION_UV + preserved original data.

blender -b -P build_customizable.py -- <raw_meshy.glb> <outdir>

Output: <outdir>/product-customizable.glb with
  FRONT_PRINT / BACK_PRINT / BOTTOM_PRINT named meshes,
  TEXCOORD_0 = CUSTOMIZATION_UV (production-web dieline projection),
  TEXCOORD_1 = ORIGINAL_UV (Meshy atlas, still valid for the bundled texture),
  debris components (<=100 faces) removed.
Also writes regions.json face-count summary.
"""
import json
import sys
from pathlib import Path

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
MODEL, OUT = Path(argv[0]), Path(argv[1])
OUT.mkdir(parents=True, exist_ok=True)

# Production web layout (must match src/lib/configurator/product-config.ts
# "film" surface: 57.4cm x 16cm, sections front 24cm / gusset 9cm / back 24cm).
BLEED_MM = 2.0
PANEL_MM = 240.0
GUSSET_MM = 90.0
TOTAL_MM = BLEED_MM * 2 + PANEL_MM * 2 + GUSSET_MM
FRONT_START = BLEED_MM
BOTTOM_START = FRONT_START + PANEL_MM
BACK_START = BOTTOM_START + GUSSET_MM
DEBRIS_MAX_FACES = 100

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(MODEL))
src = next(o for o in bpy.data.objects if o.type == "MESH")
me = src.data
me.calc_loop_triangles()

n_tris = len(me.loop_triangles)
tri_verts = np.empty((n_tris, 3), dtype=np.int64)
me.loop_triangles.foreach_get("vertices", tri_verts.ravel())
tri_loops = np.empty((n_tris, 3), dtype=np.int64)
me.loop_triangles.foreach_get("loops", tri_loops.ravel())
n_verts = len(me.vertices)
verts = np.empty((n_verts, 3), dtype=np.float64)
me.vertices.foreach_get("co", verts.ravel())
vnorm = np.empty((n_verts, 3), dtype=np.float64)
me.vertices.foreach_get("normal", vnorm.ravel())
orig_uv_layer = me.uv_layers[0]
loops_uv = np.empty((len(orig_uv_layer.data), 2), dtype=np.float64)
orig_uv_layer.data.foreach_get("uv", loops_uv.ravel())
orig_tex_image = next((im for im in bpy.data.images if im.name != "Render Result"), None)

# ---- connected components (union-find over shared vertex edges)
parent = np.arange(n_tris)
def find(x):
    root = x
    while parent[root] != root:
        root = parent[root]
    while parent[x] != root:
        parent[x], x = root, parent[x]
    return root

from collections import defaultdict
edge_owner = {}
for fi in range(n_tris):
    a, b, c = tri_verts[fi]
    for e in ((a, b) if a < b else (b, a), (b, c) if b < c else (c, b), (a, c) if a < c else (c, a)):
        if e in edge_owner:
            ra, rb = find(edge_owner[e]), find(fi)
            if ra != rb:
                parent[rb] = ra
        else:
            edge_owner[e] = fi
roots = np.array([find(i) for i in range(n_tris)])
_, labels, counts = np.unique(roots, return_inverse=True, return_counts=True)
keep_mask = counts[labels] > DEBRIS_MAX_FACES
print(f"debris removed: {int((~keep_mask).sum())} tris in {int((counts <= DEBRIS_MAX_FACES).sum())} components")

# ---- semantic classification (port of scripts/prepare-meshy-pouch.mjs).
# glTF import converts Y-up to Blender Z-up: gltf(y_up) -> blender z, gltf z -> -y.
p = verts[tri_verts]                       # (n,3,3) blender coords
centroid = p.mean(axis=1)
face_n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
avg_vn = vnorm[tri_verts].mean(axis=1)
gy = verts[:, 2]                            # gltf Y (height) == blender Z
min_y, max_y = gy.min(), gy.max()
span_y = max_y - min_y
gx = verts[:, 0]
min_x, max_x = gx.min(), gx.max()
span_x = max_x - min_x
gz = -verts[:, 1]                           # gltf Z (depth) == -blender Y
min_z, max_z = gz.min(), gz.max()
span_z = max_z - min_z

c_y = centroid[:, 2]
c_z = -centroid[:, 1]
f_abs = np.abs(face_n)
face_x, face_y, face_z = f_abs[:, 0], f_abs[:, 2], f_abs[:, 1]
avg_ny = avg_vn[:, 2]
avg_nz = -avg_vn[:, 1]

is_bottom = (
    (c_y < min_y + span_y * 0.22)
    & (face_y > face_z * 0.7)
    & (face_y > face_x * 0.55)
    & (avg_ny < -0.08)
)
normal_front = np.where(np.abs(avg_nz) > 0.035, avg_nz > 0, c_z >= 0)
region_of_tri = np.where(is_bottom, 2, np.where(normal_front, 0, 1))  # 0=front 1=back 2=bottom

REGIONS = [
    {"id": "front_print", "mesh": "FRONT_PRINT", "code": 0},
    {"id": "back_print", "mesh": "BACK_PRINT", "code": 1},
    {"id": "bottom_gusset", "mesh": "BOTTOM_PRINT", "code": 2},
]

def customization_uv(region_code, vx, vy, vz):
    """Vectorized port of projectedUv() from prepare-meshy-pouch.mjs."""
    v = 1 - (vx - min_x) / span_x
    if region_code == 0:
        u = (FRONT_START + (vy - min_y) / span_y * PANEL_MM) / TOTAL_MM
    elif region_code == 1:
        u = (BACK_START + (max_y - vy) / span_y * PANEL_MM) / TOTAL_MM
    else:
        u = (BOTTOM_START + (max_z - vz) / span_z * GUSSET_MM) / TOTAL_MM
    return np.stack([u, v], axis=-1)

out_objects = []
summary = []
for region in REGIONS:
    tri_ids = np.where((region_of_tri == region["code"]) & keep_mask)[0]
    corner_verts = tri_verts[tri_ids].ravel()
    corner_loops = tri_loops[tri_ids].ravel()
    uniq, inverse = np.unique(corner_verts, return_inverse=True)
    new_faces = inverse.reshape(-1, 3)
    new_verts = verts[uniq]

    new_me = bpy.data.meshes.new(region["mesh"])
    new_me.from_pydata(new_verts.tolist(), [], new_faces.tolist())
    new_me.validate()

    # CUSTOMIZATION_UV first so it exports as TEXCOORD_0.
    cust = new_me.uv_layers.new(name="CUSTOMIZATION_UV")
    vx, vy, vz = new_verts[:, 0], new_verts[:, 2], -new_verts[:, 1]
    per_vert_uv = customization_uv(region["code"], vx, vy, vz)
    loop_vert = np.empty(len(new_me.loops), dtype=np.int64)
    new_me.loops.foreach_get("vertex_index", loop_vert)
    cust.data.foreach_set("uv", per_vert_uv[loop_vert].ravel())

    # ORIGINAL_UV second (per-corner data survives via source loops).
    orig = new_me.uv_layers.new(name="ORIGINAL_UV")
    orig.data.foreach_set("uv", loops_uv[corner_loops].ravel())

    # Smooth shading so the exporter can weld vertices instead of splitting
    # every corner for flat normals (which tripled file size).
    new_me.polygons.foreach_set("use_smooth", np.ones(len(new_me.polygons), dtype=bool))

    mat = bpy.data.materials.new(f"Laminate {region['id']}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.26
    bsdf.inputs["Metallic"].default_value = 0.04
    if orig_tex_image is not None:
        # Bundle the original Meshy texture, sampled via ORIGINAL_UV, so the
        # asset still renders "as scanned" in a plain glTF viewer. The
        # configurator replaces this map with its CanvasTexture on TEXCOORD_0.
        nt = mat.node_tree
        tex_node = nt.nodes.new("ShaderNodeTexImage")
        tex_node.image = orig_tex_image
        uv_node = nt.nodes.new("ShaderNodeUVMap")
        uv_node.uv_map = "ORIGINAL_UV"
        nt.links.new(uv_node.outputs["UV"], tex_node.inputs["Vector"])
        nt.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    new_me.materials.append(mat)

    obj = bpy.data.objects.new(region["mesh"], new_me)
    obj["printSurface"] = region["id"]
    bpy.context.collection.objects.link(obj)
    out_objects.append(obj)
    summary.append({"id": region["id"], "mesh": region["mesh"], "tris": int(len(tri_ids))})

# Remove source object, export only the three print meshes.
bpy.data.objects.remove(src)
for o in out_objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(OUT / "product-customizable.glb"),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_normals=True,
    export_texcoords=True,
)
(OUT / "build-summary.json").write_text(json.dumps({
    "regions": summary,
    "web_mm": {"total": TOTAL_MM, "front_start": FRONT_START,
                "bottom_start": BOTTOM_START, "back_start": BACK_START,
                "panel": PANEL_MM, "gusset": GUSSET_MM, "bleed": BLEED_MM},
}, indent=2))
print("EXPORTED", OUT / "product-customizable.glb", summary)
