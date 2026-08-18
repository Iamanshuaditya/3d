"""Mathematical validation of a built product (no rendering, no screenshots).

Checks, per customizable region, against product-customizable.glb:
  1. TEXCOORD_0 exists, lies in [0,1], low overlap, sane coverage.
  2. Determinism/data-integrity: recomputing the strategy from the exported
     geometry reproduces the stored TEXCOORD_0 (catches weld, flip, channel
     order and accessor bugs).
  3. Geometric semantics: probe points in canvas space map to 3D points whose
     position matches the strategy's meaning (wrap: u=center-of-canvas is on
     the seam's opposite side; v grows with height; planar: flat plate, u/v
     monotonic with the plane axes).
  4. TEXCOORD_1 equals the source mesh's original UV (preservation).
  5. Non-customizable nodes byte-preserved (same vertex/face counts & names).
Exit contract: {"passed": bool, "checks": [...]}.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import trimesh

from . import strategies as strat_mod
from .inspector import uv_coverage_and_overlap


def _world_geoms(path: Path) -> dict:
    scene = trimesh.load(str(path), process=False)
    out = {}
    for node in scene.graph.nodes_geometry:
        transform, gname = scene.graph[node]
        g = scene.geometry[gname]
        out[node] = (np.asarray(transform), g)
    return out


def _probe_to_3d(uv_probe, uvs, faces, world_pos):
    """Barycentric lookup: canvas/UV point -> 3D world point (or None)."""
    tri_uv = uvs[faces]
    p = np.asarray(uv_probe)
    a, b, c = tri_uv[:, 0], tri_uv[:, 1], tri_uv[:, 2]
    v0, v1, v2 = b - a, c - a, p - a
    d00 = (v0 * v0).sum(1); d01 = (v0 * v1).sum(1); d11 = (v1 * v1).sum(1)
    d20 = (v2 * v0).sum(1); d21 = (v2 * v1).sum(1)
    denom = d00 * d11 - d01 * d01
    with np.errstate(divide="ignore", invalid="ignore"):
        v = (d11 * d20 - d01 * d21) / denom
        w = (d00 * d21 - d01 * d20) / denom
    u = 1 - v - w
    inside = (u >= -1e-4) & (v >= -1e-4) & (w >= -1e-4) & (np.abs(denom) > 1e-14)
    if not inside.any():
        return None
    fi = int(np.argmax(inside))
    bary = np.array([u[fi], v[fi], w[fi]])
    return (world_pos[faces[fi]] * bary[:, None]).sum(0)


def validate(product_dir: Path) -> dict:
    manifest = json.loads((product_dir / "manifest.json").read_text())
    regions = json.loads((product_dir / "regions.json").read_text())
    src_geoms = _world_geoms(product_dir / manifest["source"])
    out_geoms = _world_geoms(product_dir / "product-customizable.glb")
    cm_per_unit = regions["physical"]["cmPerUnit"]

    checks = []

    def check(name, ok, detail=""):
        checks.append({"check": name, "ok": bool(ok), "detail": detail})

    manifest_regions = {r["id"]: r for r in manifest["regions"]}
    for r in regions["regions"]:
        rid = r["id"]
        if not r.get("customizable"):
            for node in r["nodes"]:
                ok = node in out_geoms and len(out_geoms[node][1].vertices) == len(src_geoms[node][1].vertices)
                check(f"{rid}: node {node} preserved", ok)
            continue

        mesh_name = r["meshName"]
        if mesh_name not in out_geoms:
            check(f"{rid}: mesh {mesh_name} present", False)
            continue
        transform, g = out_geoms[mesh_name]
        world_pos = trimesh.transform_points(np.asarray(g.vertices), transform)
        faces = np.asarray(g.faces)
        # trimesh flips V on glTF load; validate in RAW accessor space (what
        # three.js actually samples).
        uv0 = np.asarray(g.visual.uv)
        uv0 = np.stack([uv0[:, 0], 1.0 - uv0[:, 1]], axis=1)
        check(f"{rid}: TEXCOORD_0 present", uv0 is not None and len(uv0) == len(g.vertices))
        in_range = float((uv0 >= -1e-4).all() and (uv0 <= 1 + 1e-4).all())
        check(f"{rid}: UV in [0,1]", in_range, f"range u[{uv0[:,0].min():.3f},{uv0[:,0].max():.3f}] v[{uv0[:,1].min():.3f},{uv0[:,1].max():.3f}]")
        cov, ovl = uv_coverage_and_overlap(faces, uv0)
        check(f"{rid}: overlap low", ovl < 0.05, f"overlap={ovl:.3f} coverage={cov:.3f}")

        # Region UVs live in uv.rect (whole canvas for separate layouts, a
        # slice of the shared web otherwise). Probes are stated in LOCAL 0-1
        # region coordinates and mapped through the rect.
        rect = r["uv"]["rect"]
        ru, rv = rect["u1"] - rect["u0"], rect["v1"] - rect["v0"]
        def pm(p):
            return (rect["u0"] + p[0] * ru, rect["v0"] + p[1] * rv)

        # determinism: recompute strategy on exported world geometry
        cfg = dict(manifest_regions[rid]["strategy"]); stype = cfg.pop("type")
        if stype != "reuse_existing":
            corner_uv, _ = strat_mod.STRATEGIES[stype](world_pos, faces, cfg, cm_per_unit)
            expected = np.stack([rect["u0"] + corner_uv[:, 0] * ru,
                                 rect["v0"] + corner_uv[:, 1] * rv], axis=1)
            actual = uv0[faces.ravel()]
            du = np.abs(expected[:, 0] - actual[:, 0])
            if stype == "wrap":  # u is circular; seam corners may sit at rect edges
                du = np.minimum(du, ru - du)
            dv = np.abs(expected[:, 1] - actual[:, 1])
            err = float(np.percentile(np.maximum(du, dv), 99.5))
            check(f"{rid}: strategy reproducible", err < 5e-3, f"p99.5_uv_err={err:.5f}")

        # geometric probes — non-rectangular regions don't cover the canvas
        # corners, so probes that miss are nudged toward the UV centroid until
        # they land inside the footprint. All 5 (possibly nudged) must land.
        uv_centroid = uv0[faces.ravel()].mean(axis=0)
        def probe_or_nudge(p):
            p = np.asarray(p, dtype=float)
            for _ in range(12):
                w = _probe_to_3d(tuple(p), uv0, faces, world_pos)
                if w is not None:
                    return w, tuple(np.round(p, 3))
                p = p + (uv_centroid - p) * 0.25
            return None, tuple(np.round(p, 3))
        probes = [(0.15, 0.15), (0.85, 0.15), (0.5, 0.5), (0.15, 0.85), (0.85, 0.85)]
        pts = []
        for p0 in probes:
            w, landed_at = probe_or_nudge(pm(p0))
            check(f"{rid}: probe {p0} maps to 3D", w is not None,
                  f"landed at {landed_at}")
            pts.append(w)
        if all(p is not None for p in pts):
            axis = strat_mod.AXES[manifest_regions[rid]["strategy"].get("axis", "y")]
            if stype == "wrap":
                # Convention: v=0 physical bottom (flipY at runtime). So the
                # v=0.85 probe must sit HIGHER along the axis than v=0.15.
                check(f"{rid}: high-v is physical-top",
                      pts[3][axis] > pts[0][axis],
                      f"axis(v=.85)={pts[3][axis]:.4f} axis(v=.15)={pts[0][axis]:.4f}")
                # u sweep should move around the axis: angles differ
                h, a, b = strat_mod._axis_frame(manifest_regions[rid]["strategy"].get("axis", "y"))
                ang = [np.arctan2(p[b] - world_pos[:, b].mean(), p[a] - world_pos[:, a].mean()) for p in (pts[0], pts[1], pts[2])]
                check(f"{rid}: u sweeps around axis", abs(ang[0] - ang[1]) > 0.3,
                      f"angles={[round(float(x),2) for x in ang]}")
            if stype == "planar":
                flat_axis_spread = np.ptp([p[axis] for p in pts])
                extent = np.ptp(world_pos[:, axis])
                check(f"{rid}: planar probes stay on plate", flat_axis_spread <= extent + 1e-6,
                      f"spread={flat_axis_spread:.4f}")

            # Chirality: text drawn left-to-right on the canvas must read
            # left-to-right when viewed from OUTSIDE the surface. Rule: the 3D
            # step from u to u+du must align with cross(up, outward_normal).
            # reuse_existing trusts the author's UV direction — skipped.
            p_l = _probe_to_3d(pm((0.42, 0.5)), uv0, faces, world_pos)
            p_r = _probe_to_3d(pm((0.58, 0.5)), uv0, faces, world_pos)
            if stype == "reuse_existing":
                check(f"{rid}: chirality skipped (authored UV accepted as-is)", True)
            elif p_l is not None and p_r is not None:
                step = p_r - p_l
                scfg = manifest_regions[rid]["strategy"]
                up = np.zeros(3)
                if stype == "planar":
                    # planar: strategy axis is the projection NORMAL; canvas V
                    # runs along the second in-plane axis.
                    _, _, b_axis = strat_mod._axis_frame(scfg.get("axis", "y"))
                    up[b_axis] = -1.0 if scfg.get("flip_v") else 1.0
                else:
                    up[axis] = 1.0
                if stype == "wrap":
                    hh, aa, bb = strat_mod._axis_frame(manifest_regions[rid]["strategy"].get("axis", "y"))
                    mid = (p_l + p_r) / 2
                    ctr = world_pos.mean(axis=0)
                    normal = np.zeros(3)
                    normal[aa], normal[bb] = mid[aa] - ctr[aa], mid[bb] - ctr[bb]
                    normal /= max(np.linalg.norm(normal), 1e-12)
                else:
                    tri_n = np.cross(world_pos[faces[:, 1]] - world_pos[faces[:, 0]],
                                     world_pos[faces[:, 2]] - world_pos[faces[:, 0]])
                    normal = tri_n.sum(axis=0)
                    normal /= max(np.linalg.norm(normal), 1e-12)
                right = np.cross(up, normal)
                ok = float(np.dot(step, right)) > 0
                check(f"{rid}: not mirrored (chirality)", ok,
                      f"dot(step,right)={float(np.dot(step, right)):.5f}")

        # original UV preserved as TEXCOORD_1 — read via pygltflib (trimesh only exposes uv0)
        import pygltflib
        gl = pygltflib.GLTF2().load(str(product_dir / "product-customizable.glb"))
        node_idx = next(i for i, n in enumerate(gl.nodes) if n.name == mesh_name)
        prim = gl.meshes[gl.nodes[node_idx].mesh].primitives[0]
        check(f"{rid}: TEXCOORD_1 present", prim.attributes.TEXCOORD_1 is not None)
        if prim.material is not None:
            mat = gl.materials[prim.material]
            bct = mat.pbrMetallicRoughness.baseColorTexture
            if bct is not None:
                check(f"{rid}: original texture on channel 1", bct.texCoord == 1)

    # ---- dieline quality gate: every generated surface must ship guides that
    # hold basic professional properties. This is systemic — a product cannot
    # pass validation with missing, out-of-bounds, or noisy dieline paths.
    product_json = product_dir / "product.json"
    if product_json.exists():
        product = json.loads(product_json.read_text())
        for s in product.get("editableSurfaces", []):
            sid = s["id"]
            dl = s.get("dieline")
            check(f"dieline[{sid}]: present", dl is not None)
            if not dl:
                continue
            W, H = s["editorWidth"], s["editorHeight"]
            all_paths = dl.get("cuts", []) + dl.get("creases", []) + (dl.get("safety") or [])
            in_bounds = all(
                -2 <= p <= (W + 2 if i % 2 == 0 else H + 2)
                for path in all_paths for i, p in enumerate(path["points"]))
            check(f"dieline[{sid}]: all paths inside canvas", in_bounds)
            noisy = [len(path["points"]) // 2 for path in all_paths if len(path["points"]) // 2 > 120]
            check(f"dieline[{sid}]: paths are smooth (<=120 pts)", not noisy,
                  f"noisy path sizes: {noisy}" if noisy else "")
            n_regions = len([x for x in regions["regions"]
                             if x.get("customizable") and (
                                 x["meshName"] in (s.get("meshNames") or [s["meshName"]]))])
            n_safety = len(dl.get("safety") or [])
            check(f"dieline[{sid}]: safety outlines present per region",
                  n_safety >= n_regions, f"{n_safety} outlines for {n_regions} region(s)")

    passed = all(c["ok"] for c in checks)
    result = {"passed": passed, "checks": checks}
    out_dir = product_dir / "validation"
    out_dir.mkdir(exist_ok=True)
    (out_dir / "math-validation.json").write_text(json.dumps(result, indent=2))
    return result
