"""Manifest-driven builder: source.glb + manifest.json -> customization-ready GLB
plus regions.json, product.json, per-surface templates and diagnostic textures.

The GLB edit is surgical (pygltflib): only customizable regions' primitives are
rewritten (welded corners, TEXCOORD_0 = customization UV, TEXCOORD_1 = original
UV, original textures repointed at texCoord 1, node renamed to the region mesh
name). Everything else — geometry, materials, textures, hierarchy — passes
through byte-identical. No Blender in this path.

Layout modes (manifest "layout"):
  {"mode": "separate"}  (default) — each region gets its own 0-1 canvas /
                        editor tab. Right for physically separate print jobs.
  {"mode": "shared", "order": [region ids...]} — all regions packed side by
                        side into ONE continuous production web (single canvas,
                        like a flexible-film dieline). Regions' UVs land in
                        their slice of the shared 0-1 space; the configurator
                        gets one surface with sections and NO rotations.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
import pygltflib
import trimesh

from . import strategies as strat_mod

FLOAT = 5126
UINT32 = 5125


# ------------------------------------------------------------- glb utilities

class GlbEditor:
    def __init__(self, path: Path):
        self.gltf = pygltflib.GLTF2().load(str(path))
        self.blob = bytearray(self.gltf.binary_blob())

    def _append(self, data: bytes) -> int:
        pad = (4 - len(self.blob) % 4) % 4
        self.blob.extend(b"\0" * pad)
        offset = len(self.blob)
        self.blob.extend(data)
        view = pygltflib.BufferView(buffer=0, byteOffset=offset, byteLength=len(data))
        self.gltf.bufferViews.append(view)
        return len(self.gltf.bufferViews) - 1

    def add_accessor(self, array: np.ndarray, type_: str, component: int = FLOAT,
                     with_bounds: bool = False) -> int:
        arr = np.ascontiguousarray(array, dtype=np.float32 if component == FLOAT else np.uint32)
        view = self._append(arr.tobytes())
        acc = pygltflib.Accessor(
            bufferView=view, componentType=component,
            count=len(arr) if arr.ndim == 1 else arr.shape[0], type=type_)
        if with_bounds:
            acc.min = [float(v) for v in arr.min(axis=0)]
            acc.max = [float(v) for v in arr.max(axis=0)]
        self.gltf.accessors.append(acc)
        return len(self.gltf.accessors) - 1

    def read_accessor(self, index: int) -> np.ndarray:
        acc = self.gltf.accessors[index]
        view = self.gltf.bufferViews[acc.bufferView]
        comp = {5126: (np.float32, 4), 5125: (np.uint32, 4),
                5123: (np.uint16, 2), 5121: (np.uint8, 1)}[acc.componentType]
        n_comp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc.type]
        start = (view.byteOffset or 0) + (acc.byteOffset or 0)
        stride = view.byteStride or comp[1] * n_comp
        out = np.empty((acc.count, n_comp), dtype=comp[0])
        raw = memoryview(self.blob)
        for i in range(acc.count):
            off = start + i * stride
            out[i] = np.frombuffer(raw[off:off + comp[1] * n_comp], dtype=comp[0])
        return out.squeeze()

    def save(self, path: Path) -> None:
        self.gltf.buffers[0].byteLength = len(self.blob)
        self.gltf.set_binary_blob(bytes(self.blob))
        self.gltf.save(str(path))


def _retarget_textures(ed: GlbEditor, mat_idx: int) -> None:
    """Original textures must keep sampling the ORIGINAL uv, now at slot 1."""
    mat = ed.gltf.materials[mat_idx]
    for tex in [getattr(mat.pbrMetallicRoughness, "baseColorTexture", None),
                getattr(mat.pbrMetallicRoughness, "metallicRoughnessTexture", None),
                mat.normalTexture, mat.occlusionTexture, mat.emissiveTexture]:
        if tex is not None:
            tex.texCoord = 1


# ------------------------------------------------------------------- builder

def build(product_dir: Path) -> dict:
    manifest = json.loads((product_dir / "manifest.json").read_text())
    src = product_dir / manifest["source"]

    scene = trimesh.load(str(src), process=False)
    node_world = {}
    for node in scene.graph.nodes_geometry:
        transform, gname = scene.graph[node]
        node_world[node] = (np.asarray(transform), gname)

    ref = manifest["physical"]["reference"]
    ext = scene.bounds[1] - scene.bounds[0]
    cm_per_unit = ref["cm"] / float(ext[strat_mod.AXES[ref["extent"]]])

    ed = GlbEditor(src)
    node_by_name = {n.name: i for i, n in enumerate(ed.gltf.nodes)}

    layout = manifest.get("layout", {"mode": "separate"})
    shared = layout.get("mode") == "shared"

    regions_out = []
    pending = []                       # customizable regions awaiting write
    used_nodes: set[str] = set()
    claimed_faces: dict[str, list] = {}   # node -> [face-index arrays carved out]

    # ---------------- phase 1: select faces + compute per-region local UVs
    for region in manifest["regions"]:
        sel = region["select"]
        face_subset = None
        if sel["by"] == "rest":
            nodes = [n for n in node_world if n not in used_nodes]
        elif sel["by"] == "nodes":
            nodes = sel["nodes"]
        elif sel["by"] == "faces":
            nodes = [sel["node"]]
            face_subset = np.asarray(
                sel["faces"] if "faces" in sel
                else json.loads((product_dir / sel["facesFile"]).read_text()),
                dtype=np.int64)
        else:
            raise ValueError(f"unknown selector {sel['by']}")
        if face_subset is None:
            used_nodes.update(nodes)

        entry = {
            "id": region["id"],
            "label": region["label"],
            "customizable": region.get("customizable", False),
            "nodes": nodes,
        }
        regions_out.append(entry)
        if not region.get("customizable"):
            continue

        if len(nodes) != 1:
            raise NotImplementedError("one node per customizable region for now")
        node_name = nodes[0]
        transform, gname = node_world[node_name]
        geom = scene.geometry[gname]
        local_pos = np.asarray(geom.vertices)
        world_pos = trimesh.transform_points(local_pos, transform)
        faces = np.asarray(geom.faces)
        if face_subset is not None:
            faces = faces[face_subset]
            claimed_faces.setdefault(node_name, []).append(face_subset)
        node_idx = node_by_name[node_name]
        mesh_idx = ed.gltf.nodes[node_idx].mesh
        mesh = ed.gltf.meshes[mesh_idx]
        if len(mesh.primitives) != 1:
            raise NotImplementedError(
                f"node '{node_name}' has {len(mesh.primitives)} primitives; the "
                "exporter currently rewrites single-primitive meshes only. "
                "Split the mesh per material (e.g. in Blender) or extend "
                "build.py to iterate primitives.")
        prim = mesh.primitives[0]
        # Original UV from the RAW accessor: trimesh flips V on load, but
        # three.js consumes raw glTF values — raw space is the contract.
        existing_uv = (ed.read_accessor(prim.attributes.TEXCOORD_0)
                       if prim.attributes.TEXCOORD_0 is not None else None)

        cfg = dict(region["strategy"])
        stype = cfg.pop("type")
        fn = strat_mod.STRATEGIES[stype]
        if stype == "reuse_existing":
            corner_uv, meta = fn(world_pos, faces, cfg, cm_per_unit, existing_uv=existing_uv)
        else:
            corner_uv, meta = fn(world_pos, faces, cfg, cm_per_unit)

        w_cm = meta.get("physicalWidthCm") or region.get("physicalWidthCm")
        h_cm = meta.get("physicalHeightCm") or region.get("physicalHeightCm")
        if w_cm is None or h_cm is None:
            ext_world = world_pos.max(axis=0) - world_pos.min(axis=0)
            dims = sorted((float(v) * cm_per_unit for v in ext_world), reverse=True)
            w_cm = w_cm or round(dims[0], 2)
            h_cm = h_cm or round(dims[1], 2)
            meta["physicalDimsNote"] = ("estimated from mesh bounding box; supply "
                                        "physicalWidthCm/physicalHeightCm in the region "
                                        "manifest for exact print dimensions")

        pending.append({
            "region": region, "entry": entry, "face_subset": face_subset,
            "node_name": node_name, "transform": transform, "geom": geom,
            "local_pos": local_pos, "faces": faces, "existing_uv": existing_uv,
            "corner_uv": corner_uv, "meta": meta,
            "node_idx": node_idx, "mesh": mesh, "prim": prim,
            "w_cm": float(w_cm), "h_cm": float(h_cm),
        })

    # ---------------- phase 2: layout (shared web packs slices into one canvas)
    tmpl = manifest.get("template", {})
    if shared:
        order = layout.get("order") or [p["region"]["id"] for p in pending]
        by_id = {p["region"]["id"]: p for p in pending}
        ordered = [by_id[rid] for rid in order]
        total_w = sum(p["w_cm"] for p in ordered)
        total_h = max(p["h_cm"] for p in ordered)
        cursor = 0.0
        for p in ordered:
            w, h = p["w_cm"], p["h_cm"]
            y0 = (total_h - h) / 2  # vertically centered, raw-v (bottom-origin)
            rect = {"u0": cursor / total_w, "u1": (cursor + w) / total_w,
                    "v0": y0 / total_h, "v1": (y0 + h) / total_h}
            uv = p["corner_uv"]
            p["corner_uv"] = np.stack([
                rect["u0"] + uv[:, 0] * (rect["u1"] - rect["u0"]),
                rect["v0"] + uv[:, 1] * (rect["v1"] - rect["v0"]),
            ], axis=1)
            p["rect"] = rect
            p["placement_cm"] = {"xCm": round(cursor, 3),
                                 "yTopCm": round(total_h - (y0 + h), 3),
                                 "widthCm": round(w, 3), "heightCm": round(h, 3)}
            cursor += w
        px_per_cm = max(tmpl.get("pxPerCm", 40),
                        tmpl.get("minEditorPx", 480) / max(total_w, total_h))
        shared_doc = {"mode": "shared",
                      "surfaceId": layout.get("surfaceId", "film"),
                      "surfaceLabel": layout.get("surfaceLabel", "Printed film"),
                      "widthCm": round(total_w, 3), "heightCm": round(total_h, 3),
                      "pxPerCm": round(px_per_cm, 3),
                      "canvasPx": {"width": round(total_w * px_per_cm),
                                    "height": round(total_h * px_per_cm)}}
    else:
        shared_doc = {"mode": "separate"}
        for p in pending:
            p["rect"] = {"u0": 0, "v0": 0, "u1": 1, "v1": 1}

    # ---------------- phase 3: weld + write each region into the GLB
    for p in pending:
        region, entry, prim, mesh = p["region"], p["entry"], p["prim"], p["mesh"]
        faces, local_pos = p["faces"], p["local_pos"]
        corner_uv, existing_uv = p["corner_uv"], p["existing_uv"]

        corner_vidx = faces.ravel()
        key = np.concatenate([corner_vidx[:, None],
                              np.round(corner_uv * 1e6).astype(np.int64)], axis=1)
        uniq, new_index = np.unique(key, axis=0, return_inverse=True)
        src_v = uniq[:, 0]
        new_pos = local_pos[src_v]
        normals = np.asarray(p["geom"].vertex_normals)[src_v]
        new_uv0 = uniq[:, 1:3].astype(np.float64) / 1e6
        new_uv1 = existing_uv[src_v] if existing_uv is not None else np.zeros((len(src_v), 2))
        # Convention (matches texture-manager.ts): strategies emit v=0 at the
        # physical bottom; runtime CanvasTexture uses flipY=true. No flip here.

        mesh_name = region.get("meshName", region["id"].upper())
        attrs = pygltflib.Attributes(
            POSITION=ed.add_accessor(new_pos.astype(np.float32), "VEC3", with_bounds=True),
            NORMAL=ed.add_accessor(normals.astype(np.float32), "VEC3"),
            TEXCOORD_0=ed.add_accessor(new_uv0.astype(np.float32), "VEC2"),
            TEXCOORD_1=ed.add_accessor(new_uv1.astype(np.float32), "VEC2"),
        )
        indices_acc = ed.add_accessor(new_index.astype(np.uint32), "SCALAR", UINT32)

        if p["face_subset"] is None:
            prim.attributes = attrs
            prim.indices = indices_acc
            if prim.material is not None:
                _retarget_textures(ed, prim.material)
            ed.gltf.nodes[p["node_idx"]].name = mesh_name
            mesh.name = mesh_name
        else:
            # carve a NEW node; remainder rebuilt later. Material CLONED so the
            # remainder keeps sampling channel 0.
            mat_idx = prim.material
            if mat_idx is not None:
                new_mat = copy.deepcopy(ed.gltf.materials[mat_idx])
                new_mat.name = f"{mesh_name}_material"
                ed.gltf.materials.append(new_mat)
                mat_idx = len(ed.gltf.materials) - 1
                _retarget_textures(ed, mat_idx)
            new_prim = pygltflib.Primitive(attributes=attrs, indices=indices_acc,
                                           material=mat_idx, mode=4)
            ed.gltf.meshes.append(pygltflib.Mesh(name=mesh_name, primitives=[new_prim]))
            world_matrix = [float(v) for v in np.asarray(p["transform"]).T.flatten()]
            new_node = pygltflib.Node(name=mesh_name, mesh=len(ed.gltf.meshes) - 1,
                                      matrix=world_matrix)
            ed.gltf.nodes.append(new_node)
            ed.gltf.scenes[ed.gltf.scene or 0].nodes.append(len(ed.gltf.nodes) - 1)

        if shared:
            canvas_px = {"width": round(p["placement_cm"]["widthCm"] * shared_doc["pxPerCm"]),
                         "height": round(p["placement_cm"]["heightCm"] * shared_doc["pxPerCm"])}
        else:
            px_per_cm = max(tmpl.get("pxPerCm", 40),
                            tmpl.get("minEditorPx", 480) / max(p["w_cm"], p["h_cm"]))
            canvas_px = {"width": round(p["w_cm"] * px_per_cm),
                         "height": round(p["h_cm"] * px_per_cm)}
        entry.update({
            "meshName": mesh_name,
            "mapping": p["meta"],
            "uv": {"customizationChannel": 0, "originalChannel": 1, "rect": p["rect"]},
            "physicalCm": {"width": round(p["w_cm"], 2), "height": round(p["h_cm"], 2)},
            "canvasPx": canvas_px,
            "verticesRewritten": int(len(new_pos)),
        })
        if shared:
            entry["placement"] = p["placement_cm"]

    # Rebuild remainders of face-carved nodes.
    for node_name, subsets in claimed_faces.items():
        transform, gname = node_world[node_name]
        geom = scene.geometry[gname]
        n_faces = len(geom.faces)
        taken = np.zeros(n_faces, dtype=bool)
        for s in subsets:
            taken[s] = True
        remainder = np.where(~taken)[0]
        node_idx = node_by_name[node_name]
        mesh = ed.gltf.meshes[ed.gltf.nodes[node_idx].mesh]
        prim = mesh.primitives[0]
        if len(remainder) == 0:
            ed.gltf.nodes[node_idx].mesh = None
            continue
        old_faces = np.asarray(geom.faces)[remainder]
        used_v, reindexed = np.unique(old_faces.ravel(), return_inverse=True)
        pos = np.asarray(geom.vertices)[used_v]
        nor = np.asarray(geom.vertex_normals)[used_v]
        old_uv = (ed.read_accessor(prim.attributes.TEXCOORD_0)[used_v]
                  if prim.attributes.TEXCOORD_0 is not None else None)
        prim.attributes.POSITION = ed.add_accessor(pos.astype(np.float32), "VEC3", with_bounds=True)
        prim.attributes.NORMAL = ed.add_accessor(nor.astype(np.float32), "VEC3")
        if old_uv is not None:
            prim.attributes.TEXCOORD_0 = ed.add_accessor(old_uv.astype(np.float32), "VEC2")
        prim.indices = ed.add_accessor(reindexed.astype(np.uint32), "SCALAR", UINT32)

    out_glb = product_dir / "product-customizable.glb"
    ed.save(out_glb)

    regions_doc = {
        "version": 3,
        "productId": manifest["id"],
        "source": manifest["source"],
        "physical": {"cmPerUnit": round(cm_per_unit, 5), **manifest["physical"]},
        "uvContract": "TEXCOORD_0 = customization, TEXCOORD_1 = original. glTF drops UV names; channel order IS the contract. Region UVs occupy uv.rect within their surface canvas.",
        "layout": shared_doc,
        "regions": regions_out,
    }
    (product_dir / "regions.json").write_text(json.dumps(regions_doc, indent=2))
    return regions_doc
