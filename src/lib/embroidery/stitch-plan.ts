import type { ThreadRun } from "@/types/embroidery";
import { TRANSPARENT_INDEX } from "./quantize";
import { buildStitchField } from "./stitch-field";
import type { Palette } from "./quantize";

/**
 * Stitch placement.
 *
 * Rows run at the house fill angle and are spaced by the requested density,
 * with a half-step brick offset so successive rows do not line up into visible
 * channels — the same reason tatami fill is bricked on a real machine. Each
 * stitch is then ORIENTED by the local direction field, so the identical
 * sampling grid produces flat fill in open areas and across-the-stroke satin
 * in lettering, with no separate code path.
 *
 * Output is a flat Float32Array of endpoints per thread colour. A 10 cm logo
 * at production density is tens of thousands of stitches; one object each
 * would cost more in allocation and GC than the geometry itself.
 */

export type StitchPlanOptions = {
  densityPx: number;
  stitchLengthPx: number;
  satinMaxWidthPx: number;
  fillAngleRad: number;
  /** Hard ceiling; the planner thins the fill rather than hanging the tab. */
  maxStitches: number;
};

export type StitchPlan = {
  runs: ThreadRun[];
  stitchCount: number;
  /** Share of the artwork whose features are finer than one stitch row. */
  fineDetailFraction: number;
  /** Density actually used, after any thinning. */
  effectiveDensityPx: number;
};

function toHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function planStitches(
  indices: Uint8Array,
  palette: Palette,
  width: number,
  height: number,
  options: StitchPlanOptions,
): StitchPlan {
  const runs: ThreadRun[] = [];
  let stitchCount = 0;
  let finePixels = 0;
  let maskedPixels = 0;

  // One cheap pre-pass to size the job. Thinning the whole design uniformly is
  // honest; silently truncating one colour's fill is not.
  let opaquePixels = 0;
  for (let i = 0; i < indices.length; i += 1) if (indices[i] !== TRANSPARENT_INDEX) opaquePixels += 1;
  const perStitchArea = options.densityPx * options.stitchLengthPx;
  const estimate = opaquePixels / Math.max(1e-6, perStitchArea);
  const thinning = estimate > options.maxStitches ? estimate / options.maxStitches : 1;
  const densityPx = options.densityPx * thinning;

  const cosA = Math.cos(options.fillAngleRad);
  const sinA = Math.sin(options.fillAngleRad);

  for (let colour = 0; colour < palette.length; colour += 1) {
    const mask = new Uint8Array(width * height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (indices[index] !== colour) continue;
        mask[index] = 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) continue;

    const field = buildStitchField(mask, width, height, {
      satinMaxWidthPx: options.satinMaxWidthPx,
      fillAngleRad: options.fillAngleRad,
    });

    const fineLimit = densityPx * 2;
    for (let i = 0; i < mask.length; i += 1) {
      if (!mask[i]) continue;
      maskedPixels += 1;
      if (field.localWidth[i] < fineLimit) finePixels += 1;
    }

    // Row/column extents of the mask's bounding box in the rotated frame.
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const [cx, cy] of [
      [minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY],
    ] as const) {
      const u = cx * cosA + cy * sinA;
      const v = -cx * sinA + cy * cosA;
      uMin = Math.min(uMin, u);
      uMax = Math.max(uMax, u);
      vMin = Math.min(vMin, v);
      vMax = Math.max(vMax, v);
    }

    const points: number[] = [];
    const half = options.stitchLengthPx / 2;
    const inside = (x: number, y: number) => {
      const ix = Math.round(x);
      const iy = Math.round(y);
      return ix >= 0 && iy >= 0 && ix < width && iy < height && mask[iy * width + ix] === 1;
    };

    let row = 0;
    for (let v = vMin; v <= vMax; v += densityPx, row += 1) {
      const brick = (row % 2) * (options.stitchLengthPx / 2);
      for (let u = uMin + brick; u <= uMax; u += options.stitchLengthPx) {
        const x = u * cosA - v * sinA;
        const y = u * sinA + v * cosA;
        if (!inside(x, y)) continue;

        const theta = field.angle[Math.round(y) * width + Math.round(x)];
        const dx = Math.cos(theta);
        const dy = Math.sin(theta);

        // Shorten rather than overshoot: thread outside the artwork's alpha is
        // the single most obvious tell that an "embroidery effect" is a filter.
        let length = half;
        while (
          length > 0.6 &&
          (!inside(x + dx * length, y + dy * length) || !inside(x - dx * length, y - dy * length))
        ) {
          length *= 0.6;
        }
        // A shape narrower than the shortest stitch still gets thread, but as a
        // dot at the sample point — never as a segment poking out of the alpha.
        if (!inside(x + dx * length, y + dy * length) || !inside(x - dx * length, y - dy * length)) {
          length = 0;
        }
        points.push(x - dx * length, y - dy * length, x + dx * length, y + dy * length);
      }
    }

    if (!points.length) continue;
    runs.push({ colour: toHex(palette[colour]), segments: Float32Array.from(points) });
    stitchCount += points.length / 4;
  }

  return {
    runs,
    stitchCount,
    fineDetailFraction: maskedPixels ? finePixels / maskedPixels : 0,
    effectiveDensityPx: densityPx,
  };
}
