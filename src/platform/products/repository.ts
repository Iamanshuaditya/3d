import type { ProductDefinition, ProductVersion } from "./types";

export interface ProductCatalogRepository {
  upsertDraft(definition: ProductDefinition, now: string): Promise<ProductDefinition>;
  publish(
    definition: ProductDefinition,
    version: ProductVersion,
    sha256: string,
    now: string,
  ): Promise<ProductVersion>;
  findDefinition(productId: string): Promise<ProductDefinition | null>;
  listDefinitions(): Promise<ProductDefinition[]>;
  findVersion(productId: string, versionId: string): Promise<ProductVersion | null>;
  findCurrentVersion(productId: string): Promise<ProductVersion | null>;
}
