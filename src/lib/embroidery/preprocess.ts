/**
 * Source-artwork preparation.
 *
 * Resamples the customer's asset into the EFFECT RASTER — a grid sized from
 * the artwork's physical dimensions, not from the surface canvas — so a 5 cm
 * logo gets the same number of stitches whether the product's texture is
 * 1024px or 4096px wide.
 */

export type PreparedArtwork = {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  pxPerMm: number;
  widthMm: number;
  heightMm: number;
  /** True when a flat background was keyed out of an opaque source. */
  backgroundRemoved: boolean;
};

const ALPHA_CUTOFF = 128;

/**
 * Flood a uniform background inward from the border.
 *
 * A global colour key would punch holes through matching colours inside the
 * logo; flooding from the edge only removes what is genuinely behind it. Only
 * runs on sources with no alpha of their own (a JPEG logo on white).
 */
function keyOutBackground(rgba: Uint8ClampedArray, width: number, height: number): boolean {
  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + width - 1) * 4,
  ];
  const reference = corners.map((offset) => [rgba[offset], rgba[offset + 1], rgba[offset + 2]]);
  const agree = reference.every(([r, g, b]) => {
    const [r0, g0, b0] = reference[0];
    return Math.abs(r - r0) < 12 && Math.abs(g - g0) < 12 && Math.abs(b - b0) < 12;
  });
  if (!agree) return false;

  const [br, bg, bb] = reference[0];
  const tolerance = 34 * 34 * 3;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x += 1) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push(y * width, y * width + width - 1);
  }

  let removed = 0;
  while (stack.length) {
    const index = stack.pop()!;
    if (seen[index]) continue;
    seen[index] = 1;
    const offset = index * 4;
    const dr = rgba[offset] - br;
    const dg = rgba[offset + 1] - bg;
    const db = rgba[offset + 2] - bb;
    if (dr * dr + dg * dg + db * db > tolerance) continue;
    rgba[offset + 3] = 0;
    removed += 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - width);
    if (y < height - 1) stack.push(index + width);
  }
  return removed > width * height * 0.02;
}

export function prepareArtwork(
  image: CanvasImageSource,
  options: {
    widthMm: number;
    heightMm: number;
    pxPerMm: number;
    /** Ceiling on raster area, so a poster-sized placement cannot stall a tab. */
    maxPixels?: number;
  },
): PreparedArtwork {
  const maxPixels = options.maxPixels ?? 2_600_000;
  let pxPerMm = options.pxPerMm;
  let width = Math.max(4, Math.round(options.widthMm * pxPerMm));
  let height = Math.max(4, Math.round(options.heightMm * pxPerMm));
  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    pxPerMm *= scale;
    width = Math.max(4, Math.round(options.widthMm * pxPerMm));
    height = Math.max(4, Math.round(options.heightMm * pxPerMm));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  const data = context.getImageData(0, 0, width, height);
  const rgba = data.data;

  let minAlpha = 255;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < minAlpha) minAlpha = rgba[i];
  }
  const backgroundRemoved = minAlpha === 255 ? keyOutBackground(rgba, width, height) : false;

  // Thread either covers a spot or it does not; there is no 40% stitch.
  for (let i = 3; i < rgba.length; i += 4) {
    rgba[i] = rgba[i] >= ALPHA_CUTOFF ? 255 : 0;
  }

  return {
    rgba,
    width,
    height,
    pxPerMm,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    backgroundRemoved,
  };
}
