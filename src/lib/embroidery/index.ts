import type {
  EmbroideryResult,
  EmbroiderySettings,
} from "@/types/embroidery";
import { prepareArtwork } from "./preprocess";
import { quantize } from "./quantize";
import { planStitches } from "./stitch-plan";
import { renderEmbroideryMaps } from "./render-maps";

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
const PX_PER_MM: Record<EmbroideryQuality, number> = { preview: 3.2, full: 8 };

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
};

export function generateEmbroidery(request: EmbroideryRequest): EmbroideryResult {
  const { settings, quality } = request;
  const prepared = prepareArtwork(request.image, {
    widthMm: request.widthMm,
    heightMm: request.heightMm,
    pxPerMm: PX_PER_MM[quality],
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

export { prepareArtwork } from "./preprocess";
export { quantize } from "./quantize";
export { planStitches } from "./stitch-plan";
export { buildStitchField } from "./stitch-field";
export { distanceInside } from "./edt";
