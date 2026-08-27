import sharp from "sharp";
import type { ProductionArtworkRenderer } from "@/lib/print/types";
import type { ProductionAssetBytes } from "@/platform/production/exporter";
import { renderSurfaceArtworkPng } from "@/server/rendering/render-surface-artwork";
import { pixelsForMm } from "@/lib/print/physical-resolution";

function safeBackground(value: string | null | undefined) {
  return value && /^(#[0-9a-f]{3,8}|rgba?\([0-9., %]+\)|[a-z]+)$/i.test(value)
    ? value
    : "#ffffff";
}

function sectionPixelBox(
  section: NonNullable<Parameters<ProductionArtworkRenderer>[0]["surface"]["sections"]>[number],
  physicalWidthCm: number,
  physicalHeightCm: number,
  pixelWidth: number,
  pixelHeight: number,
) {
  const left = Math.max(0, Math.round((section.xCm / physicalWidthCm) * pixelWidth));
  const top = Math.max(0, Math.round((section.yCm / physicalHeightCm) * pixelHeight));
  const requestedWidth = Math.max(
    1,
    Math.round((section.widthCm / physicalWidthCm) * pixelWidth),
  );
  const requestedHeight = Math.max(
    1,
    Math.round((section.heightCm / physicalHeightCm) * pixelHeight),
  );
  return {
    left,
    top,
    width: Math.min(requestedWidth, pixelWidth - left),
    height: Math.min(requestedHeight, pixelHeight - top),
  };
}

/** Sharp implementation of the existing browser production-artwork contract. */
export function createServerProductionArtworkRenderer(input: {
  resolveAsset: (assetId: string) => Promise<ProductionAssetBytes | null>;
  maximumRasterPixels: number;
}): ProductionArtworkRenderer {
  return async (entry, ppi) => {
    const physicalWidthMm = entry.surface.physicalWidthCm * 10;
    const physicalHeightMm = entry.surface.physicalHeightCm * 10;
    const pixelWidth = pixelsForMm(physicalWidthMm, ppi);
    const pixelHeight = pixelsForMm(physicalHeightMm, ppi);
    const base = await renderSurfaceArtworkPng({
      design: entry.design,
      surface: entry.surface,
      pixelWidth,
      pixelHeight,
      resolveImage: input.resolveAsset,
      maximumRasterPixels: input.maximumRasterPixels,
    });

    const sections = entry.surface.sections ?? [];
    if (!sections.some((section) => (section.textureRotation ?? 0) !== 0)) {
      return { pngBytes: base, pixelWidth, pixelHeight };
    }

    const renderedSections = await Promise.all(sections.map(async (section, index) => {
      const box = sectionPixelBox(
        section,
        entry.surface.physicalWidthCm,
        entry.surface.physicalHeightCm,
        pixelWidth,
        pixelHeight,
      );
      if (box.width < 1 || box.height < 1) {
        throw new Error(`Production section ${section.id} falls outside its surface.`);
      }
      const panel = await sharp(base, {
        failOn: "error",
        limitInputPixels: input.maximumRasterPixels,
      }).extract(box).png().toBuffer();
      return {
        ...box,
        id: `panel-${index}`,
        rotation: section.textureRotation ?? 0,
        href: `data:image/png;base64,${panel.toString("base64")}`,
      };
    }));

    const definitions = renderedSections.map((panel) =>
      `<clipPath id="${panel.id}" clipPathUnits="userSpaceOnUse"><rect x="${panel.left}" y="${panel.top}" width="${panel.width}" height="${panel.height}"/></clipPath>`,
    );
    const panels = renderedSections.map((panel) => {
      const centreX = panel.left + panel.width / 2;
      const centreY = panel.top + panel.height / 2;
      return `<g clip-path="url(#${panel.id})"><image x="${panel.left}" y="${panel.top}" width="${panel.width}" height="${panel.height}" href="${panel.href}" preserveAspectRatio="none" transform="rotate(${panel.rotation} ${centreX} ${centreY})"/></g>`;
    });
    const background = safeBackground(
      entry.design.background ??
      entry.surface.productionBackground ??
      entry.surface.defaultBackground,
    );
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${pixelWidth} ${pixelHeight}">
        <defs>${definitions.join("")}</defs>
        <rect width="${pixelWidth}" height="${pixelHeight}" fill="${background}"/>
        ${panels.join("\n")}
      </svg>
    `;
    const transformed = await sharp(Buffer.from(svg), {
      density: 72,
      failOn: "error",
      limitInputPixels: input.maximumRasterPixels,
    }).png().toBuffer();
    return { pngBytes: transformed, pixelWidth, pixelHeight };
  };
}
