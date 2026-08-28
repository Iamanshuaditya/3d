import { configurationStudioHref } from "@/lib/projects/location";
import type {
  ProductOperationsItemDto,
  ProductValidationIssueDto,
} from "@/platform/products/operations-types";
import type {
  ProductCatalogReader,
  ProductDefinition,
  ProductVersion,
} from "@/platform/products/types";
import { validateProductVersion } from "@/platform/products/configuration-resolver";
import { productProvenanceDiagnostics } from "@/lib/provenance/diagnostics";
import type { ProductConfig } from "@/types/configurator";
import {
  supportedProductionFormats,
  validateResolvedProductContract,
} from "./product-contract-validator";

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
        issues.push(...validateResolvedProductContract(
          config,
          current.definition.presentation.mode,
        ));
      } catch (error) {
        issues.push({
          code: "DEFAULT_RESOLUTION_FAILED",
          severity: "error",
          message: error instanceof Error ? error.message : "Default configuration failed.",
        });
      }
    }

    const formats = config ? supportedProductionFormats(config) : [];
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
      provenance: config ? productProvenanceDiagnostics(config) : null,
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
