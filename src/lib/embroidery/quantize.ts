import type { EmbroideryAssessment } from "@/types/embroidery";

/**
 * Colour reduction to a thread palette.
 *
 * Embroidery is worked in whole threads: every extra colour is a real thread
 * change on a real machine. Median-cut in RGB with luminance-weighted splits
 * keeps logo colours separable while collapsing gradients, which is exactly
 * what a digitiser does by hand when a customer sends a photo.
 */

export type Palette = { r: number; g: number; b: number }[];

export type QuantizeResult = {
  palette: Palette;
  /** Palette index per pixel; 255 marks transparent (no thread). */
  indices: Uint8Array;
  assessment: EmbroideryAssessment;
};

const TRANSPARENT = 255;
const ALPHA_THRESHOLD = 110;

type Box = { pixels: Int32Array; count: number };

function boxBounds(pixels: Int32Array, count: number) {
  let rMin = 255, gMin = 255, bMin = 255;
  let rMax = 0, gMax = 0, bMax = 0;
  for (let i = 0; i < count; i += 1) {
    const packed = pixels[i];
    const r = (packed >> 16) & 255;
    const g = (packed >> 8) & 255;
    const b = packed & 255;
    if (r < rMin) rMin = r;
    if (g < gMin) gMin = g;
    if (b < bMin) bMin = b;
    if (r > rMax) rMax = r;
    if (g > gMax) gMax = g;
    if (b > bMax) bMax = b;
  }
  // Weight the channels the way the eye does, so a split never spends its one
  // chance separating blues that nobody can tell apart.
  return {
    rMin, gMin, bMin, rMax, gMax, bMax,
    spread: [
      (rMax - rMin) * 0.299,
      (gMax - gMin) * 0.587,
      (bMax - bMin) * 0.114,
    ],
  };
}

function splitBox(box: Box): [Box, Box] | null {
  const { spread } = boxBounds(box.pixels, box.count);
  const channel = spread.indexOf(Math.max(...spread));
  if (spread[channel] <= 0) return null;
  const shift = channel === 0 ? 16 : channel === 1 ? 8 : 0;

  const slice = box.pixels.subarray(0, box.count);
  const sorted = Array.from(slice).sort(
    (a, b) => ((a >> shift) & 255) - ((b >> shift) & 255),
  );
  const mid = Math.floor(sorted.length / 2);
  if (mid === 0 || mid === sorted.length) return null;
  return [
    { pixels: Int32Array.from(sorted.slice(0, mid)), count: mid },
    { pixels: Int32Array.from(sorted.slice(mid)), count: sorted.length - mid },
  ];
}

function averageColour(box: Box) {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < box.count; i += 1) {
    const packed = box.pixels[i];
    r += (packed >> 16) & 255;
    g += (packed >> 8) & 255;
    b += packed & 255;
  }
  return {
    r: Math.round(r / box.count),
    g: Math.round(g / box.count),
    b: Math.round(b / box.count),
  };
}

export function quantize(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxColours: number,
): QuantizeResult {
  const pixelCount = width * height;
  const opaque = new Int32Array(pixelCount);
  let opaqueCount = 0;
  const distinct = new Set<number>();

  for (let i = 0; i < pixelCount; i += 1) {
    if (rgba[i * 4 + 3] < ALPHA_THRESHOLD) continue;
    const packed = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    opaque[opaqueCount] = packed;
    opaqueCount += 1;
    if (distinct.size < 4096) distinct.add(packed);
  }

  const indices = new Uint8Array(pixelCount).fill(TRANSPARENT);
  if (!opaqueCount) {
    return {
      palette: [],
      indices,
      assessment: {
        distinctColours: 0,
        reducedColours: 0,
        fineDetailFraction: 0,
        notices: ["This artwork is fully transparent — there is nothing to stitch."],
      },
    };
  }

  let boxes: Box[] = [{ pixels: opaque.subarray(0, opaqueCount), count: opaqueCount }];
  while (boxes.length < maxColours) {
    // Always split the box that still covers the most pixels; splitting the
    // widest box instead starves large flat areas of their own thread.
    let target = -1;
    let best = 1;
    for (let i = 0; i < boxes.length; i += 1) {
      if (boxes[i].count > best) {
        best = boxes[i].count;
        target = i;
      }
    }
    if (target < 0) break;
    const halves = splitBox(boxes[target]);
    if (!halves) {
      boxes[target] = { ...boxes[target], count: 1 };
      if (boxes.every((box) => box.count <= 1)) break;
      continue;
    }
    boxes = [...boxes.slice(0, target), ...halves, ...boxes.slice(target + 1)];
  }

  const palette = boxes.filter((box) => box.count > 0).map(averageColour);

  for (let i = 0; i < pixelCount; i += 1) {
    if (rgba[i * 4 + 3] < ALPHA_THRESHOLD) continue;
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let p = 0; p < palette.length; p += 1) {
      const dr = (r - palette[p].r) * 0.299;
      const dg = (g - palette[p].g) * 0.587;
      const db = (b - palette[p].b) * 0.114;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = p;
      }
    }
    indices[i] = bestIndex;
  }

  return {
    palette,
    indices,
    assessment: {
      distinctColours: distinct.size,
      reducedColours: palette.length,
      fineDetailFraction: 0,
      notices: [],
    },
  };
}

export const TRANSPARENT_INDEX = TRANSPARENT;
