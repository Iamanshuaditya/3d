import type { DesignElement, EditableSection } from "@/types/configurator";
import type { NormalizedPrintSurface } from "./types";

const MM_PER_INCH = 25.4;

export type RenderedArtwork = {
  pngBytes: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load print asset: ${src.slice(0, 80)}`));
    image.src = src;
  });
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("The browser could not encode the production artwork."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

function drawText(context: CanvasRenderingContext2D, element: Extract<DesignElement, { type: "text" }>) {
  context.font = `${element.fontSize}px ${element.fontFamily}`;
  context.fillStyle = element.fill;
  context.textAlign = "left";
  context.textBaseline = "top";
  const lines = element.text.split("\n");
  lines.forEach((line, index) => context.fillText(line, 0, index * element.fontSize));
}

function sectionPixelBox(
  section: EditableSection,
  physicalWidthCm: number,
  physicalHeightCm: number,
  width: number,
  height: number,
) {
  return {
    x: Math.round((section.xCm / physicalWidthCm) * width),
    y: Math.round((section.yCm / physicalHeightCm) * height),
    width: Math.max(1, Math.round((section.widthCm / physicalWidthCm) * width)),
    height: Math.max(1, Math.round((section.heightCm / physicalHeightCm) * height)),
  };
}

/**
 * Applies printer-authored panel rotations after artwork has been rendered in
 * the customer-friendly editor orientation. The same section metadata drives
 * the 3D texture, so production and preview remain deterministic.
 */
function applySectionTransforms(
  source: HTMLCanvasElement,
  entry: NormalizedPrintSurface,
): HTMLCanvasElement {
  const sections = entry.surface.sections ?? [];
  if (!sections.some((section) => (section.textureRotation ?? 0) !== 0)) return source;

  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D is unavailable for print transforms.");
  context.fillStyle = entry.design.background ?? entry.surface.defaultBackground ?? "#ffffff";
  context.fillRect(0, 0, output.width, output.height);

  for (const section of sections) {
    const box = sectionPixelBox(
      section,
      entry.surface.physicalWidthCm,
      entry.surface.physicalHeightCm,
      output.width,
      output.height,
    );
    const rotation = section.textureRotation ?? 0;
    if (rotation === 0) {
      context.drawImage(
        source,
        box.x,
        box.y,
        box.width,
        box.height,
        box.x,
        box.y,
        box.width,
        box.height,
      );
      continue;
    }

    const panel = document.createElement("canvas");
    panel.width = box.width;
    panel.height = box.height;
    panel
      .getContext("2d")
      ?.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

    context.save();
    context.beginPath();
    context.rect(box.x, box.y, box.width, box.height);
    context.clip();
    context.translate(box.x + box.width / 2, box.y + box.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(panel, -box.width / 2, -box.height / 2);
    context.restore();
  }

  return output;
}

/**
 * Re-renders the design from source objects at physical production resolution.
 * It intentionally never scales up the low-resolution Three.js preview canvas.
 */
export async function renderProductionArtwork(
  entry: NormalizedPrintSurface,
  ppi: number,
): Promise<RenderedArtwork> {
  if (document.fonts?.ready) await document.fonts.ready;

  const physicalWidthMm = entry.surface.physicalWidthCm * 10;
  const physicalHeightMm = entry.surface.physicalHeightCm * 10;
  const pixelWidth = Math.ceil((physicalWidthMm / MM_PER_INCH) * ppi);
  const pixelHeight = Math.ceil((physicalHeightMm / MM_PER_INCH) * ppi);

  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D is unavailable for production rendering.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = entry.design.background ?? entry.surface.defaultBackground ?? "#ffffff";
  context.fillRect(0, 0, pixelWidth, pixelHeight);

  const imageElements = entry.design.elements.filter(
    (element): element is Extract<DesignElement, { type: "image" }> => element.type === "image",
  );
  const loadedImages = new Map<string, HTMLImageElement>();
  await Promise.all(
    imageElements.map(async (element) => {
      if (!element.src) {
        throw new Error(`Print asset ${element.sourceName ?? element.id} has no runtime source.`);
      }
      if (!loadedImages.has(element.src)) loadedImages.set(element.src, await loadImage(element.src));
    }),
  );

  context.save();
  context.scale(
    pixelWidth / entry.surface.editorWidth,
    pixelHeight / entry.surface.editorHeight,
  );
  for (const element of entry.design.elements) {
    context.save();
    context.globalAlpha = element.opacity;
    context.translate(element.x, element.y);
    context.rotate((element.rotation * Math.PI) / 180);
    context.scale(element.scaleX, element.scaleY);
    if (element.type === "image") {
      const image = element.src ? loadedImages.get(element.src) : undefined;
      if (!image) throw new Error(`Print asset ${element.sourceName ?? element.id} is unavailable.`);
      context.drawImage(image, 0, 0, element.width, element.height);
    } else {
      drawText(context, element);
    }
    context.restore();
  }
  context.restore();

  const transformed = applySectionTransforms(canvas, entry);
  return {
    pngBytes: await canvasToPng(transformed),
    pixelWidth,
    pixelHeight,
  };
}
