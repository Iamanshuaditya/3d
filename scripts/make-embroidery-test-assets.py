"""Deterministic embroidery test artwork.

Each asset targets one failure mode of an image-to-stitch pipeline: flat shape
coverage, colour separation, features finer than a stitch row, satin lettering,
unstitchable photographic detail, and alpha handling.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math

OUT = Path("docs/research/diagnostics/embroidery-assets")
OUT.mkdir(parents=True, exist_ok=True)
S = 900


def font(size: int):
    for path in ("/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def blank():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


# 1. Flat shape: does the fill cover cleanly, at the right density?
img = blank()
ImageDraw.Draw(img).ellipse([80, 80, S - 80, S - 80], fill=(18, 18, 20, 255))
img.save(OUT / "circle-black.png")

# 2. Two colours: does quantisation keep them separate and unblended?
img = blank()
d = ImageDraw.Draw(img)
d.ellipse([70, 70, S - 70, S - 70], fill=(198, 32, 62, 255))
d.polygon([(S // 2, 190), (S - 210, S - 200), (210, S - 200)], fill=(240, 214, 60, 255))
img.save(OUT / "logo-two-colour.png")

# 3. Thin lines: features narrower than one stitch row must be reported.
img = blank()
d = ImageDraw.Draw(img)
for i in range(14):
    x = 90 + i * 52
    d.line([(x, 90), (x, S - 90)], fill=(20, 80, 160, 255), width=max(1, i))
img.save(OUT / "thin-lines.png")

# 4. Lettering: the satin path — strokes must be stitched across, not along.
img = blank()
ImageDraw.Draw(img).text((S // 2, S // 2), "STITCH", fill=(24, 40, 88, 255),
                         font=font(210), anchor="mm")
img.save(OUT / "text-logo.png")

# 5. Photographic gradient: honest simplification, with a warning.
img = Image.new("RGBA", (S, S))
px = img.load()
for y in range(S):
    for x in range(S):
        r = int(128 + 110 * math.sin(x / 90))
        g = int(128 + 110 * math.sin((x + y) / 110))
        b = int(128 + 110 * math.cos(y / 70))
        px[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), 255)
img.save(OUT / "gradient-photo.png")

# 6. Transparency: no thread may land outside the alpha.
img = blank()
d = ImageDraw.Draw(img)
d.rounded_rectangle([120, 260, S - 120, S - 260], radius=90, fill=(20, 130, 100, 255))
d.ellipse([S // 2 - 90, S // 2 - 90, S // 2 + 90, S // 2 + 90], fill=(0, 0, 0, 0))
img.save(OUT / "transparent-hole.png")

# 7. Opaque JPEG-style logo on white: exercises background key-out.
img = Image.new("RGB", (S, S), (255, 255, 255))
d = ImageDraw.Draw(img)
d.ellipse([150, 150, S - 150, S - 150], fill=(30, 90, 170))
d.text((S // 2, S // 2), "V", fill=(255, 255, 255), font=font(300), anchor="mm")
img.convert("RGB").save(OUT / "logo-on-white.jpg", quality=92)

print("wrote", len(list(OUT.iterdir())), "assets to", OUT)
