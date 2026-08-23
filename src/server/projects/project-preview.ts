import type { DesignDocument, ProductConfig } from "@/types/configurator";
import type { DesignProject, ProjectAsset } from "@/platform/projects/types";
import type { ObjectStore } from "@/platform/storage/object-store";
import { renderSurfaceArtworkPng } from "@/server/rendering/render-surface-artwork";

const MAX_PREVIEW_EDGE = 720;

export type RenderedProjectPreview = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

export type PreviewImage = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};

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
  const bytes = await renderSurfaceArtworkPng({
    design,
    surface,
    pixelWidth: width,
    pixelHeight: height,
    resolveImage,
    maximumRasterPixels: MAX_PREVIEW_EDGE * MAX_PREVIEW_EDGE,
  });
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
