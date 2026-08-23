import { TemplateDomainError } from "@/platform/templates/errors";
import type { TemplateCatalogRepository } from "@/platform/templates/repository";
import type {
  DesignTemplateDefinition,
  DesignTemplateVersion,
} from "@/platform/templates/types";
import type { VortexDatabase } from "@/server/persistence/database";

type DefinitionRow = {
  id: string;
  status: DesignTemplateDefinition["status"];
  definition_json: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  template_id: string;
  version_number: number;
  version_json: string;
  sha256: string;
  published_at: string;
};

function decodeDefinition(row: DefinitionRow): DesignTemplateDefinition {
  return {
    ...(JSON.parse(row.definition_json) as DesignTemplateDefinition),
    id: row.id,
    status: row.status,
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function decodeVersion(row: VersionRow): DesignTemplateVersion {
  return {
    ...(JSON.parse(row.version_json) as DesignTemplateVersion),
    id: row.id,
    templateId: row.template_id,
    version: row.version_number,
    publishedAt: row.published_at,
  };
}

export class SqliteTemplateCatalogRepository implements TemplateCatalogRepository {
  constructor(private readonly database: VortexDatabase) {}

  async publish(
    definition: DesignTemplateDefinition,
    version: DesignTemplateVersion,
    sha256: string,
    now: string,
  ): Promise<DesignTemplateVersion> {
    if (definition.id !== version.templateId || definition.currentVersionId !== version.id) {
      throw new TemplateDomainError(
        "TEMPLATE_VERSION_MISMATCH",
        "A published template definition must point at the version being published.",
      );
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new TemplateDomainError("INVALID_VERSION_CHECKSUM", "Template checksum is invalid.");
    }

    return this.database.transaction(() => {
      const sameId = this.database.prepare(
        "SELECT * FROM design_template_versions WHERE id = ?",
      ).get(version.id) as VersionRow | undefined;
      if (sameId && (
        sameId.template_id !== version.templateId ||
        sameId.version_number !== version.version ||
        sameId.sha256 !== sha256
      )) {
        throw new TemplateDomainError(
          "PUBLISHED_TEMPLATE_IMMUTABLE",
          `Published template version ${version.id} cannot be changed.`,
        );
      }
      const sameNumber = this.database.prepare(`
        SELECT * FROM design_template_versions
        WHERE template_id = ? AND version_number = ?
      `).get(version.templateId, version.version) as VersionRow | undefined;
      if (sameNumber && sameNumber.id !== version.id) {
        throw new TemplateDomainError(
          "TEMPLATE_VERSION_NUMBER_CONFLICT",
          `Template version ${version.version} is already published as ${sameNumber.id}.`,
        );
      }

      const existingDefinition = this.database.prepare(
        "SELECT * FROM design_template_definitions WHERE id = ?",
      ).get(definition.id) as DefinitionRow | undefined;
      if (!existingDefinition) {
        this.database.prepare(`
          INSERT INTO design_template_definitions (
            id, status, definition_json, current_version_id, created_at, updated_at
          ) VALUES (?, 'published', ?, ?, ?, ?)
        `).run(
          definition.id,
          JSON.stringify(definition),
          version.id,
          definition.createdAt || now,
          now,
        );
      }
      if (!sameId) {
        this.database.prepare(`
          INSERT INTO design_template_versions (
            id, template_id, version_number, version_json, sha256, published_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          version.id,
          version.templateId,
          version.version,
          JSON.stringify(version),
          sha256,
          version.publishedAt,
        );
      }

      const current = this.database.prepare(`
        SELECT version.version_number
        FROM design_template_definitions definition
        LEFT JOIN design_template_versions version ON version.id = definition.current_version_id
        WHERE definition.id = ?
      `).get(definition.id) as { version_number: number | null } | undefined;
      if (!current || current.version_number === null || version.version >= current.version_number) {
        this.database.prepare(`
          UPDATE design_template_definitions
          SET status = 'published', definition_json = ?, current_version_id = ?, updated_at = ?
          WHERE id = ?
        `).run(JSON.stringify(definition), version.id, now, definition.id);
      }
      return sameId ? decodeVersion(sameId) : structuredClone(version);
    })();
  }

  async findDefinition(templateId: string): Promise<DesignTemplateDefinition | null> {
    const row = this.database.prepare(
      "SELECT * FROM design_template_definitions WHERE id = ?",
    ).get(templateId) as DefinitionRow | undefined;
    return row ? decodeDefinition(row) : null;
  }

  async findVersion(templateId: string, versionId: string): Promise<DesignTemplateVersion | null> {
    const row = this.database.prepare(`
      SELECT * FROM design_template_versions WHERE id = ? AND template_id = ?
    `).get(versionId, templateId) as VersionRow | undefined;
    return row ? decodeVersion(row) : null;
  }

  async findCurrentVersion(templateId: string): Promise<DesignTemplateVersion | null> {
    const row = this.database.prepare(`
      SELECT version.* FROM design_template_versions version
      JOIN design_template_definitions definition ON definition.current_version_id = version.id
      WHERE definition.id = ? AND version.template_id = definition.id
    `).get(templateId) as VersionRow | undefined;
    return row ? decodeVersion(row) : null;
  }

  async listCurrentVersions(): Promise<DesignTemplateVersion[]> {
    const rows = this.database.prepare(`
      SELECT version.* FROM design_template_versions version
      JOIN design_template_definitions definition ON definition.current_version_id = version.id
      WHERE definition.status = 'published' AND version.template_id = definition.id
      ORDER BY version.template_id
    `).all() as VersionRow[];
    return rows.map(decodeVersion);
  }
}
