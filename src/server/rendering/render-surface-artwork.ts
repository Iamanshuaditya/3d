import sharp from "sharp";
import type { EditableSurface, SurfaceDesign } from "@/types/configurator";

const MAX_SOURCE_IMAGE_PIXELS = 40_000_000;

export type RenderableImage = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};

export type SurfaceArtworkResolver = (assetId: string) => Promise<RenderableImage | null>;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeCssColor(value: string | null | undefined, fallback: string) {
  return value && /^(#[0-9a-f]{3,8}|rgba?\([0-9., %]+\)|[a-z]+)$/i.test(value)
    ? value
    : fallback;
}

/**
 * Server rendering shared by library previews and production-resolution PDF
 * artwork. It consumes the same surface design and never reads runtime URLs.
 */
export async function renderSurfaceArtworkPng(input: {
  design: SurfaceDesign;
  surface: EditableSurface;
  pixelWidth: number;
  pixelHeight: number;
  resolveImage?: SurfaceArtworkResolver;
  maximumRasterPixels: number;
}): Promise<Uint8Array> {
  const { design, surface, pixelWidth, pixelHeight, resolveImage, maximumRasterPixels } = input;
  if (
    !Number.isInteger(pixelWidth) ||
    !Number.isInteger(pixelHeight) ||
    pixelWidth < 1 ||
    pixelHeight < 1 ||
    pixelWidth * pixelHeight > maximumRasterPixels
  ) {
    throw new Error("Server artwork dimensions exceed the approved raster budget.");
  }

  const embedded = new Map<string, string>();
  const assetIds = [...new Set(
    design.elements.flatMap((element) =>
      element.type === "image" && element.assetId ? [element.assetId] : [],
    ),
  )];
  if (assetIds.length && !resolveImage) {
    throw new Error("Production artwork has no server asset resolver.");
  }
  await Promise.all(assetIds.map(async (assetId) => {
    const image = await resolveImage?.(assetId);
    if (!image) throw new Error(`Production artwork asset ${assetId} is unavailable.`);
    // Normalize every already-validated upload to an oriented PNG before
    // passing it into librsvg. This keeps JPEG EXIF and WebP behavior stable.
    const normalized = await sharp(image.bytes, {
      failOn: "error",
      limitInputPixels: MAX_SOURCE_IMAGE_PIXELS,
      sequentialRead: true,
    }).rotate().png().toBuffer();
    embedded.set(assetId, `data:image/png;base64,${normalized.toString("base64")}`);
  }));

  const content = design.elements.map((element) => {
    const transform = `translate(${element.x} ${element.y}) rotate(${element.rotation}) scale(${element.scaleX} ${element.scaleY})`;
    const common = `transform="${transform}" opacity="${Math.max(0, Math.min(1, element.opacity))}"`;
    if (element.type === "image") {
      if (!element.assetId) {
        throw new Error(`Production artwork image ${element.id} has no stable asset id.`);
      }
      const href = embedded.get(element.assetId);
      if (!href) throw new Error(`Production artwork asset ${element.assetId} is unavailable.`);
      if (element.crop) {
        if (!element.sourcePixelWidth || !element.sourcePixelHeight) {
          throw new Error(`Cropped production artwork ${element.id} has no source dimensions.`);
        }
        const cropX = element.crop.x * element.sourcePixelWidth;
        const cropY = element.crop.y * element.sourcePixelHeight;
        const cropWidth = element.crop.width * element.sourcePixelWidth;
        const cropHeight = element.crop.height * element.sourcePixelHeight;
        return `<g ${common}><svg width="${element.width}" height="${element.height}" viewBox="${cropX} ${cropY} ${cropWidth} ${cropHeight}" preserveAspectRatio="none" overflow="hidden"><image width="${element.sourcePixelWidth}" height="${element.sourcePixelHeight}" href="${href}" preserveAspectRatio="none"/></svg></g>`;
      }
      return `<image ${common} width="${element.width}" height="${element.height}" href="${href}" preserveAspectRatio="none"/>`;
    }
    const fill = safeCssColor(element.fill, "#111111");
    return `<text ${common} font-family="${escapeXml(element.fontFamily)}" font-size="${element.fontSize}" fill="${fill}">${element.text
      .split("\n")
      .map(
        (line, index) =>
          `<tspan x="0" y="${index * element.fontSize}" dominant-baseline="hanging">${escapeXml(line)}</tspan>`,
      )
      .join("")}</text>`;
  });

  const background = safeCssColor(
    design.background,
    safeCssColor(
      surface.productionBackground,
      safeCssColor(surface.defaultBackground, "#ffffff"),
    ),
  );
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
      width="${pixelWidth}" height="${pixelHeight}"
      viewBox="0 0 ${surface.editorWidth} ${surface.editorHeight}">
      <rect width="${surface.editorWidth}" height="${surface.editorHeight}" fill="${background}"/>
      ${content.join("\n")}
    </svg>
  `;
  return sharp(Buffer.from(svg), {
    density: 72,
    failOn: "error",
    limitInputPixels: maximumRasterPixels,
  }).png().toBuffer();
}
