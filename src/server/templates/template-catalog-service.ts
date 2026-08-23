import {
  CODE_TEMPLATE_DEFINITIONS,
  CODE_TEMPLATE_VERSIONS,
} from "@/lib/templates/fixtures";
import { parseDesignDocument } from "@/platform/projects/design-document";
import type { ProductCatalogReader } from "@/platform/products/types";
import { TemplateDomainError } from "@/platform/templates/errors";
import {
  parsePersonalizationData,
  validateFieldKey,
  validatePlaceholderValues,
} from "@/platform/templates/personalization";
import type { TemplateCatalogRepository } from "@/platform/templates/repository";
import type {
  DesignTemplateDefinition,
  DesignTemplateVersion,
  TemplateListQuery,
} from "@/platform/templates/types";
import { canonicalJson, canonicalJsonSha256 } from "@/server/persistence/canonical-json";

const TEMPLATE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/;

function validateTemplateIdentity(
  templateId: string,
  versionId?: string,
  versionNumber?: number,
) {
  if (!TEMPLATE_ID.test(templateId)) {
    throw new TemplateDomainError("TEMPLATE_ID_INVALID", "Template identity is invalid.");
  }
  if (
    versionId !== undefined &&
    (versionNumber === undefined || versionId !== `${templateId}@${versionNumber}`)
  ) {
    throw new TemplateDomainError("TEMPLATE_ID_INVALID", "Template version identity is invalid.");
  }
}

function validateTaxonomy(version: DesignTemplateVersion) {
  const { taxonomy } = version;
  const textValues = [
    taxonomy.category,
    taxonomy.subcategory,
    taxonomy.style,
    taxonomy.industry,
    taxonomy.occasion,
  ].filter((value): value is string => value !== undefined);
  if (
    textValues.some((value) => !value.trim() || value.length > 120) ||
    taxonomy.tags.length > 32 ||
    taxonomy.colorFamilies.length > 16 ||
    taxonomy.languages.length > 16 ||
    [...taxonomy.tags, ...taxonomy.colorFamilies, ...taxonomy.languages].some(
      (value) => !value.trim() || value.length > 64,
    )
  ) {
    throw new TemplateDomainError("TEMPLATE_TAXONOMY_INVALID", "Template taxonomy is invalid.");
  }
}

function metadataMatches(
  definition: DesignTemplateDefinition,
  version: DesignTemplateVersion,
) {
  return canonicalJson({
    name: definition.name,
    description: definition.description,
    taxonomy: definition.taxonomy,
  }) === canonicalJson({
    name: version.name,
    description: version.description,
    taxonomy: version.taxonomy,
  });
}

function definitionForVersion(
  definition: DesignTemplateDefinition,
  version: DesignTemplateVersion,
): DesignTemplateDefinition {
  return {
    ...structuredClone(definition),
    name: version.name,
    ...(version.description
      ? { description: version.description }
      : { description: undefined }),
    taxonomy: structuredClone(version.taxonomy),
    status: "published",
    currentVersionId: version.id,
    updatedAt: version.publishedAt,
  };
}

export class TemplateCatalogService {
  private synchronization: Promise<void> | null = null;

  constructor(
    private readonly repository: TemplateCatalogRepository,
    private readonly products: ProductCatalogReader,
    private readonly codeDefinitions: Readonly<Record<string, DesignTemplateDefinition>> =
      CODE_TEMPLATE_DEFINITIONS,
    private readonly codeVersions: Readonly<Record<string, DesignTemplateVersion>> =
      CODE_TEMPLATE_VERSIONS,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private async synchronizeCodeCatalog() {
    for (const version of Object.values(this.codeVersions).sort((a, b) =>
      a.templateId.localeCompare(b.templateId) || a.version - b.version,
    )) {
      const definition = this.codeDefinitions[version.templateId];
      if (!definition) {
        throw new TemplateDomainError(
          "TEMPLATE_DEFINITION_MISSING",
          `Code template ${version.templateId} has no definition.`,
        );
      }
      await this.publish(definitionForVersion(definition, version), version, false);
    }
  }

  private async ensureSynchronized() {
    this.synchronization ??= this.synchronizeCodeCatalog().catch((error) => {
      this.synchronization = null;
      throw error;
    });
    await this.synchronization;
  }

  private async validate(
    definition: DesignTemplateDefinition,
    version: DesignTemplateVersion,
  ) {
    validateTemplateIdentity(version.templateId, version.id, version.version);
    if (
      version.status !== "published" ||
      !Number.isInteger(version.version) ||
      version.version < 1 ||
      definition.id !== version.templateId ||
      definition.currentVersionId !== version.id ||
      !metadataMatches(definition, version)
    ) {
      throw new TemplateDomainError(
        "TEMPLATE_VERSION_MISMATCH",
        "Template definition and published version do not match.",
      );
    }
    validateTaxonomy(version);
    if (!version.compatibility.length) {
      throw new TemplateDomainError(
        "TEMPLATE_COMPATIBILITY_MISSING",
        "A template must declare at least one compatible product configuration.",
      );
    }
    const document = parseDesignDocument(version.designDocumentTemplate);
    const definitions = new Map<string, (typeof version.placeholderDefinitions)[number]>();
    for (const placeholder of version.placeholderDefinitions) {
      validateFieldKey(placeholder.key);
      if (
        definitions.has(placeholder.key) ||
        !placeholder.label.trim() ||
        placeholder.label.length > 120 ||
        (placeholder.maxLength !== undefined &&
          (!Number.isInteger(placeholder.maxLength) ||
            placeholder.maxLength < 1 ||
            placeholder.maxLength > 2_000))
      ) {
        throw new TemplateDomainError(
          "PLACEHOLDER_DEFINITION_INVALID",
          `Placeholder ${placeholder.key} is invalid or duplicated.`,
        );
      }
      definitions.set(placeholder.key, placeholder);
    }
    const boundKeys = new Set<string>();
    const documentAssetIds = new Set<string>();
    for (const surface of Object.values(document.surfaces)) {
      for (const element of surface.elements) {
        if (element.type === "text" && element.binding) {
          if (!definitions.has(element.binding.key)) {
            throw new TemplateDomainError(
              "PLACEHOLDER_DEFINITION_MISSING",
              `Bound field ${element.binding.key} has no placeholder definition.`,
            );
          }
          boundKeys.add(element.binding.key);
        }
        if (element.type === "image" && element.assetId) documentAssetIds.add(element.assetId);
      }
    }
    for (const key of definitions.keys()) {
      if (!boundKeys.has(key)) {
        throw new TemplateDomainError(
          "PLACEHOLDER_UNUSED",
          `Placeholder ${key} is not bound to an editable element.`,
        );
      }
    }
    if (
      canonicalJson([...documentAssetIds].sort()) !==
      canonicalJson([...new Set(version.assetIds)].sort())
    ) {
      throw new TemplateDomainError(
        "TEMPLATE_ASSET_MISMATCH",
        "Template asset references do not match its declared stable assets.",
      );
    }
    const defaults = parsePersonalizationData(version.defaultPersonalization);
    validatePlaceholderValues(version.placeholderDefinitions, defaults, {
      requireRequired: false,
    });

    for (const compatibility of version.compatibility) {
      if (!compatibility.productVersionId || !compatibility.configurationId) {
        throw new TemplateDomainError(
          "TEMPLATE_COMPATIBILITY_INEXACT",
          "Published templates must target an exact product version and configuration.",
        );
      }
      if (document.productId !== compatibility.productId) {
        throw new TemplateDomainError(
          "TEMPLATE_PRODUCT_MISMATCH",
          "Portable cross-product surface mapping is not implemented for this template.",
        );
      }
      const resolved = await this.products.resolve(
        compatibility.productId,
        compatibility.productVersionId,
        compatibility.optionSelection,
      );
      if (compatibility.configurationId !== resolved.configurationId) {
        throw new TemplateDomainError(
          "TEMPLATE_CONFIGURATION_MISMATCH",
          "Template compatibility does not reproduce its declared configuration.",
        );
      }
      const expectedSurfaces = new Set(
        resolved.productConfig.editableSurfaces.map((surface) => surface.id),
      );
      const actualSurfaces = Object.keys(document.surfaces);
      if (
        actualSurfaces.length !== expectedSurfaces.size ||
        actualSurfaces.some((surfaceId) => !expectedSurfaces.has(surfaceId))
      ) {
        throw new TemplateDomainError(
          "TEMPLATE_SURFACE_MISMATCH",
          "Template surfaces do not match the compatible product configuration.",
        );
      }
    }
  }

  async publish(
    definition: DesignTemplateDefinition,
    version: DesignTemplateVersion,
    synchronize = true,
  ) {
    if (synchronize) await this.ensureSynchronized();
    await this.validate(definition, version);
    const stored = await this.repository.publish(
      definition,
      version,
      canonicalJsonSha256(version),
      this.clock(),
    );
    if (synchronize) {
      console.info(JSON.stringify({
        scope: "vortex-platform",
        event: "template.version-published",
        templateId: version.templateId,
        templateVersionId: version.id,
      }));
    }
    return stored;
  }

  async version(templateId: string, versionId?: string) {
    await this.ensureSynchronized();
    validateTemplateIdentity(templateId);
    if (versionId !== undefined) {
      const match = versionId.match(/@([1-9][0-9]*)$/);
      validateTemplateIdentity(
        templateId,
        versionId,
        match ? Number(match[1]) : Number.NaN,
      );
    }
    const version = versionId
      ? await this.repository.findVersion(templateId, versionId)
      : await this.repository.findCurrentVersion(templateId);
    if (!version) {
      throw new TemplateDomainError(
        "TEMPLATE_NOT_FOUND",
        `Template ${versionId ?? templateId} is unavailable.`,
      );
    }
    return version;
  }

  async list(query: TemplateListQuery = {}) {
    await this.ensureSynchronized();
    const search = query.search?.trim().toLocaleLowerCase();
    return (await this.repository.listCurrentVersions()).filter((template) => {
      const compatible = template.compatibility.some((candidate) =>
        (!query.productId || candidate.productId === query.productId) &&
        (!query.productVersionId ||
          candidate.productVersionId === query.productVersionId) &&
        (!query.configurationId ||
          candidate.configurationId === query.configurationId),
      );
      if (!compatible) return false;
      if (query.category && template.taxonomy.category !== query.category) return false;
      if (!search) return true;
      const haystack = [
        template.name,
        template.description ?? "",
        template.taxonomy.category,
        template.taxonomy.subcategory ?? "",
        template.taxonomy.style ?? "",
        template.taxonomy.industry ?? "",
        template.taxonomy.occasion ?? "",
        ...template.taxonomy.tags,
      ].join(" ").toLocaleLowerCase();
      return haystack.includes(search);
    });
  }
}
