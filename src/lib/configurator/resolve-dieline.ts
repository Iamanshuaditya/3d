import type { ProductConfig, SurfaceDieline } from "@/types/configurator";
import { CARTONS } from "./carton-spec";
import { dielineOverlay } from "./carton-geometry";
import { POUCHES } from "./pouch-spec";
import { pouchDielineOverlay } from "./pouch-geometry";

/**
 * Resolves every product family to one common, editor-coordinate dieline.
 * Both the editor overlay and the print engine call this adapter so product
 * integrations cannot drift between preview and production output.
 */
export function resolveSurfaceDieline(
  config: ProductConfig,
  surface: ProductConfig["editableSurfaces"][number],
): SurfaceDieline {
  if (surface.dieline) return surface.dieline;

  if (config.family === "folded-carton") {
    const spec = CARTONS[config.cartonSpecId ?? ""];
    if (spec) return dielineOverlay(spec, surface.editorWidth, surface.editorHeight);
  }

  if (config.pouchSpecId) {
    const spec = POUCHES[config.pouchSpecId];
    if (spec) return pouchDielineOverlay(spec, surface.editorWidth, surface.editorHeight);
  }

  // Labels, sleeves and other rectangular print areas do not require a
  // product-specific CAD adapter. Their trim is the physical page rectangle.
  return {
    cuts: [
      {
        points: [
          0, 0,
          surface.editorWidth, 0,
          surface.editorWidth, surface.editorHeight,
          0, surface.editorHeight,
        ],
        closed: true,
      },
    ],
    creases: [],
  };
}
