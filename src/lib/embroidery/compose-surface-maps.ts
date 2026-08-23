import type { DesignElement, EditableSurface } from "@/types/configurator";
import type { EmbroideryResult } from "@/types/embroidery";

/**
 * Composites per-element embroidery into surface-wide material maps.
 *
 * The design canvas already carries colour (the editor draws the stitched
 * artwork straight into it). Normal and roughness need the same treatment, at
 * the same resolution and under the same transforms, so the three maps stay
 * registered on the garment down to the pixel.
 *
 * The transform below mirrors Konva's node transform exactly — translate to
 * (x, y), rotate, scale, then draw at the element's unscaled size — because
 * the editor and the renderer must not have two ideas about where a logo is.
 */

export type SurfaceMaterialMaps = {
  normal: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
};

/** Flat tangent-space normal: no perturbation away from the stitching. */
const FLAT_NORMAL = "#8080ff";

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawUnderElementTransform(
  context: CanvasRenderingContext2D,
  element: Extract<DesignElement, { type: "image" }>,
  source: CanvasImageSource,
) {
  context.save();
  context.translate(element.x, element.y);
  context.rotate((element.rotation * Math.PI) / 180);
  context.scale(element.scaleX, element.scaleY);
  context.drawImage(source, 0, 0, element.width, element.height);
  context.restore();
}

/** Allocates the persistent map canvases for one surface. */
export function createSurfaceMaterialMaps(surface: EditableSurface): SurfaceMaterialMaps {
  return {
    normal: createCanvas(surface.editorWidth, surface.editorHeight),
    roughness: createCanvas(surface.editorWidth, surface.editorHeight),
  };
}

/**
 * Redraws `target` in place. Returns false when the surface has no embroidery,
 * so the caller can leave the maps unbound rather than paying for a flat
 * normal map on every printed product.
 *
 * Drawing into persistent canvases matters: a drag fires on every pointer
 * move, and reallocating two megapixel-scale canvases per frame is the
 * difference between a smooth handle and a stuttering one.
 */
export function composeSurfaceMaterialMaps(
  surface: EditableSurface,
  elements: DesignElement[],
  results: Record<string, EmbroideryResult>,
  target: SurfaceMaterialMaps,
  fabricRoughness = 0.94,
): boolean {
  const embroidered = elements.filter(
    (element): element is Extract<DesignElement, { type: "image" }> =>
      element.type === "image" &&
      element.treatment?.mode === "embroidery" &&
      Boolean(results[element.id]),
  );
  if (!embroidered.length) return false;

  const { editorWidth: width, editorHeight: height } = surface;
  const normalContext = target.normal.getContext("2d")!;
  normalContext.fillStyle = FLAT_NORMAL;
  normalContext.fillRect(0, 0, width, height);

  const roughnessContext = target.roughness.getContext("2d")!;
  const base = Math.round(fabricRoughness * 255);
  roughnessContext.fillStyle = `rgb(${base},${base},${base})`;
  roughnessContext.fillRect(0, 0, width, height);

  // Draw in document order so a logo stacked over another wins on both maps
  // exactly as it does on the colour canvas.
  for (const element of embroidered) {
    const result = results[element.id];
    drawUnderElementTransform(normalContext, element, result.normal);
    drawUnderElementTransform(roughnessContext, element, result.roughness);
  }

  return true;
}

/**
 * Physical size of a placed image on its surface, in millimetres.
 * This is what makes stitch density a property of the product rather than of
 * the texture resolution.
 */
export function elementPhysicalSizeMm(
  surface: EditableSurface,
  element: Extract<DesignElement, { type: "image" }>,
): { widthMm: number; heightMm: number } {
  const pxPerCmX = surface.editorWidth / surface.physicalWidthCm;
  const pxPerCmY = surface.editorHeight / surface.physicalHeightCm;
  return {
    widthMm: (Math.abs(element.width * element.scaleX) / pxPerCmX) * 10,
    heightMm: (Math.abs(element.height * element.scaleY) / pxPerCmY) * 10,
  };
}
