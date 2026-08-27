import type { ProductConfig } from "@/types/configurator";

/**
 * Display metadata for the product library. Everything here is derived from
 * the ProductConfig registry, so a newly registered product appears in the
 * gallery without any per-product copy.
 */
export type ProductSummary = {
  id: string;
  name: string;
  familyLabel: string;
  surfaceCount: number;
  sectionCount: number;
  /** Printable size of the first surface, in its own display unit. */
  printSize: string;
  /** Editor canvas resolution of the first surface. */
  canvasSize: string;
  /** Bytes of the source GLB on disk; null when geometry is generated. */
  modelBytes: number | null;
};

const FAMILY_LABELS: Record<ProductConfig["family"], string> = {
  glb: "Mesh model",
  "folded-carton": "Generated carton",
  pouch: "Generated pouch",
  "flat-sheet": "Physical flat sheet",
};

export function familyLabel(config: ProductConfig): string {
  return FAMILY_LABELS[config.family] ?? config.family;
}

/** Strips the cache-busting query so the URL can be resolved on disk. */
export function modelFilePath(modelUrl: string): string | null {
  if (!modelUrl) return null;
  return modelUrl.split("?")[0];
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "No mesh file";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function summarize(
  config: ProductConfig,
  modelBytes: number | null,
): ProductSummary {
  const surface = config.editableSurfaces[0];
  const inches = surface.displayUnit === "in";
  const millimetres = surface.displayUnit === "mm";
  const size = (cm: number) =>
    (inches ? cm / 2.54 : millimetres ? cm * 10 : cm).toFixed(inches ? 2 : 1);

  return {
    id: config.id,
    name: config.name,
    familyLabel: familyLabel(config),
    surfaceCount: config.editableSurfaces.length,
    sectionCount: config.editableSurfaces.reduce(
      (total, s) => total + (s.sections?.length ?? 0),
      0,
    ),
    printSize: `${size(surface.physicalWidthCm)} × ${size(surface.physicalHeightCm)} ${
      inches ? "in" : millimetres ? "mm" : "cm"
    }`,
    canvasSize: `${surface.editorWidth} × ${surface.editorHeight} px`,
    modelBytes,
  };
}

/**
 * Preview backdrop. Clear-barrier film is almost invisible against the default
 * light stage, so that material gets a deeper one.
 */
export function previewBackground(config: ProductConfig): string {
  return config.materialProfile === "clear-barrier-gloss" ? "#dcdde1" : "#eaeaec";
}
