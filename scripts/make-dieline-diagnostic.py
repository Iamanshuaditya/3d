"""Diagnostic dieline artwork for the mailer box.

Every panel is labelled and carries an UP arrow pointing toward dieline-up, so
a screenshot of the folded product makes mirroring, quarter-turns and per-panel
UV drift immediately visible to a human. Generated, never hand-drawn, from the
same measurements the spec uses.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

X0, H, W, D = 8, 60, 240, 160
XM, XR = X0 + H, X0 + H + W
DIELINE_W = XR + H + X0
TUCK, ROLL, DUST = 42, 54, 38
yTuck = 8
yLidTop = yTuck + TUCK
yBack = yLidTop + D
yBase = yBack + H
yFront = yBase + D
yRoll = yFront + H
DIELINE_H = yRoll + ROLL + 8

CANVAS_W, CANVAS_H = 1128, 1662
SX, SY = CANVAS_W / DIELINE_W, CANVAS_H / DIELINE_H

PANELS = [
    ("BASE",       XM, yBase,        W,    D,    (26, 96, 168)),
    ("BACK",       XM, yBack,        W,    H,    (176, 58, 44)),
    ("FRONT",      XM, yFront,       W,    H,    (30, 122, 74)),
    ("LEFT",       X0, yBase,        H,    D,    (168, 122, 22)),
    ("RIGHT",      XR, yBase,        H,    D,    (118, 56, 150)),
    ("LID",        XM, yLidTop,      W,    D,    (18, 62, 118)),
    ("TUCK",       XM, yTuck,        W,    TUCK, (72, 76, 88)),
    ("L-FLAP",     X0, yLidTop,      H,    D,    (196, 148, 30)),
    ("R-FLAP",     XR, yLidTop,      H,    D,    (146, 78, 178)),
    ("DUST-BL",    X0, yBase - DUST, H,    DUST, (140, 100, 16)),
    ("DUST-BR",    XR, yBase - DUST, H,    DUST, (96, 44, 126)),
    ("DUST-FL",    X0, yFront,       H,    DUST, (140, 100, 16)),
    ("DUST-FR",    XR, yFront,       H,    DUST, (96, 44, 126)),
    ("ROLL",       XM, yRoll,        W,    ROLL, (22, 98, 60)),
]


def font(size: int):
    for path in ("/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


img = Image.new("RGB", (CANVAS_W, CANVAS_H), (250, 249, 246))
d = ImageDraw.Draw(img)

for label, x, y, w, h, colour in PANELS:
    px, py = x * SX, y * SY
    pw, ph = w * SX, h * SY
    d.rectangle([px, py, px + pw, py + ph], fill=colour, outline=(250, 250, 250), width=4)
    ink = (255, 255, 255)
    size = int(min(pw, ph) * 0.30)
    d.text((px + pw / 2, py + ph * 0.56), label, fill=ink, font=font(max(14, size)), anchor="mm")
    # UP arrow toward dieline-up: a mirrored or rotated panel shows it wrong.
    ax, ay = px + pw / 2, py + ph * 0.24
    arm = min(pw, ph) * 0.13
    d.line([ax, ay + arm, ax, ay - arm], fill=ink, width=max(3, int(arm / 4)))
    d.polygon([(ax - arm * 0.6, ay - arm * 0.3), (ax + arm * 0.6, ay - arm * 0.3), (ax, ay - arm)], fill=ink)
    # Asymmetric corner marks: circle top-left, square top-right.
    r = min(pw, ph) * 0.07
    d.ellipse([px + 10, py + 10, px + 10 + 2 * r, py + 10 + 2 * r], fill=(255, 214, 0))
    d.rectangle([px + pw - 10 - 2 * r, py + 10, px + pw - 10, py + 10 + 2 * r], fill=(255, 60, 120))

out = Path("docs/research/diagnostics/mailer-dieline-diagnostic.png")
out.parent.mkdir(parents=True, exist_ok=True)
img.save(out)
print(f"wrote {out} ({CANVAS_W}x{CANVAS_H})")
