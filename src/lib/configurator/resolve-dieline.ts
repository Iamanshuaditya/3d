import type { ProductConfig, SurfaceDieline } from "@/types/configurator";
import { resolveCartonSpec } from "./carton-spec";
import { dielineOverlay } from "./carton-geometry";
import { structuralCartonOverlay } from "./structural-carton";
import { POUCHES } from "./pouch-spec";
import { pouchDielineOverlay } from "./pouch-geometry";

function insetRectangle(
  surface: ProductConfig["editableSurfaces"][number],
  inset: number,
) {
  return {
    points: [
      inset, inset,
      surface.editorWidth - inset, inset,
      surface.editorWidth - inset, surface.editorHeight - inset,
      inset, surface.editorHeight - inset,
    ],
    closed: true,
  };
}

function withFallbackSurfaceGuides(
  surface: ProductConfig["editableSurfaces"][number],
  dieline: SurfaceDieline,
): SurfaceDieline {
  const bleedInset = surface.guides?.bleed ?? 0;
  const safeInset = surface.guides?.safeArea ?? 0;
  return {
    ...dieline,
    bleed: dieline.bleed?.length
      ? dieline.bleed
      : bleedInset > 0
        ? [insetRectangle(surface, bleedInset)]
        : undefined,
    safety: dieline.safety?.length
      ? dieline.safety
      : safeInset > 0
        ? [insetRectangle(surface, safeInset)]
        : undefined,
  };
}

/**
 * Resolves every product family to one common, editor-coordinate dieline.
 * Both the editor overlay and the print engine call this adapter so product
 * integrations cannot drift between preview and production output.
 */
export function resolveSurfaceDieline(
  config: ProductConfig,
  surface: ProductConfig["editableSurfaces"][number],
): SurfaceDieline {
  if (surface.rectangularLayout) {
    const { trimBoxMm, safeAreaBoxMm, pxPerMm, showCenterGuides } = surface.rectangularLayout;
    const left = trimBoxMm.x * pxPerMm;
    const top = trimBoxMm.y * pxPerMm;
    const right = (trimBoxMm.x + trimBoxMm.width) * pxPerMm;
    const bottom = (trimBoxMm.y + trimBoxMm.height) * pxPerMm;
    const safeLeft = safeAreaBoxMm.x * pxPerMm;
    const safeTop = safeAreaBoxMm.y * pxPerMm;
    const safeRight = (safeAreaBoxMm.x + safeAreaBoxMm.width) * pxPerMm;
    const safeBottom = (safeAreaBoxMm.y + safeAreaBoxMm.height) * pxPerMm;
    return withFallbackSurfaceGuides(surface, {
      cuts: [
        {
          points: [left, top, right, top, right, bottom, left, bottom],
          closed: true,
        },
      ],
      creases: [],
      bleed: [
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
      safety: [
        {
          points: [
            safeLeft, safeTop,
            safeRight, safeTop,
            safeRight, safeBottom,
            safeLeft, safeBottom,
          ],
          closed: true,
        },
      ],
      technical: showCenterGuides
        ? [
            {
              points: [surface.editorWidth / 2, 0, surface.editorWidth / 2, surface.editorHeight],
              closed: false,
            },
            {
              points: [0, surface.editorHeight / 2, surface.editorWidth, surface.editorHeight / 2],
              closed: false,
            },
          ]
        : [],
    });
  }

  // A canonical structural authority outranks generated/legacy UI overlays.
  // This is what keeps editor geometry on the same source as exact 3D panels
  // and manufacturing output rather than letting a stale surface.dieline win.
  if (config.family === "folded-carton") {
    const spec = resolveCartonSpec(config);
    if (spec?.structural) {
      const exact = structuralCartonOverlay(spec, surface.editorWidth, surface.editorHeight);
      if (exact) return withFallbackSurfaceGuides(surface, exact);
    }
  }

  if (surface.dieline) return withFallbackSurfaceGuides(surface, surface.dieline);

  if (config.family === "folded-carton") {
    const spec = resolveCartonSpec(config);
    if (spec) {
      return withFallbackSurfaceGuides(
        surface,
        dielineOverlay(spec, surface.editorWidth, surface.editorHeight),
      );
    }
  }

  if (config.pouchSpecId) {
    const spec = POUCHES[config.pouchSpecId];
    if (spec) {
      return withFallbackSurfaceGuides(
        surface,
        pouchDielineOverlay(spec, surface.editorWidth, surface.editorHeight),
      );
    }
  }

  // Labels, sleeves and other rectangular print areas do not require a
  // product-specific CAD adapter. Their trim is the physical page rectangle.
  return withFallbackSurfaceGuides(surface, {
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
  });
}
