import { ProductDomainError } from "@/platform/products/errors";
import type { ProductCatalogRepository } from "@/platform/products/repository";
import type { ProductDefinition, ProductVersion } from "@/platform/products/types";
import type { VortexDatabase } from "@/server/persistence/database";

type DefinitionRow = {
  id: string;
  status: ProductDefinition["status"];
  definition_json: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  product_id: string;
  version_number: number;
  version_json: string;
  sha256: string;
  published_at: string;
};

function decodeDefinition(row: DefinitionRow): ProductDefinition {
  const definition = JSON.parse(row.definition_json) as ProductDefinition;
  return {
    ...definition,
    id: row.id,
    status: row.status,
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function decodeVersion(row: VersionRow): ProductVersion {
  const version = JSON.parse(row.version_json) as ProductVersion;
  return {
    ...version,
    id: row.id,
    productId: row.product_id,
    version: row.version_number,
    publishedAt: row.published_at,
  };
}

export class SqliteProductCatalogRepository implements ProductCatalogRepository {
  constructor(private readonly database: VortexDatabase) {}

  async upsertDraft(definition: ProductDefinition, now: string): Promise<ProductDefinition> {
    const existing = this.database.prepare(
      "SELECT * FROM product_definitions WHERE id = ?",
    ).get(definition.id) as DefinitionRow | undefined;
    const draft: ProductDefinition = {
      ...structuredClone(definition),
      status: "draft",
      currentVersionId: existing?.current_version_id ?? definition.currentVersionId,
      createdAt: existing?.created_at ?? definition.createdAt ?? now,
      updatedAt: now,
    };
    this.database.prepare(`
      INSERT INTO product_definitions (
        id, status, definition_json, current_version_id, created_at, updated_at
      ) VALUES (?, 'draft', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = 'draft', definition_json = excluded.definition_json,
        updated_at = excluded.updated_at
    `).run(
      draft.id,
      JSON.stringify(draft),
      draft.currentVersionId,
      draft.createdAt,
      draft.updatedAt,
    );
    return (await this.findDefinition(draft.id))!;
  }

  async publish(
    definition: ProductDefinition,
    version: ProductVersion,
    sha256: string,
    now: string,
  ): Promise<ProductVersion> {
    if (definition.id !== version.productId || definition.currentVersionId !== version.id) {
      throw new ProductDomainError(
        "PRODUCT_VERSION_MISMATCH",
        "A published product definition must point at the version being published.",
      );
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new ProductDomainError("INVALID_VERSION_CHECKSUM", "Product version checksum is invalid.");
    }

    return this.database.transaction(() => {
      const sameId = this.database.prepare(
        "SELECT * FROM product_versions WHERE id = ?",
      ).get(version.id) as VersionRow | undefined;
      if (sameId && (
        sameId.product_id !== version.productId ||
        sameId.version_number !== version.version ||
        sameId.sha256 !== sha256
      )) {
        throw new ProductDomainError(
          "PUBLISHED_VERSION_IMMUTABLE",
          `Published product version ${version.id} cannot be changed. Publish a new version instead.`,
        );
      }
      const sameNumber = this.database.prepare(`
        SELECT * FROM product_versions WHERE product_id = ? AND version_number = ?
      `).get(version.productId, version.version) as VersionRow | undefined;
      if (sameNumber && sameNumber.id !== version.id) {
        throw new ProductDomainError(
          "PRODUCT_VERSION_NUMBER_CONFLICT",
          `Version ${version.version} is already published as ${sameNumber.id}.`,
        );
      }

      const existingDefinition = this.database.prepare(
        "SELECT * FROM product_definitions WHERE id = ?",
      ).get(definition.id) as DefinitionRow | undefined;
      if (!existingDefinition) {
        this.database.prepare(`
          INSERT INTO product_definitions (
            id, status, definition_json, current_version_id, created_at, updated_at
          ) VALUES (?, 'published', ?, ?, ?, ?)
        `).run(
          definition.id,
          JSON.stringify(definition),
          definition.currentVersionId,
          definition.createdAt || now,
          now,
        );
      }

      if (!sameId) {
        this.database.prepare(`
          INSERT INTO product_versions (
            id, product_id, version_number, version_json, sha256, published_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          version.id,
          version.productId,
          version.version,
          JSON.stringify(version),
          sha256,
          version.publishedAt,
        );
      }

      const current = this.database.prepare(`
        SELECT version.version_number
        FROM product_definitions definition
        LEFT JOIN product_versions version ON version.id = definition.current_version_id
        WHERE definition.id = ?
      `).get(definition.id) as { version_number: number | null } | undefined;
      if (!current || current.version_number === null || version.version >= current.version_number) {
        this.database.prepare(`
          UPDATE product_definitions
          SET status = 'published', definition_json = ?, current_version_id = ?, updated_at = ?
          WHERE id = ?
        `).run(JSON.stringify(definition), version.id, now, definition.id);
      }
      return sameId ? decodeVersion(sameId) : structuredClone(version);
    })();
  }

  async findDefinition(productId: string): Promise<ProductDefinition | null> {
    const row = this.database.prepare(
      "SELECT * FROM product_definitions WHERE id = ?",
    ).get(productId) as DefinitionRow | undefined;
    return row ? decodeDefinition(row) : null;
  }

  async listDefinitions(): Promise<ProductDefinition[]> {
    const rows = this.database.prepare(
      "SELECT * FROM product_definitions ORDER BY id",
    ).all() as DefinitionRow[];
    return rows.map(decodeDefinition);
  }

  async findVersion(productId: string, versionId: string): Promise<ProductVersion | null> {
    const row = this.database.prepare(`
      SELECT * FROM product_versions WHERE id = ? AND product_id = ?
    `).get(versionId, productId) as VersionRow | undefined;
    return row ? decodeVersion(row) : null;
  }

  async findCurrentVersion(productId: string): Promise<ProductVersion | null> {
    const row = this.database.prepare(`
      SELECT version.* FROM product_versions version
      JOIN product_definitions definition ON definition.current_version_id = version.id
      WHERE definition.id = ? AND version.product_id = definition.id
    `).get(productId) as VersionRow | undefined;
    return row ? decodeVersion(row) : null;
  }
}
