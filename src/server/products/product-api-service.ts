import { configurationStudioHref } from "@/lib/projects/location";
import { supportsManufacturingSvg } from "@/lib/print/manufacturing-geometry";
import { getPrinterProfile } from "@/lib/print/printer-profiles";
import { NotFoundError, ValidationError } from "@/platform/projects/errors";
import { resolveStudioPresentation } from "@/platform/presentation/resolve-studio-presentation";
import { ProductDomainError } from "@/platform/products/errors";
import { parseOptionSelection } from "@/platform/products/configuration-resolver";
import type {
  ProductDetailDto,
  ProductOptionDto,
  ProductOptionRuleDto,
  ProductSummaryDto,
  ProductVersionReferenceDto,
  ResolvedProductConfigurationDto,
} from "@/platform/products/public-types";
import type {
  OptionRule,
  OptionSelection,
  ProductCatalogReader,
  ProductDefinition,
  ProductOption,
  ProductVersion,
  ResolvedProductConfiguration,
} from "@/platform/products/types";

function translateProductError(error: unknown): never {
  if (!(error instanceof ProductDomainError)) throw error;
  if (error.code === "PRODUCT_NOT_FOUND" || error.code === "PRODUCT_VERSION_NOT_FOUND") {
    throw new NotFoundError(error.message);
  }
  throw new ValidationError(error.code, error.message, error.details);
}

function ruleDto(rule: OptionRule | undefined): ProductOptionRuleDto | undefined {
  if (!rule) return undefined;
  const conditions = (values: NonNullable<OptionRule["all"]>) =>
    values.map((condition) => ({
      optionId: condition.optionId,
      operator: condition.operator,
      value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
    }));
  return {
    ...(rule.all ? { all: conditions(rule.all) } : {}),
    ...(rule.any ? { any: conditions(rule.any) } : {}),
  };
}

function optionBase(option: ProductOption) {
  return {
    id: option.id,
    label: option.label,
    ...(option.description ? { description: option.description } : {}),
    required: option.required ?? false,
    ...(option.visibleWhen ? { visibleWhen: ruleDto(option.visibleWhen) } : {}),
    ...(option.availableWhen ? { availableWhen: ruleDto(option.availableWhen) } : {}),
  };
}

function optionDto(option: ProductOption): ProductOptionDto {
  const base = optionBase(option);
  switch (option.kind) {
    case "select":
      return {
        ...base,
        kind: option.kind,
        ...(option.defaultValue !== undefined ? { defaultValue: option.defaultValue } : {}),
        values: option.values.map((value) => ({
          value: value.value,
          label: value.label,
          ...(value.availableWhen ? { availableWhen: ruleDto(value.availableWhen) } : {}),
        })),
      };
    case "number":
      return {
        ...base,
        kind: option.kind,
        min: option.min,
        max: option.max,
        ...(option.step !== undefined ? { step: option.step } : {}),
        ...(option.unit ? { unit: option.unit } : {}),
        ...(option.defaultValue !== undefined ? { defaultValue: option.defaultValue } : {}),
      };
    case "dimension":
      return {
        ...base,
        kind: option.kind,
        min: option.min,
        max: option.max,
        ...(option.step !== undefined ? { step: option.step } : {}),
        unit: option.unit,
        productionUnit: option.productionUnit,
        ...(option.defaultValue !== undefined ? { defaultValue: option.defaultValue } : {}),
      };
    case "boolean":
      return {
        ...base,
        kind: option.kind,
        ...(option.defaultValue !== undefined ? { defaultValue: option.defaultValue } : {}),
      };
  }
}

function assertPublicProduct(definition: ProductDefinition) {
  if (!definition.currentVersionId || definition.visibility !== "public") {
    throw new NotFoundError("The requested product was not found.");
  }
}

function versionReference(
  version: ProductVersion,
  currentVersionId: string,
): ProductVersionReferenceDto {
  return {
    id: version.id,
    version: version.version,
    publishedAt: version.publishedAt,
    current: version.id === currentVersionId,
  };
}

function templateUrl(productId: string, selection: OptionSelection) {
  const url = new URL("http://vortex.invalid/templates");
  url.searchParams.set("product", productId);
  const options = Object.entries(selection);
  if (options.length) {
    url.searchParams.set(
      "options",
      JSON.stringify(Object.fromEntries(options.sort(([left], [right]) =>
        left.localeCompare(right),
      ))),
    );
  }
  return url.toString().replace("http://vortex.invalid", "");
}

function summary(
  version: ProductVersion,
  currentVersionId = version.id,
  visibility: ProductDefinition["visibility"] = "public",
): ProductSummaryDto {
  return {
    id: version.productId,
    name: version.definition.name,
    description: version.definition.description ?? null,
    status: "published",
    visibility,
    currentVersion: versionReference(version, currentVersionId),
    presentationMode: version.definition.presentation.mode,
    capabilities: structuredClone(version.definition.capabilities),
    configurable: version.definition.options.length > 0,
    options: version.definition.options.map(optionDto),
    links: {
      self: `/api/v1/products/${encodeURIComponent(version.productId)}`,
      resolve: `/api/v1/products/${encodeURIComponent(version.productId)}/configurations/resolve`,
      templates: `/templates?product=${encodeURIComponent(version.productId)}`,
    },
  };
}

function configurationDto(
  resolved: ResolvedProductConfiguration,
): ResolvedProductConfigurationDto {
  const { productConfig } = resolved;
  const presentation = resolveStudioPresentation(
    productConfig,
    resolved.presentation.mode,
  );
  const targets = new Map(presentation.targets.map((target) => [target.surfaceId, target]));
  const profile = getPrinterProfile(productConfig.printProfileId);
  const formats: Array<"pdf" | "svg"> = ["pdf"];
  if (supportsManufacturingSvg(productConfig)) formats.push("svg");
  return {
    productId: resolved.productId,
    name: productConfig.name,
    productVersionId: resolved.productVersionId,
    configurationId: resolved.configurationId,
    selection: { ...resolved.selection },
    resolvedOptions: Object.fromEntries(
      Object.entries(resolved.options).map(([id, value]) => [id, {
        kind: value.kind,
        value: value.value,
        displayLabel: value.displayLabel,
        ...(value.unit ? { unit: value.unit } : {}),
      }]),
    ),
    presentation: {
      mode: presentation.mode,
      previewKind: presentation.previewKind,
      navigationLabel: presentation.navigationLabel,
    },
    capabilities: structuredClone(resolved.capabilities),
    surfaces: productConfig.editableSurfaces.map((surface) => {
      const target = targets.get(surface.id);
      if (!target) throw new Error(`Resolved surface ${surface.id} has no navigation target.`);
      return {
        id: surface.id,
        label: surface.label,
        navigation: {
          id: target.id,
          kind: target.kind,
          order: target.order,
          ...(target.pageNumber !== undefined ? { pageNumber: target.pageNumber } : {}),
          ...(target.side ? { side: target.side } : {}),
        },
        physical: {
          widthMm: surface.physicalWidthCm * 10,
          heightMm: surface.physicalHeightCm * 10,
          displayUnit: surface.displayUnit ?? "cm",
        },
        renderModes: surface.renderModes?.length ? [...surface.renderModes] : ["print"],
        regions: (surface.sections ?? []).map((region) => ({
          id: region.id,
          label: region.label,
          xMm: region.xCm * 10,
          yMm: region.yCm * 10,
          widthMm: region.widthCm * 10,
          heightMm: region.heightCm * 10,
          rotationDegrees: region.contentRotation,
        })),
      };
    }),
    production: {
      profileId: profile.id,
      standard: profile.standard,
      approval: profile.approval,
      formats,
    },
    templateCompatibility: [...resolved.templateCompatibility],
    links: {
      product: `/api/v1/products/${encodeURIComponent(resolved.productId)}?version=${encodeURIComponent(resolved.productVersionId)}`,
      studio: configurationStudioHref({
        productId: resolved.productId,
        productVersionId: resolved.productVersionId,
        optionSelection: resolved.selection,
      }),
      templates: templateUrl(resolved.productId, resolved.selection),
    },
  };
}

export class ProductApiService {
  constructor(private readonly catalog: ProductCatalogReader) {}

  async list(): Promise<ProductSummaryDto[]> {
    const definitions = await this.catalog.listDefinitions();
    const publicDefinitions = definitions.filter(
      (definition) => definition.currentVersionId && definition.visibility === "public",
    );
    const products = await Promise.all(
      publicDefinitions.map(async (definition) => ({
        definition,
        version: await this.catalog.currentVersion(definition.id),
      })),
    );
    return products.map(({ definition, version }) =>
      summary(version, version.id, definition.visibility)
    ).sort((left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  }

  async get(productId: string, versionId?: string): Promise<ProductDetailDto> {
    try {
      const definition = await this.catalog.definition(productId);
      assertPublicProduct(definition);
      const current = await this.catalog.currentVersion(productId);
      const selected = versionId
        ? await this.catalog.version(productId, versionId)
        : current;
      const versions = await this.catalog.listVersions(productId);
      return {
        ...summary(selected, current.id, definition.visibility),
        currentVersion: versionReference(current, current.id),
        selectedVersion: versionReference(selected, current.id),
        versions: versions.map((version) => versionReference(version, current.id)),
        templateCompatibility: [...selected.definition.templateCompatibility],
      };
    } catch (error) {
      translateProductError(error);
    }
  }

  async resolve(
    productId: string,
    versionId: string | null,
    selection: unknown,
  ): Promise<ResolvedProductConfigurationDto> {
    try {
      assertPublicProduct(await this.catalog.definition(productId));
      return configurationDto(
        await this.catalog.resolve(productId, versionId, parseOptionSelection(selection)),
      );
    } catch (error) {
      translateProductError(error);
    }
  }
}
