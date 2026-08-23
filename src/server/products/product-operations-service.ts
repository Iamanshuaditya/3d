import { resolveCartonSpec } from "@/lib/configurator/carton-spec";
import { configurationStudioHref } from "@/lib/projects/location";
import { supportsManufacturingSvg } from "@/lib/print/manufacturing-geometry";
import { PRINTER_PROFILES } from "@/lib/print/printer-profiles";
import { resolveStudioPresentation } from "@/platform/presentation/resolve-studio-presentation";
import type {
  ProductOperationsItemDto,
  ProductValidationIssueDto,
} from "@/platform/products/operations-types";
import type {
  ProductCatalogReader,
  ProductDefinition,
  ProductPresentationMode,
  ProductVersion,
} from "@/platform/products/types";
import { validateProductVersion } from "@/platform/products/configuration-resolver";
import type { ProductConfig } from "@/types/configurator";

const PHYSICAL_TOLERANCE_MM = 0.01;

function validateEngineConfig(
  config: ProductConfig,
  presentationMode: ProductPresentationMode,
  issues: ProductValidationIssueDto[],
) {
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
}

export class ProductOperationsService {
  constructor(private readonly catalog: ProductCatalogReader) {}

  private async inspect(
    definition: ProductDefinition,
  ): Promise<ProductOperationsItemDto> {
    const issues: ProductValidationIssueDto[] = [];
    const versions = await this.catalog.listVersions(definition.id);
    let current: ProductVersion | null = null;
    let config: ProductConfig | null = null;
    let inspectUrl: string | null = null;
    if (!definition.currentVersionId) {
      issues.push({
        code: "NO_PUBLISHED_VERSION",
        severity: "warning",
        message: "This definition has no published version.",
      });
    } else {
      try {
        current = await this.catalog.currentVersion(definition.id);
        validateProductVersion(current);
        const resolved = await this.catalog.resolve(definition.id, current.id, {});
        config = resolved.productConfig;
        inspectUrl = configurationStudioHref({
          productId: resolved.productId,
          productVersionId: resolved.productVersionId,
          optionSelection: resolved.selection,
        });
        validateEngineConfig(config, current.definition.presentation.mode, issues);
      } catch (error) {
        issues.push({
          code: "DEFAULT_RESOLUTION_FAILED",
          severity: "error",
          message: error instanceof Error ? error.message : "Default configuration failed.",
        });
      }
    }

    const formats: Array<"pdf" | "svg"> = config ? ["pdf"] : [];
    if (config && supportsManufacturingSvg(config)) formats.push("svg");
    const passed = !issues.some((issue) => issue.severity === "error");
    if (!passed) {
      console.warn(JSON.stringify({
        scope: "vortex-platform",
        event: "product.validation-failed",
        productId: definition.id,
        errorCount: issues.filter((issue) => issue.severity === "error").length,
      }));
    }
    return {
      id: definition.id,
      name: definition.name,
      visibility: definition.visibility,
      status: definition.status,
      currentVersionId: definition.currentVersionId,
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        publishedAt: version.publishedAt,
        current: version.id === definition.currentVersionId,
        resolutionKind: version.resolution.kind,
      })),
      defaultConfigurationId: config?.configurationId ?? null,
      optionCount: current?.definition.options.length ?? definition.options.length,
      surfaceCount: config?.editableSurfaces.length ?? null,
      manufacturingFormats: formats,
      inspectUrl,
      validation: { passed, issues },
    };
  }

  async list(): Promise<ProductOperationsItemDto[]> {
    const definitions = await this.catalog.listDefinitions();
    const items = await Promise.all(definitions.map((definition) => this.inspect(definition)));
    return items.sort((left, right) =>
      Number(right.validation.passed) - Number(left.validation.passed) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
    );
  }
}
