import sharp from "sharp";
import type { DesignDocument, ProductConfig } from "@/types/configurator";
import type { DesignProject, ProjectAsset } from "@/platform/projects/types";
import type { ObjectStore } from "@/platform/storage/object-store";

const MAX_PREVIEW_EDGE = 720;

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

export type RenderedProjectPreview = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

export type PreviewImage = { bytes: Uint8Array; mimeType: string };

export async function renderDesignPreview(
  document: DesignDocument,
  config: ProductConfig,
  resolveImage?: (assetId: string) => Promise<PreviewImage | null>,
): Promise<RenderedProjectPreview> {
  const surface = config.editableSurfaces[0];
  const design = document.surfaces[surface.id] ?? { elements: [], background: null };
  const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(surface.editorWidth, surface.editorHeight));
  const width = Math.max(1, Math.round(surface.editorWidth * scale));
  const height = Math.max(1, Math.round(surface.editorHeight * scale));
  const embedded = new Map<string, string>();

  if (resolveImage) {
    await Promise.all(
      [...new Set(
        design.elements.flatMap((element) =>
          element.type === "image" && element.assetId ? [element.assetId] : [],
        ),
      )].map(async (assetId) => {
        const image = await resolveImage(assetId);
        if (!image) return;
        embedded.set(
          assetId,
          `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`,
        );
      }),
    );
  }

  const content = design.elements.map((element) => {
    const common = `transform="translate(${element.x} ${element.y}) rotate(${element.rotation}) scale(${element.scaleX} ${element.scaleY})" opacity="${Math.max(0, Math.min(1, element.opacity))}"`;
    if (element.type === "image") {
      const href = element.assetId ? embedded.get(element.assetId) : undefined;
      return href
        ? `<image ${common} width="${element.width}" height="${element.height}" href="${href}" preserveAspectRatio="none"/>`
        : "";
    }
    const lines = element.text.split("\n");
    const fill = safeCssColor(element.fill, "#111111");
    return `<text ${common} font-family="${escapeXml(element.fontFamily)}" font-size="${element.fontSize}" fill="${fill}">${lines
      .map(
        (line, index) =>
          `<tspan x="0" y="${index * element.fontSize}" dominant-baseline="hanging">${escapeXml(line)}</tspan>`,
      )
      .join("")}</text>`;
  });

  const background = safeCssColor(
    design.background,
    safeCssColor(surface.defaultBackground, "#ffffff"),
  );
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
      width="${width}" height="${height}"
      viewBox="0 0 ${surface.editorWidth} ${surface.editorHeight}">
      <rect width="${surface.editorWidth}" height="${surface.editorHeight}" fill="${background}"/>
      ${content.join("\n")}
    </svg>
  `;
  const bytes = await sharp(Buffer.from(svg), { density: 96 }).png().toBuffer();
  return { bytes, width, height };
}

export async function renderProjectPreview(
  project: DesignProject,
  config: ProductConfig,
  assets: ProjectAsset[],
  objectStore: ObjectStore,
): Promise<RenderedProjectPreview> {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  return renderDesignPreview(project.design, config, async (assetId) => {
    const asset = assetsById.get(assetId);
    if (!asset || asset.kind !== "artwork") return null;
    const object = await objectStore.get(asset.storageKey);
    return object ? { bytes: object.bytes, mimeType: asset.mimeType } : null;
  });
}
