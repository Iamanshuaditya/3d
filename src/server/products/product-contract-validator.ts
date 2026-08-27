import { resolveCartonSpec } from "@/lib/configurator/carton-spec";
import { supportsManufacturingSvg } from "@/lib/print/manufacturing-geometry";
import { PRINTER_PROFILES } from "@/lib/print/printer-profiles";
import { resolveStudioPresentation } from "@/platform/presentation/resolve-studio-presentation";
import type { ProductValidationIssueDto } from "@/platform/products/operations-types";
import type { ProductPresentationMode } from "@/platform/products/types";
import type { ProductConfig } from "@/types/configurator";
import { deriveFlatSheetGeometry } from "@/lib/configurator/flat-sheet";

const PHYSICAL_TOLERANCE_MM = 0.01;

export function validateResolvedProductContract(
  config: ProductConfig,
  presentationMode: ProductPresentationMode,
): ProductValidationIssueDto[] {
  const issues: ProductValidationIssueDto[] = [];
  if (!config.editableSurfaces.length) {
    issues.push({
      code: "NO_EDITABLE_SURFACES",
      severity: "error",
      message: "The resolved product has no editable surface.",
    });
  }
  const surfaceIds = new Set<string>();
  for (const surface of config.editableSurfaces) {
    if (surfaceIds.has(surface.id)) {
      issues.push({
        code: "DUPLICATE_SURFACE_ID",
        severity: "error",
        message: `Editable surface ${surface.id} is duplicated.`,
      });
    }
    surfaceIds.add(surface.id);
    if (
      !Number.isInteger(surface.editorWidth) ||
      !Number.isInteger(surface.editorHeight) ||
      surface.editorWidth <= 0 ||
      surface.editorHeight <= 0 ||
      !Number.isFinite(surface.physicalWidthCm) ||
      !Number.isFinite(surface.physicalHeightCm) ||
      surface.physicalWidthCm <= 0 ||
      surface.physicalHeightCm <= 0
    ) {
      issues.push({
        code: "INVALID_SURFACE_DIMENSIONS",
        severity: "error",
        message: `Editable surface ${surface.id} has invalid editor or physical dimensions.`,
      });
    }
    for (const region of surface.sections ?? []) {
      const outside =
        region.xCm < 0 ||
        region.yCm < 0 ||
        region.widthCm <= 0 ||
        region.heightCm <= 0 ||
        region.xCm + region.widthCm > surface.physicalWidthCm + PHYSICAL_TOLERANCE_MM / 10 ||
        region.yCm + region.heightCm > surface.physicalHeightCm + PHYSICAL_TOLERANCE_MM / 10;
      if (outside) {
        issues.push({
          code: "REGION_OUTSIDE_SURFACE",
          severity: "error",
          message: `Region ${region.id} falls outside editable surface ${surface.id}.`,
        });
      }
    }
  }

  try {
    resolveStudioPresentation(config, presentationMode);
  } catch (error) {
    issues.push({
      code: "INVALID_PRESENTATION",
      severity: "error",
      message: error instanceof Error ? error.message : "Studio presentation is invalid.",
    });
  }

  if (config.family === "glb" && !config.modelUrl) {
    issues.push({
      code: "MODEL_REQUIRED",
      severity: "error",
      message: "A GLB product must resolve a model URL.",
    });
  }
  if (config.family === "flat-sheet") {
    if (!config.flatSheetSpec || config.editableSurfaces.length !== 1) {
      issues.push({
        code: "FLAT_SHEET_SPEC_REQUIRED",
        severity: "error",
        message: "A flat-sheet product requires one physical specification and one surface.",
      });
    } else {
      const geometry = deriveFlatSheetGeometry(config.flatSheetSpec);
      const surface = config.editableSurfaces[0];
      const matches =
        surface.editorWidth === geometry.editorWidth &&
        surface.editorHeight === geometry.editorHeight &&
        Math.abs(surface.physicalWidthCm * 10 - geometry.fullWidthMm) <= PHYSICAL_TOLERANCE_MM &&
        Math.abs(surface.physicalHeightCm * 10 - geometry.fullHeightMm) <= PHYSICAL_TOLERANCE_MM;
      if (!matches) {
        issues.push({
          code: "FLAT_SHEET_SURFACE_MISMATCH",
          severity: "error",
          message: "Flat-sheet editor/export dimensions do not match its physical specification.",
        });
      }
    }
  }
  if (config.printProfileId && !PRINTER_PROFILES[config.printProfileId]) {
    issues.push({
      code: "PRINT_PROFILE_NOT_FOUND",
      severity: "error",
      message: `Print profile ${config.printProfileId} is not registered.`,
    });
  }

  const carton = resolveCartonSpec(config);
  if (config.family === "folded-carton" && !carton) {
    issues.push({
      code: "CARTON_SPEC_NOT_FOUND",
      severity: "error",
      message: "A folded-carton product must resolve a structural specification.",
    });
  }
  if (carton && config.editableSurfaces.length === 1) {
    const surface = config.editableSurfaces[0];
    const widthMm = surface.physicalWidthCm * 10;
    const heightMm = surface.physicalHeightCm * 10;
    if (
      Math.abs(widthMm - carton.width) > PHYSICAL_TOLERANCE_MM ||
      Math.abs(heightMm - carton.height) > PHYSICAL_TOLERANCE_MM
    ) {
      issues.push({
        code: "STRUCTURAL_SURFACE_MISMATCH",
        severity: "error",
        message: `Print surface ${widthMm}×${heightMm} mm does not match structural blank ${carton.width}×${carton.height} mm.`,
      });
    }
  }
  return issues;
}

export function supportedProductionFormats(config: ProductConfig): Array<"pdf" | "svg"> {
  const formats: Array<"pdf" | "svg"> = ["pdf"];
  if (supportsManufacturingSvg(config)) formats.push("svg");
  return formats;
}
