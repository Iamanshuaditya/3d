import type {
  EmbroideryResult,
  EmbroiderySettings,
} from "@/types/embroidery";
import { prepareArtwork } from "./preprocess";
import { quantize } from "./quantize";
import { planStitches } from "./stitch-plan";
import { renderEmbroideryMaps } from "./render-maps";
import { domCanvasFactory, type CanvasFactory } from "./canvas";

/**
 * image -> stitches -> material maps.
 *
 * Entirely client-side and entirely derived: the customer's asset is read, never
 * written, and never leaves the device. Nothing in this module knows about
 * React, three.js or the surface it will end up on.
 */

export type EmbroideryQuality = "preview" | "full";

/**
 * Effect-raster resolution per quality tier, in pixels per millimetre.
 * `full` puts roughly three pixels across a 0.4 mm thread, which is the point
 * at which individual strands stop aliasing into a texture.
 */
const PX_PER_MM: Record<EmbroideryQuality, number> = { preview: 2.8, full: 8 };

/**
 * Raster ceiling per tier.
 *
 * Cost is linear in raster area, so a ceiling is what stops a poster-sized
 * placement taking a hundred times longer than a badge. The preview ceiling is
 * deliberately tight: it exists to be fast, and a 21 cm logo at the full
 * tier's density is not a preview of anything.
 */
const MAX_PIXELS: Record<EmbroideryQuality, number> = {
  preview: 420_000,
  full: 2_600_000,
};

/** House fill angle. 45 degrees is the packaging-industry default for tatami. */
const FILL_ANGLE_RAD = (45 * Math.PI) / 180;

const MAX_STITCHES: Record<EmbroideryQuality, number> = {
  preview: 26_000,
  full: 160_000,
};

export type EmbroideryRequest = {
  image: CanvasImageSource;
  /** Physical size of the placed artwork on the product. */
  widthMm: number;
  heightMm: number;
  settings: EmbroiderySettings;
  quality: EmbroideryQuality;
  /** Where canvases come from. Defaults to the DOM; the worker passes its own. */
  canvas?: CanvasFactory;
};

export function generateEmbroidery(request: EmbroideryRequest): EmbroideryResult {
  const { settings, quality } = request;
  const canvas = request.canvas ?? domCanvasFactory;
  const prepared = prepareArtwork(request.image, {
    widthMm: request.widthMm,
    heightMm: request.heightMm,
    pxPerMm: PX_PER_MM[quality],
    maxPixels: MAX_PIXELS[quality],
    canvas,
  });

  const { palette, indices, assessment } = quantize(
    prepared.rgba,
    prepared.width,
    prepared.height,
    Math.max(1, Math.min(16, Math.round(settings.maxColours))),
  );

  const pxPerMm = prepared.pxPerMm;
  const plan = planStitches(indices, palette, prepared.width, prepared.height, {
    densityPx: Math.max(1, settings.densityMm * pxPerMm),
    stitchLengthPx: Math.max(2, settings.stitchLengthMm * pxPerMm),
    satinMaxWidthPx: Math.max(2, settings.satinMaxWidthMm * pxPerMm),
    fillAngleRad: FILL_ANGLE_RAD,
    maxStitches: MAX_STITCHES[quality],
  });

  const maps = renderEmbroideryMaps(
    plan.runs,
    prepared.width,
    prepared.height,
    pxPerMm,
    settings,
    canvas,
  );

  const notices = [...assessment.notices];
  if (prepared.backgroundRemoved) {
    notices.push("A flat background was detected and left unstitched.");
  }
  if (assessment.distinctColours > settings.maxColours * 12) {
    notices.push(
      `This artwork has roughly ${assessment.distinctColours >= 4096 ? "4000+" : assessment.distinctColours} colours. ` +
        `It has been reduced to ${palette.length} thread${palette.length === 1 ? "" : "s"}, ` +
        `so shading and gradients will simplify.`,
    );
  }
  if (plan.fineDetailFraction > 0.18) {
    notices.push(
      `About ${Math.round(plan.fineDetailFraction * 100)}% of this design is finer than one stitch row at this size. ` +
        `Scale it up or simplify it for a cleaner result.`,
    );
  }
  if (plan.effectiveDensityPx > settings.densityMm * pxPerMm * 1.02) {
    notices.push(
      "Stitch density was reduced to keep the preview responsive at this size.",
    );
  }

  return {
    widthPx: prepared.width,
    heightPx: prepared.height,
    pxPerMm,
    widthMm: prepared.widthMm,
    heightMm: prepared.heightMm,
    runs: plan.runs,
    stitchCount: plan.stitchCount,
    colour: maps.colour,
    normal: maps.normal,
    roughness: maps.roughness,
    mask: maps.mask,
    notices,
  };
}

export { PX_PER_MM, MAX_PIXELS, MAX_STITCHES, FILL_ANGLE_RAD };
export { prepareArtwork } from "./preprocess";
export { quantize } from "./quantize";
export { planStitches } from "./stitch-plan";
export { buildStitchField } from "./stitch-field";
export { distanceInside } from "./edt";
