import sharp from "sharp";
import type { ProductConfig } from "@/types/configurator";
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

export async function renderProjectPreview(
  project: DesignProject,
  config: ProductConfig,
  assets: ProjectAsset[],
  objectStore: ObjectStore,
): Promise<RenderedProjectPreview> {
  const surface = config.editableSurfaces[0];
  const design = project.design.surfaces[surface.id] ?? { elements: [], background: null };
  const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(surface.editorWidth, surface.editorHeight));
  const width = Math.max(1, Math.round(surface.editorWidth * scale));
  const height = Math.max(1, Math.round(surface.editorHeight * scale));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const embedded = new Map<string, string>();

  await Promise.all(
    design.elements.map(async (element) => {
      if (element.type !== "image" || !element.assetId || embedded.has(element.assetId)) return;
      const asset = assetsById.get(element.assetId);
      if (!asset || asset.kind !== "artwork") return;
      const object = await objectStore.get(asset.storageKey);
      if (!object) return;
      embedded.set(
        element.assetId,
        `data:${asset.mimeType};base64,${Buffer.from(object.bytes).toString("base64")}`,
      );
    }),
  );

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

