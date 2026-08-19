"""Stage 9/10: diagnostic texture + customer-facing uv-template.svg/png + regions.json.

Coordinate system = the production web used by CUSTOMIZATION_UV and the existing
configurator "film" surface: U along the web (57.4 cm), V across (16 cm).
Canvas: 2296 x 640 px (40 px/cm), matching product-config.ts editorWidth/Height.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent.parent / "export"
OUT.mkdir(exist_ok=True)

PX_PER_CM = 40
W_CM, H_CM = 57.4, 16.0
W, H = int(W_CM * PX_PER_CM), int(H_CM * PX_PER_CM)
BLEED, PANEL, GUSSET = 0.2, 24.0, 9.0
SECTIONS = [
    {"id": "front_print", "label": "FRONT", "x0": BLEED, "w": PANEL, "color": (214, 69, 65), "letter": "F", "customizable": True, "mesh": "FRONT_PRINT"},
    {"id": "bottom_gusset", "label": "BOTTOM GUSSET", "x0": BLEED + PANEL, "w": GUSSET, "color": (38, 166, 91), "letter": "G", "customizable": True, "mesh": "BOTTOM_PRINT"},
    {"id": "back_print", "label": "BACK", "x0": BLEED + PANEL + GUSSET, "w": PANEL, "color": (31, 119, 180), "letter": "B", "customizable": True, "mesh": "BACK_PRINT"},
]


def font(size):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)
    except OSError:
        return ImageFont.load_default()


# ---------- Stage 9 diagnostic texture ----------
img = Image.new("RGB", (W, H), (240, 240, 240))
d = ImageDraw.Draw(img)
for s in SECTIONS:
    x0, x1 = int(s["x0"] * PX_PER_CM), int((s["x0"] + s["w"]) * PX_PER_CM)
    pale = tuple(int(c * 0.25 + 190) for c in s["color"])
    d.rectangle([x0, 0, x1, H], fill=pale)
    # cm grid
    for gx in range(int(s["x0"]), int(s["x0"] + s["w"]) + 1):
        px = int(gx * PX_PER_CM)
        d.line([px, 0, px, H], fill=(255, 255, 255), width=1)
    for gy in range(0, int(H_CM) + 1):
        d.line([x0, gy * PX_PER_CM, x1, gy * PX_PER_CM], fill=(255, 255, 255), width=1)
    # giant letter + label + orientation arrow (up = physical top of pouch)
    cx = (x0 + x1) // 2
    d.text((cx, H // 2), s["letter"], fill=s["color"], font=font(320), anchor="mm")
    d.text((cx, 40), s["label"], fill=s["color"], font=font(40), anchor="mm")
    d.line([x1 - 60, H - 40, x1 - 60, H - 160], fill=s["color"], width=8)
    d.polygon([(x1 - 80, H - 160), (x1 - 40, H - 160), (x1 - 60, H - 200)], fill=s["color"])
    d.text((x1 - 60, H - 230), "UP", fill=s["color"], font=font(28), anchor="mm")
    # corner markers to catch mirroring: TL circle, TR square
    d.ellipse([x0 + 12, 12, x0 + 52, 52], fill=s["color"])
    d.rectangle([x1 - 52, 12, x1 - 12, 52], fill=s["color"])
d.rectangle([0, 0, int(BLEED * PX_PER_CM), H], fill=(60, 60, 60))
d.rectangle([W - int(BLEED * PX_PER_CM), 0, W, H], fill=(60, 60, 60))
img.save(OUT / "diagnostic-texture.png")

# ---------- Stage 10 customer template (SVG + PNG) ----------
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="Helvetica">',
       f'<rect width="{W}" height="{H}" fill="#fafafa"/>']
for s in SECTIONS:
    x0, x1 = s["x0"] * PX_PER_CM, (s["x0"] + s["w"]) * PX_PER_CM
    c = "rgb(%d,%d,%d)" % s["color"]
    svg.append(f'<rect x="{x0}" y="0" width="{x1 - x0}" height="{H}" fill="none" stroke="{c}" stroke-width="3" stroke-dasharray="12 6"/>')
    svg.append(f'<text x="{(x0 + x1) / 2}" y="{H / 2}" text-anchor="middle" fill="{c}" font-size="48">{s["label"]}</text>')
    svg.append(f'<text x="{(x0 + x1) / 2}" y="{H / 2 + 60}" text-anchor="middle" fill="#666" font-size="30">{s["w"]:g} x {H_CM:g} cm</text>')
svg.append(f'<rect x="0" y="0" width="{BLEED * PX_PER_CM}" height="{H}" fill="#ddd"/>')
svg.append(f'<rect x="{W - BLEED * PX_PER_CM}" y="0" width="{BLEED * PX_PER_CM}" height="{H}" fill="#ddd"/>')
svg.append("</svg>")
(OUT / "uv-template.svg").write_text("\n".join(svg))

tmpl = Image.new("RGB", (W, H), (250, 250, 250))
td = ImageDraw.Draw(tmpl)
for s in SECTIONS:
    x0, x1 = int(s["x0"] * PX_PER_CM), int((s["x0"] + s["w"]) * PX_PER_CM)
    td.rectangle([x0, 2, x1, H - 2], outline=s["color"], width=3)
    td.text(((x0 + x1) // 2, H // 2), s["label"], fill=s["color"], font=font(48), anchor="mm")
tmpl.save(OUT / "uv-template.png")

# ---------- regions.json ----------
regions = {
    "version": 1,
    "canvas": {"widthPx": W, "heightPx": H, "widthCm": W_CM, "heightCm": H_CM, "pxPerCm": PX_PER_CM},
    "uvSets": {"customization": "TEXCOORD_0", "original": "TEXCOORD_1"},
    "regions": [
        {
            "id": s["id"],
            "name": s["label"].title(),
            "meshName": s["mesh"],
            "customizable": s["customizable"],
            "uvRect": {"u0": round(s["x0"] / W_CM, 5), "u1": round((s["x0"] + s["w"]) / W_CM, 5), "v0": 0.0, "v1": 1.0},
            "canvasRectPx": {"x": int(s["x0"] * PX_PER_CM), "y": 0, "w": int(s["w"] * PX_PER_CM), "h": H},
            "physicalCm": {"w": s["w"], "h": H_CM},
        }
        for s in SECTIONS
    ] + [
        {"id": "bleed", "name": "Bleed / seal edges", "meshName": None, "customizable": False,
         "uvRect": {"u0": 0.0, "u1": round(BLEED / W_CM, 5), "v0": 0.0, "v1": 1.0}},
    ],
}
(OUT / "regions.json").write_text(json.dumps(regions, indent=2))
print("wrote diagnostic-texture.png, uv-template.svg/png, regions.json")
