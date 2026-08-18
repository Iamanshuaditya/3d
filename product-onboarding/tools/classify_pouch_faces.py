"""Product-family heuristic: classify a stand-up-pouch mesh's faces into
front / back / bottom face sets for `by: "faces"` manifest selectors.

This encodes pouch-domain knowledge (validated in the first experiment):
outward normals split front/back; downward-facing faces in the lower band are
the gusset. It is an ALTERNATIVE to hand-labeling in the labeler UI for a
product family we onboard often — new families either get their own heuristic
or use the labeler.

Usage: python tools/classify_pouch_faces.py products/<id> [node]
Writes products/<id>/faces/{front,back,bottom}.json (triangle indices).
"""
import json
import sys
from pathlib import Path

import numpy as np
import trimesh

product_dir = Path(sys.argv[1])
node_arg = sys.argv[2] if len(sys.argv) > 2 else None

scene = trimesh.load(str(product_dir / "source.glb"), process=False)
node = node_arg or next(iter(scene.graph.nodes_geometry))
transform, gname = scene.graph[node]
m = scene.geometry[gname].copy()
m.apply_transform(transform)

pos = np.asarray(m.vertices)
faces = np.asarray(m.faces)
vnorm = np.asarray(m.vertex_normals)

p = pos[faces]
centroid = p.mean(axis=1)
face_n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
avg_vn = vnorm[faces].mean(axis=1)
f_abs = np.abs(face_n)

y = pos[:, 1]
min_y, span_y = y.min(), y.max() - y.min()

is_bottom = (
    (centroid[:, 1] < min_y + span_y * 0.22)
    & (f_abs[:, 1] > f_abs[:, 2] * 0.7)
    & (f_abs[:, 1] > f_abs[:, 0] * 0.55)
    & (avg_vn[:, 1] < -0.08)
)
normal_front = np.where(np.abs(avg_vn[:, 2]) > 0.035, avg_vn[:, 2] > 0, centroid[:, 2] >= 0)

out = {
    "front": np.where(~is_bottom & normal_front)[0],
    "back": np.where(~is_bottom & ~normal_front)[0],
    "bottom": np.where(is_bottom)[0],
}
(product_dir / "faces").mkdir(exist_ok=True)
for name, ids in out.items():
    (product_dir / "faces" / f"{name}.json").write_text(json.dumps(ids.tolist()))
    print(f"{name}: {len(ids)} faces")
print("node:", node)
