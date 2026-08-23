import { distanceInside, maxFilter } from "./edt";

/**
 * The stitch-direction field.
 *
 * A digitiser makes one decision per area: narrow shapes get SATIN — threads
 * laid across the stroke, which is what gives lettering its glossy ridge — and
 * broad shapes get FILL, parallel rows at a house angle. This module derives
 * that decision from geometry instead of asking the customer.
 *
 * Distance-to-edge gives both answers at once: its gradient points straight
 * across the stroke (the satin direction), and a local maximum of it is half
 * the stroke width (the satin/fill test).
 */

export type StitchField = {
  width: number;
  height: number;
  /** Distance from each pixel to the shape edge, in pixels. */
  distance: Float32Array;
  /** Stitch direction per pixel, radians. */
  angle: Float32Array;
  /** Local shape width in pixels — twice the neighbourhood's max distance. */
  localWidth: Float32Array;
};

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Shortest-way-round interpolation between two angles. */
function lerpAngle(a: number, b: number, t: number) {
  let delta = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  return a + delta * t;
}

export function buildStitchField(
  mask: Uint8Array,
  width: number,
  height: number,
  options: { satinMaxWidthPx: number; fillAngleRad: number },
): StitchField {
  const distance = distanceInside(mask, width, height);
  const localWidth = maxFilter(distance, width, height, options.satinMaxWidthPx);
  for (let i = 0; i < localWidth.length; i += 1) localWidth[i] *= 2;

  const angle = new Float32Array(width * height);
  const at = (x: number, y: number) =>
    distance[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      // Sobel on the distance field: smoother than a central difference, which
      // matters because the angle is what the eye reads as thread direction.
      const gx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      const satinAngle = Math.abs(gx) + Math.abs(gy) < 1e-5
        ? options.fillAngleRad
        : Math.atan2(gy, gx);
      // Wide enough to fill, narrow enough to satin — blend across the
      // threshold so a tapering stroke does not snap direction mid-shape.
      const blend = smoothstep(
        options.satinMaxWidthPx,
        options.satinMaxWidthPx * 2,
        localWidth[index],
      );
      angle[index] = lerpAngle(satinAngle, options.fillAngleRad, blend);
    }
  }

  return { width, height, distance, angle, localWidth };
}
