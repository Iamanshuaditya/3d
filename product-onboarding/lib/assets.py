"""Generate customer/config assets from regions.json: product.json (ProductConfig-
shaped for the existing configurator), per-surface uv-template SVG/PNG, and
per-surface diagnostic textures for validation."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFont


def _font(size: int):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)
    except OSError:
        return ImageFont.load_default()


PALETTE = [(198, 40, 90), (30, 110 , 160), (35, 140, 90), (170, 110, 30)]


def diagnostic_texture(region: dict, out: Path, color) -> None:
    w, h = region["canvasPx"]["width"], region["canvasPx"]["height"]
    img = Image.new("RGB", (w, h), (242, 240, 236))
    d = ImageDraw.Draw(img)
    pale = tuple(int(c * 0.2 + 200) for c in color)
    d.rectangle([0, 0, w, h], fill=pale)
    step = max(20, round(min(w, h) / 8))
    for x in range(0, w, step):
        d.line([x, 0, x, h], fill=(255, 255, 255), width=1)
    for y in range(0, h, step):
        d.line([0, y, w, y], fill=(255, 255, 255), width=1)
    letter = region["label"][0].upper()
    d.text((w // 2, h // 2), letter, fill=color, font=_font(int(min(w, h) * 0.7)), anchor="mm")
    d.text((w // 2, min(30, h // 6)), region["label"].upper(), fill=color,
           font=_font(max(16, min(40, h // 8))), anchor="mm")
    r = max(8, min(w, h) // 22)
    d.ellipse([8, 8, 8 + 2 * r, 8 + 2 * r], fill=color)                       # TL circle
    d.rectangle([w - 8 - 2 * r, 8, w - 8, 8 + 2 * r], fill=color)             # TR square
    d.polygon([(8, h - 8), (8 + 2 * r, h - 8), (8 + r, h - 8 - 2 * r)], fill=color)  # BL triangle
    # UP arrow (canvas-up = physical top)
    cx = w * 3 // 4
    d.line([cx, h - 12, cx, h - 12 - 3 * r], fill=color, width=max(3, r // 3))
    d.polygon([(cx - r, h - 12 - 3 * r), (cx + r, h - 12 - 3 * r), (cx, h - 12 - 4 * r)], fill=color)
    img.save(out)


def template_svg(region: dict, out_svg: Path, out_png: Path, color) -> None:
    w, h = region["canvasPx"]["width"], region["canvasPx"]["height"]
    pw, ph = region["physicalCm"]["width"], region["physicalCm"]["height"]
    c = "rgb(%d,%d,%d)" % color
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" font-family="Helvetica">',
        f'<rect width="{w}" height="{h}" fill="#fafaf8"/>',
        f'<rect x="2" y="2" width="{w - 4}" height="{h - 4}" fill="none" stroke="{c}" stroke-width="3" stroke-dasharray="14 7"/>',
        f'<text x="{w / 2}" y="{h / 2}" text-anchor="middle" fill="{c}" font-size="{max(18, h // 8)}">{region["label"]}</text>',
        f'<text x="{w / 2}" y="{h / 2 + max(24, h // 7)}" text-anchor="middle" fill="#888" font-size="{max(13, h // 12)}">{pw:g} × {ph:g} cm</text>',
        "</svg>",
    ]
    out_svg.write_text("\n".join(svg))
    img = Image.new("RGB", (w, h), (250, 250, 248))
    d = ImageDraw.Draw(img)
    d.rectangle([2, 2, w - 3, h - 3], outline=color, width=3)
    d.text((w // 2, h // 2), region["label"], fill=color, font=_font(max(18, h // 8)), anchor="mm")
    img.save(out_png)


def region_closeups(glb: Path, regions: dict, manifest: dict) -> list[dict]:
    """One auto close-up preset per customizable region: planar regions are
    approached along their mean outward normal, wrap regions from the
    seam-opposite (front) direction."""
    scene = trimesh.load(str(glb), process=False)
    strat_by_id = {r["id"]: r.get("strategy", {}) for r in manifest["regions"]}
    presets = []
    for r in regions["regions"]:
        if not r.get("customizable"):
            continue
        node = r["meshName"]
        try:
            transform, gname = scene.graph[node]
        except Exception:
            continue
        g = scene.geometry[gname].copy()
        g.apply_transform(transform)
        center = g.bounds.mean(axis=0)
        size = float(np.linalg.norm(g.bounds[1] - g.bounds[0]))
        strat = strat_by_id.get(r["id"], {})
        if strat.get("type") == "wrap":
            axes = {"x": 0, "y": 1, "z": 2}
            h = axes[strat.get("axis", "y")]
            a, b = [i for i in range(3) if i != h]
            front_theta = np.deg2rad(strat.get("seam_deg", 180)) + np.pi
            d = np.zeros(3)
            d[a], d[b] = np.cos(front_theta), np.sin(front_theta)
        else:
            areas = g.area_faces
            d = (g.face_normals * (areas / areas.sum())[:, None]).sum(axis=0)
            n = np.linalg.norm(d)
            d = d / n if n > 1e-9 else np.array([0.0, 0.0, 1.0])
        pos = center + d * size * 1.6
        presets.append({"id": f"closeup-{r['id']}", "label": f"Close-up: {r['label']}",
                        "position": [round(float(v), 4) for v in pos],
                        "target": [round(float(v), 4) for v in center]})
    return presets


def camera_presets(glb: Path, distance_scale: float = 1.0) -> dict:
    scene = trimesh.load(str(glb), process=False)
    center = scene.bounds.mean(axis=0)
    radius = float(np.linalg.norm(scene.bounds[1] - scene.bounds[0]))
    d = radius * 1.9 * distance_scale
    t = [round(float(v), 3) for v in center]
    def pos(x, y, z):
        return [round(center[0] + x * d, 3), round(center[1] + y * d, 3), round(center[2] + z * d, 3)]
    return {
        "initial": pos(0.35, 0.25, 1.0),
        "target": t,
        "minDistance": round(d * 0.4, 3),
        "maxDistance": round(d * 3, 3),
        "presets": [
            {"id": "front", "label": "Front", "position": pos(0, 0.05, 1.15), "target": t},
            {"id": "angle", "label": "3/4", "position": pos(0.7, 0.35, 0.85), "target": t},
            {"id": "back", "label": "Back", "position": pos(0, 0.05, -1.15), "target": t},
            {"id": "side", "label": "Side", "position": pos(1.15, 0.05, 0), "target": t},
            {"id": "bottom", "label": "Bottom", "position": pos(0, -1.1, 0.25), "target": t},
        ],
    }


def shift_camera(camera: dict, dy: float) -> dict:
    """Move a camera block into world space.

    Presets are derived from the GLB's own bounds, but the runtime renders the
    model inside a group translated by `modelYOffset`. Without this the camera
    aims at where the product would have been, which only stayed invisible
    while every onboarded product happened to have a zero offset."""
    if not dy:
        return camera
    def s(v):
        return [v[0], round(v[1] + dy, 3), v[2]]
    return {
        **camera,
        "initial": s(camera["initial"]),
        "target": s(camera["target"]),
        "presets": [{**p, "position": s(p["position"]), "target": s(p["target"])}
                    for p in camera["presets"]],
    }


def _rdp(points: np.ndarray, eps: float) -> np.ndarray:
    """Ramer-Douglas-Peucker polyline simplification (iterative)."""
    if len(points) < 3:
        return points
    keep = np.zeros(len(points), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        seg = points[b] - points[a]
        seg_len = np.linalg.norm(seg)
        if seg_len < 1e-9:
            d = np.linalg.norm(points[a + 1:b] - points[a], axis=1)
        else:
            d = np.abs(np.cross(seg, points[a] - points[a + 1:b])) / seg_len
        i = int(np.argmax(d))
        if d[i] > eps:
            keep[a + 1 + i] = True
            stack.append((a, a + 1 + i))
            stack.append((a + 1 + i, b))
    return points[keep]


def idealize_convex(pts: np.ndarray, samples: int = 90, smooth_win: int = 7) -> np.ndarray:
    """Turn a wobbly convex outline (from a scanned mesh) into a CAD-looking
    one: polar-resample around the centroid, enforce left-right mirror
    symmetry, and smooth the radius circularly. Scans wobble; dielines don't."""
    c = pts.mean(axis=0)
    d = pts - c
    theta = np.arctan2(d[:, 1], d[:, 0])
    r = np.linalg.norm(d, axis=1)
    order = np.argsort(theta)
    theta, r = theta[order], r[order]
    grid = np.linspace(-np.pi, np.pi, samples, endpoint=False)
    rg = np.interp(grid, theta, r, period=2 * np.pi)
    # left-right symmetry: average r(θ) with r(π-θ)  (mirror across vertical axis)
    mirror = np.interp(np.pi - grid, theta, r, period=2 * np.pi)
    rg = (rg + mirror) / 2
    # circular moving-average smoothing
    kernel = np.ones(smooth_win) / smooth_win
    rg = np.convolve(np.concatenate([rg[-smooth_win:], rg, rg[:smooth_win]]), kernel, "same")[smooth_win:-smooth_win]
    out = np.stack([c[0] + rg * np.cos(grid), c[1] + rg * np.sin(grid)], axis=1)
    return _rdp(out, 1.5)


def region_outline_paths(glb_scene, mesh_name: str, w: int, h: int,
                          eps_px: float = 5.0, max_loops: int = 2):
    """True designable-area outlines: the region mesh's UV boundary edges,
    chained into loops and simplified. This is what turns 'a slice of canvas'
    into a real dieline shape (e.g. the pouch gusset's eye/octagon) for ANY
    product — derived from geometry, never hand-drawn."""
    try:
        _, gname = glb_scene.graph[mesh_name]
    except Exception:
        return []
    g = glb_scene.geometry[gname]
    uv = np.asarray(g.visual.uv)
    faces = np.asarray(g.faces)
    edges = np.sort(faces[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1)
    uniq, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = uniq[counts == 1]
    if not len(boundary):
        return []
    # chain boundary edges into loops
    adj: dict[int, list[int]] = {}
    for a, b in boundary:
        adj.setdefault(int(a), []).append(int(b))
        adj.setdefault(int(b), []).append(int(a))
    visited: set[tuple[int, int]] = set()
    loops = []
    for a0, b0 in boundary:
        e0 = (int(a0), int(b0))
        if e0 in visited or (e0[1], e0[0]) in visited:
            continue
        loop = [e0[0], e0[1]]
        visited.add(e0)
        while True:
            cur, prev = loop[-1], loop[-2]
            nxt = next((n for n in adj.get(cur, [])
                        if n != prev and (cur, n) not in visited and (n, cur) not in visited), None)
            if nxt is None or nxt == loop[0]:
                break
            visited.add((cur, nxt))
            loop.append(nxt)
        if len(loop) >= 3:
            loops.append(loop)
    # to pixels (trimesh v is already canvas-row oriented), simplify, rank by bbox area
    def poly_area(p):
        x, y = p[:, 0], p[:, 1]
        return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))

    def convex_hull(p):
        p = p[np.lexsort((p[:, 1], p[:, 0]))]
        def half(pts):
            out = []
            for pt in pts:
                while len(out) >= 2 and np.cross(out[-1] - out[-2], pt - out[-2]) <= 0:
                    out.pop()
                out.append(pt)
            return out
        lower, upper = half(p), half(p[::-1])
        return np.array(lower[:-1] + upper[:-1])

    min_area = 0.01 * w * h  # ignore tiny holes/defect loops
    candidates = []
    for loop in loops:
        pts = np.stack([uv[loop, 0] * w, uv[loop, 1] * h], axis=1)
        bbox_area = float(np.ptp(pts[:, 0]) * np.ptp(pts[:, 1]))
        if bbox_area >= min_area:
            candidates.append((bbox_area, pts))
    candidates.sort(key=lambda t: -t[0])
    all_px = np.stack([uv[:, 0] * w, uv[:, 1] * h], axis=1)
    region_bbox = (all_px.min(axis=0), all_px.max(axis=0))
    paths = []
    for rank, (bbox_area, pts) in enumerate(candidates):
        hull = convex_hull(pts)
        hull_area = poly_area(hull)
        if rank == 0:
            # The region's outer boundary is physically convex-ish even when
            # the scanned mesh edge wobbles: always use the hull. A hull that
            # essentially fills its bbox is a panel — draw a crisp INSET
            # safety rectangle (the professional-dieline look); other convex
            # shapes are idealized (symmetrized + smoothed) so derived
            # outlines read as CAD, not as a trace of a crumpled scan.
            if hull_area >= 0.92 * bbox_area:
                x0, y0 = pts.min(axis=0)
                x1, y1 = pts.max(axis=0)
                inset = float(np.clip(0.035 * min(x1 - x0, y1 - y0), 8, 26))
                pts = np.array([[x0 + inset, y0 + inset], [x1 - inset, y0 + inset],
                                [x1 - inset, y1 - inset], [x0 + inset, y1 - inset]])
            else:
                pts = idealize_convex(hull)
        else:
            # Secondary loops: drop thin snaking scan-noise, keep real holes.
            if poly_area(pts) < 0.45 * bbox_area:
                continue
            # Real holes are interior; carve-seam noise hugs the region edge.
            reg_min, reg_max = region_bbox
            band = 0.04 * max(reg_max[0] - reg_min[0], reg_max[1] - reg_min[1])
            if (pts.min(axis=0) < reg_min + band).any() or (pts.max(axis=0) > reg_max - band).any():
                continue
            pts = _rdp(hull if hull_area <= 1.2 * max(poly_area(pts), 1e-6) else pts, eps_px)
        if len(pts) >= 3:
            paths.append((bbox_area, pts))
    paths.sort(key=lambda t: -t[0])
    return [{"points": [round(float(v), 1) for v in p.ravel()], "closed": True}
            for _, p in paths[:max_loops]]


def surface_dieline(built_scene, region_list, w: int, h: int, crease_xs_px=None):
    """Generic dieline overlay for one surface: outer cut rect, region-boundary
    safety outlines (from geometry), optional crease lines between panels."""
    cuts = [{"points": [1, 1, w - 1, 1, w - 1, h - 1, 1, h - 1], "closed": True}]
    safety = []
    for r in region_list:
        safety.extend(region_outline_paths(built_scene, r["meshName"], w, h))
    creases = [{"points": [round(x, 1), 0, round(x, 1), h], "closed": False}
               for x in (crease_xs_px or [])]
    return {"cuts": cuts, "creases": creases, "safety": safety}


def region_footprint(glb_scene, mesh_name: str, w: int, h: int):
    """Mask of the region's true designable area on its canvas (255 = printable).
    trimesh flips V on load, which conveniently matches canvas row order."""
    try:
        _, gname = glb_scene.graph[mesh_name]
    except Exception:
        return None
    g = glb_scene.geometry[gname]
    uv = np.asarray(g.visual.uv)
    faces = np.asarray(g.faces)
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    for f in faces:
        d.polygon([(float(uv[i][0]) * w, float(uv[i][1]) * h) for i in f], fill=255)
    return mask


def apply_footprint(img_path: Path, mask) -> None:
    """Dim non-printable canvas area and stroke the printable outline."""
    if mask is None:
        return
    img = Image.open(img_path).convert("RGB")
    grey = Image.new("RGB", img.size, (215, 213, 209))
    img = Image.composite(img, grey, mask)
    from PIL import ImageFilter
    edge = mask.filter(ImageFilter.FIND_EDGES).point(lambda p: 255 if p > 12 else 0)
    outline = Image.new("RGB", img.size, (90, 90, 90))
    img = Image.composite(outline, img, edge)
    img.save(img_path)


def gen_shared_assets(product_dir, regions, customizable, built_scene):
    """Shared web: one composite diagnostic/template + one surface w/ sections."""
    lay = regions["layout"]
    W, H = lay["canvasPx"]["width"], lay["canvasPx"]["height"]
    ppcm = lay["pxPerCm"]
    diag = Image.new("RGB", (W, H), (233, 231, 227))
    tmpl = Image.new("RGB", (W, H), (250, 250, 248))
    sections = []
    for i, r in enumerate(customizable):
        color = PALETTE[i % len(PALETTE)]
        pl = r["placement"]
        x_px, y_px = round(pl["xCm"] * ppcm), round(pl["yTopCm"] * ppcm)
        sub_d = product_dir / f"_tmp-diag-{r['id']}.png"
        sub_t = product_dir / f"_tmp-tmpl-{r['id']}.png"
        diagnostic_texture(r, sub_d, color)
        template_svg(r, product_dir / f"_tmp-{r['id']}.svg", sub_t, color)
        diag.paste(Image.open(sub_d), (x_px, y_px))
        tmpl.paste(Image.open(sub_t), (x_px, y_px))
        for f in (sub_d, sub_t, product_dir / f"_tmp-{r['id']}.svg"):
            f.unlink(missing_ok=True)
        sections.append({
            "id": r["id"], "label": r["label"], "meshName": r["meshName"],
            "xCm": pl["xCm"], "yCm": pl["yTopCm"],
            "widthCm": pl["widthCm"], "heightCm": pl["heightCm"],
            "contentRotation": 0,
        })
    sid = lay["surfaceId"]
    diag.save(product_dir / f"diagnostic-{sid}.png")
    tmpl.save(product_dir / f"uv-template-{sid}.png")
    # combined footprint mask over the whole web
    mask = Image.new("L", (W, H), 0)
    for r in customizable:
        m = region_footprint(built_scene, r["meshName"], W, H)
        if m is not None:
            mask.paste(255, (0, 0), m)
    apply_footprint(product_dir / f"diagnostic-{sid}.png", mask)
    apply_footprint(product_dir / f"uv-template-{sid}.png", mask)
    # composite SVG (outline-level)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="Helvetica">',
           f'<rect width="{W}" height="{H}" fill="#fafaf8"/>']
    for i, r in enumerate(customizable):
        c = "rgb(%d,%d,%d)" % PALETTE[i % len(PALETTE)]
        pl = r["placement"]
        x, y = pl["xCm"] * ppcm, pl["yTopCm"] * ppcm
        w, h = pl["widthCm"] * ppcm, pl["heightCm"] * ppcm
        svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="{c}" stroke-width="3" stroke-dasharray="14 7"/>')
        svg.append(f'<text x="{x + w / 2}" y="{y + h / 2}" text-anchor="middle" fill="{c}" font-size="{max(18, round(h / 8))}">{r["label"]}</text>')
    svg.append("</svg>")
    (product_dir / f"uv-template-{sid}.svg").write_text("\n".join(svg))
    crease_xs = [round(r["placement"]["xCm"] * ppcm, 1)
                 for r in customizable if r["placement"]["xCm"] > 0]
    return [{
        "id": sid,
        "label": lay["surfaceLabel"],
        "meshName": customizable[0]["meshName"],
        "meshNames": [r["meshName"] for r in customizable],
        "sections": sections,
        "dieline": surface_dieline(built_scene, customizable, W, H, crease_xs),
        "editorWidth": W,
        "editorHeight": H,
        "physicalWidthCm": lay["widthCm"],
        "physicalHeightCm": lay["heightCm"],
        "displayUnit": "cm",
        "defaultBackground": "#ffffff",
        "guides": {"bleed": 12, "safeArea": 32},
    }]


def gen_assets(product_dir: Path) -> dict:
    manifest = json.loads((product_dir / "manifest.json").read_text())
    # Reproduction methods are a property of the product, not of the engine:
    # a garment panel can be printed OR embroidered, packaging only printed.
    render_modes = {r["id"]: r.get("renderModes") for r in manifest["regions"]}
    regions = json.loads((product_dir / "regions.json").read_text())
    customizable = [r for r in regions["regions"] if r.get("customizable")]
    built_scene = trimesh.load(str(product_dir / "product-customizable.glb"), process=False)

    is_shared = regions.get("layout", {}).get("mode") == "shared"
    surfaces = (gen_shared_assets(product_dir, regions, customizable, built_scene)
                if is_shared else [])
    for i, r in enumerate([] if is_shared else customizable):
        color = PALETTE[i % len(PALETTE)]
        diagnostic_texture(r, product_dir / f"diagnostic-{r['id']}.png", color)
        template_svg(r, product_dir / f"uv-template-{r['id']}.svg",
                     product_dir / f"uv-template-{r['id']}.png", color)
        mask = region_footprint(built_scene, r["meshName"],
                                r["canvasPx"]["width"], r["canvasPx"]["height"])
        apply_footprint(product_dir / f"diagnostic-{r['id']}.png", mask)
        apply_footprint(product_dir / f"uv-template-{r['id']}.png", mask)
        surfaces.append({
            "id": r["id"],
            "label": r["label"],
            "meshName": r["meshName"],
            **({"renderModes": render_modes[r["id"]]} if render_modes.get(r["id"]) else {}),
            "dieline": surface_dieline(built_scene, [r],
                                       r["canvasPx"]["width"], r["canvasPx"]["height"]),
            "editorWidth": r["canvasPx"]["width"],
            "editorHeight": r["canvasPx"]["height"],
            "physicalWidthCm": r["physicalCm"]["width"],
            "physicalHeightCm": r["physicalCm"]["height"],
            "displayUnit": "cm",
            "defaultBackground": "#ffffff",
            "guides": {"bleed": 12, "safeArea": 32},
        })

    product = {
        "id": manifest["id"],
        "name": manifest["name"],
        "family": "glb",
        "modelUrl": manifest.get("modelUrl", f"/models/{manifest['id']}-customizable.glb"),
        "modelYOffset": manifest.get("modelYOffset", 0),
        "shadowY": round(float(built_scene.bounds[0][1]) - 0.002 + manifest.get("modelYOffset", 0), 4),
        "materialProfile": manifest.get("materialProfile", "glossy-laminate"),
        "editableSurfaces": surfaces,
        "camera": shift_camera(
            (lambda c: {**c, "presets": c["presets"] + region_closeups(
                product_dir / "product-customizable.glb", regions, manifest)})(
                camera_presets(product_dir / "product-customizable.glb",
                               manifest.get("cameraDistanceScale", 1.0))),
            manifest.get("modelYOffset", 0),
        ),
        "metadata": {
            "generatedBy": "product-onboarding",
            "uvContract": regions["uvContract"],
            "physical": regions["physical"],
        },
    }
    (product_dir / "product.json").write_text(json.dumps(product, indent=2))
    return product
