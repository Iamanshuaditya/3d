import type { ProductPresentationMode } from "@/platform/products/types";
import type { EditableSurface, ProductConfig } from "@/types/configurator";
import type {
  EditorTarget,
  EditorTargetKind,
  ResolvedStudioPresentation,
} from "./types";

function inferredKind(surface: EditableSurface): EditorTargetKind {
  if (surface.presentation) return surface.presentation.kind;
  return surface.sections?.length ? "continuous-web" : "print-area";
}

function target(surface: EditableSurface, index: number): EditorTarget {
  const kind = inferredKind(surface);
  if (kind === "page") {
    const pageNumber = surface.presentation?.kind === "page"
      ? surface.presentation.pageNumber
      : Number.NaN;
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new Error(`Surface ${surface.id} has an invalid page number.`);
    }
    return {
      id: `page:${pageNumber}:${surface.id}`,
      surfaceId: surface.id,
      label: surface.label,
      kind,
      order: pageNumber,
      pageNumber,
      ...(surface.presentation?.kind === "page" && surface.presentation.side
        ? { side: surface.presentation.side }
        : {}),
    };
  }
  const configuredOrder = surface.presentation?.kind === kind
    ? surface.presentation.order
    : undefined;
  if (
    configuredOrder !== undefined &&
    (!Number.isInteger(configuredOrder) || configuredOrder < 0)
  ) {
    throw new Error(`Surface ${surface.id} has an invalid presentation order.`);
  }
  return {
    id: `${kind}:${surface.id}`,
    surfaceId: surface.id,
    label: surface.label,
    kind,
    order: configuredOrder ?? index,
  };
}

export function resolveStudioPresentation(
  config: ProductConfig,
  mode: ProductPresentationMode,
): ResolvedStudioPresentation {
  const targets = config.editableSurfaces
    .map(target)
    .sort((left, right) => left.order - right.order || left.surfaceId.localeCompare(right.surfaceId));
  const surfaceIds = new Set<string>();
  const pageNumbers = new Set<number>();
  for (const item of targets) {
    if (surfaceIds.has(item.surfaceId)) {
      throw new Error(`Editable surface ${item.surfaceId} is duplicated.`);
    }
    surfaceIds.add(item.surfaceId);
    if (item.pageNumber !== undefined) {
      if (pageNumbers.has(item.pageNumber)) {
        throw new Error(`Page number ${item.pageNumber} is duplicated.`);
      }
      pageNumbers.add(item.pageNumber);
    }
  }

  const allPages = targets.length > 0 && targets.every((item) => item.kind === "page");
  const allPrintAreas = targets.length > 0 && targets.every((item) => item.kind === "print-area");
  return {
    mode,
    previewKind: mode === "2d-first" ? "2d-proof" : "3d-product",
    navigationLabel: allPages
      ? "Pages"
      : allPrintAreas
        ? "Print areas"
        : "Printable surfaces",
    targets,
  };
}
