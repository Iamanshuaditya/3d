import { createHash } from "node:crypto";
import { getProduct } from "@/lib/configurator/product-config";
import {
  CODE_PRODUCT_DEFINITIONS,
  CODE_PRODUCT_VERSIONS,
  legacyProductVersion,
} from "@/lib/configurator/product-definitions";
import {
  parseOptionSelection,
  resolveProductConfiguration,
  validateProductVersion,
} from "@/platform/products/configuration-resolver";
import { ProductDomainError } from "@/platform/products/errors";
import type { ProductCatalogRepository } from "@/platform/products/repository";
import type {
  OptionSelection,
  ProductCatalogReader,
  ProductConfigurationProvider,
  ProductDefinition,
  ProductDefinitionSnapshot,
  ProductVersion,
  ResolvedProductConfiguration,
} from "@/platform/products/types";

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

export function canonicalProductJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

export function productVersionChecksum(version: ProductVersion) {
  return createHash("sha256").update(canonicalProductJson(version)).digest("hex");
}

function definitionSnapshot(definition: ProductDefinition): ProductDefinitionSnapshot {
  return {
    name: definition.name,
    ...(definition.description ? { description: definition.description } : {}),
    options: structuredClone(definition.options),
    presentation: structuredClone(definition.presentation),
    capabilities: structuredClone(definition.capabilities),
    templateCompatibility: [...definition.templateCompatibility],
  };
}

function publishedDefinition(
  definition: ProductDefinition,
  version: ProductVersion,
): ProductDefinition {
  return {
    ...structuredClone(definition),
    ...structuredClone(version.definition),
    id: version.productId,
    status: "published",
    currentVersionId: version.id,
    updatedAt: version.publishedAt,
  };
}

function legacyP0Version(productId: string, versionId: string): ProductVersion | null {
  if (versionId !== `${productId}@legacy-v1`) return null;
  const config = getProduct(productId);
  if (!config) return null;
  const current = legacyProductVersion(config, 1);
  return {
    ...current,
    id: versionId,
    resolution: {
      kind: "static",
      productConfig: { ...structuredClone(config), productVersionId: versionId },
    },
  };
}

export class ProductCatalogService implements ProductCatalogReader {
  private synchronization: Promise<void> | null = null;

  constructor(
    private readonly repository: ProductCatalogRepository,
    private readonly providers: Readonly<Record<string, ProductConfigurationProvider>> = {},
    private readonly codeDefinitions: Readonly<Record<string, ProductDefinition>> =
      CODE_PRODUCT_DEFINITIONS,
    private readonly codeVersions: Readonly<Record<string, ProductVersion>> = CODE_PRODUCT_VERSIONS,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private async synchronizeCodeCatalog() {
    const versions = Object.values(this.codeVersions).sort((left, right) =>
      left.productId.localeCompare(right.productId) || left.version - right.version,
    );
    for (const version of versions) {
      const definition = this.codeDefinitions[version.productId];
      if (!definition) {
        throw new ProductDomainError(
          "PRODUCT_DEFINITION_MISSING",
          `Code product ${version.productId} has no definition.`,
        );
      }
      await this.publish(definition, version, false);
    }
  }

  private async ensureSynchronized() {
    this.synchronization ??= this.synchronizeCodeCatalog().catch((error) => {
      this.synchronization = null;
      throw error;
    });
    await this.synchronization;
  }

  async saveDraft(definition: ProductDefinition) {
    if (definition.status !== "draft") {
      throw new ProductDomainError("DRAFT_REQUIRED", "Only draft definitions can be edited.");
    }
    return this.repository.upsertDraft(definition, this.clock());
  }

  async publish(
    definition: ProductDefinition,
    version: ProductVersion,
    synchronize = true,
  ): Promise<ProductVersion> {
    if (synchronize) await this.ensureSynchronized();
    validateProductVersion(version);
    if (
      definition.id !== version.productId ||
      canonicalProductJson(definitionSnapshot(definition)) !== canonicalProductJson(version.definition)
    ) {
      throw new ProductDomainError(
        "PRODUCT_VERSION_MISMATCH",
        "The published version snapshot does not match its product definition.",
      );
    }
    const published = publishedDefinition(definition, version);
    const stored = await this.repository.publish(
      published,
      version,
      productVersionChecksum(version),
      this.clock(),
    );
    if (synchronize) {
      console.info(JSON.stringify({
        scope: "vortex-platform",
        event: "product.version-published",
        productId: version.productId,
        productVersionId: version.id,
        version: version.version,
      }));
    }
    return stored;
  }

  async currentVersion(productId: string): Promise<ProductVersion> {
    await this.ensureSynchronized();
    const version = await this.repository.findCurrentVersion(productId);
    if (!version) {
      throw new ProductDomainError("PRODUCT_NOT_FOUND", `Product ${productId} is not published.`);
    }
    return version;
  }

  async version(productId: string, versionId: string): Promise<ProductVersion> {
    await this.ensureSynchronized();
    const stored = await this.repository.findVersion(productId, versionId);
    if (stored) return stored;
    const legacy = legacyP0Version(productId, versionId);
    if (legacy) return legacy;
    throw new ProductDomainError(
      "PRODUCT_VERSION_NOT_FOUND",
      `Product version ${versionId} is unavailable.`,
    );
  }

  async definition(productId: string): Promise<ProductDefinition> {
    await this.ensureSynchronized();
    const definition = await this.repository.findDefinition(productId);
    if (!definition) {
      throw new ProductDomainError("PRODUCT_NOT_FOUND", `Product ${productId} is unavailable.`);
    }
    return definition;
  }

  async resolve(
    productId: string,
    versionId: string | null,
    selection: OptionSelection = {},
  ): Promise<ResolvedProductConfiguration> {
    const version = versionId
      ? await this.version(productId, versionId)
      : await this.currentVersion(productId);
    try {
      return resolveProductConfiguration(version, parseOptionSelection(selection), this.providers);
    } catch (error) {
      console.warn(JSON.stringify({
        scope: "vortex-platform",
        event: "product.configuration-resolution-failed",
        productId,
        productVersionId: version.id,
        code: error instanceof ProductDomainError ? error.code : "UNKNOWN",
      }));
      throw error;
    }
  }
}
