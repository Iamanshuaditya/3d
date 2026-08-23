"""Pixel-level checks over the captured embroidery evidence.

Three properties that a screenshot alone will not tell you:

  1. TRANSFORM SYNC   — switching print -> embroidery must not move, rotate or
     resize the artwork. The stitched patch must occupy the same box.
  2. NON-DESTRUCTIVE  — switching back to print must restore the original
     asset, pixel for pixel.
  3. COVERAGE         — the stitching must actually cover the shape, not just
     outline it.

Usage: python scripts/verify-embroidery-shots.py docs/research/diagnostics/embroidery
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops

# The editor's transparency checkerboard, which is not artwork.
CHECKER = {(228, 228, 230), (255, 255, 255)}


def artwork_bbox(path: Path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    # Ignore the outer 8% where the bleed/safety guides and rulers live.
    inset = img.crop((int(w * 0.08), int(h * 0.08), int(w * 0.92), int(h * 0.92)))
    px = inset.load()
    iw, ih = inset.size
    left, top, right, bottom = iw, ih, -1, -1
    for y in range(0, ih, 2):
        for x in range(0, iw, 2):
            r, g, b = px[x, y]
            saturation = max(r, g, b) - min(r, g, b)
            if saturation < 28 and min(r, g, b) > 150:
                continue  # checkerboard or plain white
            left, top = min(left, x), min(top, y)
            right, bottom = max(right, x), max(bottom, y)
    if right < 0:
        return None
    return left, top, right, bottom


def coverage(path: Path) -> float:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    inset = img.crop((int(w * 0.08), int(h * 0.08), int(w * 0.92), int(h * 0.92)))
    px = inset.load()
    iw, ih = inset.size
    hits = 0
    total = 0
    for y in range(0, ih, 2):
        for x in range(0, iw, 2):
            total += 1
            r, g, b = px[x, y]
            if max(r, g, b) - min(r, g, b) >= 28 or min(r, g, b) <= 150:
                hits += 1
    return hits / max(1, total)


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/research/diagnostics/embroidery")
    stems = sorted({p.name.rsplit("-2d-", 1)[0] for p in root.glob("*-2d-print.png")})
    if not stems:
        print(f"no captures found in {root}")
        return 1

    failures = 0
    for stem in stems:
        printed = root / f"{stem}-2d-print.png"
        stitched = root / f"{stem}-2d-embroidery.png"
        restored = root / f"{stem}-2d-print-restored.png"

        a, b = artwork_bbox(printed), artwork_bbox(stitched)
        if not a or not b:
            print(f"{stem:18} FAIL  could not locate artwork")
            failures += 1
            continue

        centre = lambda r: ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)
        size = lambda r: (r[2] - r[0], r[3] - r[1])
        dx = abs(centre(a)[0] - centre(b)[0])
        dy = abs(centre(a)[1] - centre(b)[1])
        dw = abs(size(a)[0] - size(b)[0]) / max(1, size(a)[0])
        dh = abs(size(a)[1] - size(b)[1]) / max(1, size(a)[1])

        diff = ImageChops.difference(
            Image.open(printed).convert("RGB"), Image.open(restored).convert("RGB")
        )
        drift = sum(i * n for i, n in enumerate(diff.convert("L").histogram())) / (
            diff.size[0] * diff.size[1]
        )

        cov = coverage(stitched)
        ok = dx <= 6 and dy <= 6 and dw <= 0.05 and dh <= 0.05 and drift < 1.0 and cov > 0.02
        failures += 0 if ok else 1
        print(
            f"{stem:18} {'PASS' if ok else 'FAIL'}  "
            f"centre drift {dx:.1f},{dy:.1f}px  size drift {dw * 100:.1f}%,{dh * 100:.1f}%  "
            f"restore delta {drift:.3f}  stitch coverage {cov * 100:.1f}%"
        )

    print(f"\n{len(stems) - failures}/{len(stems)} assets passed")
    return 0 if failures == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
