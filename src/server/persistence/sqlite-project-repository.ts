import type { DesignDocument } from "@/types/configurator";
import type { ProjectRepository } from "@/platform/projects/repository";
import type {
  CreateProjectAssetInput,
  CreateProjectInput,
  DesignProject,
  ProjectAsset,
  ProjectOwner,
  ProjectRevision,
  ProjectStatus,
  UpdateProjectInput,
  UpdateProjectResult,
} from "@/platform/projects/types";
import type { VortexDatabase } from "./database";
import { parseOptionSelection } from "@/platform/products/configuration-resolver";

type ProjectRow = {
  id: string;
  title: string;
  product_id: string;
  product_version_id: string;
  configuration_id: string | null;
  option_selection_json: string;
  source_template_version_id: string | null;
  owner_type: ProjectOwner["type"];
  owner_id: string;
  status: ProjectStatus;
  design_json: string;
  revision: number;
  preview_asset_id: string | null;
  created_at: string;
  updated_at: string;
};

type AssetRow = {
  id: string;
  project_id: string;
  kind: ProjectAsset["kind"];
  filename: string;
  mime_type: ProjectAsset["mimeType"];
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  storage_key: string;
  created_at: string;
};

function decodeProject(row: ProjectRow): DesignProject {
  return {
    id: row.id,
    title: row.title,
    productId: row.product_id,
    productVersionId: row.product_version_id,
    configurationId: row.configuration_id ?? `${row.product_version_id}|`,
    optionSelection: parseOptionSelection(JSON.parse(row.option_selection_json)),
    sourceTemplateVersionId: row.source_template_version_id,
    owner: { type: row.owner_type, id: row.owner_id } as ProjectOwner,
    status: row.status,
    design: JSON.parse(row.design_json) as DesignDocument,
    revision: row.revision,
    previewAssetId: row.preview_asset_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function decodeAsset(row: AssetRow): ProjectAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    storageKey: row.storage_key,
    createdAt: row.created_at,
  };
}

const OWNER_SQL = "owner_type = ? AND owner_id = ?";

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly database: VortexDatabase) {}

  async create(input: CreateProjectInput): Promise<DesignProject> {
    const designJson = JSON.stringify(input.design);
    const row = this.database.transaction(() => {
      const inserted = this.database.prepare(`
        INSERT INTO design_projects (
          id, title, product_id, product_version_id, configuration_id,
          option_selection_json, source_template_version_id, owner_type, owner_id,
          status, design_json, revision, preview_asset_id, creation_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 1, NULL, ?, ?, ?)
        ON CONFLICT(owner_type, owner_id, creation_key) DO NOTHING
      `).run(
        input.id,
        input.title,
        input.productId,
        input.productVersionId,
        input.configurationId,
        JSON.stringify(input.optionSelection),
        input.sourceTemplateVersionId ?? null,
        input.owner.type,
        input.owner.id,
        designJson,
        input.creationKey ?? null,
        input.now,
        input.now,
      );
      if (inserted.changes === 0 && input.creationKey) {
        const existing = this.database.prepare(`
          SELECT * FROM design_projects
          WHERE owner_type = ? AND owner_id = ? AND creation_key = ?
        `).get(input.owner.type, input.owner.id, input.creationKey) as ProjectRow | undefined;
        if (existing) return existing;
      }
      if (inserted.changes !== 1) {
        throw new Error("Project could not be created idempotently.");
      }
      this.database.prepare(`
        INSERT INTO project_revisions(project_id, revision, design_json, created_at)
        VALUES (?, 1, ?, ?)
      `).run(input.id, designJson, input.now);
      return this.database.prepare(`
        SELECT * FROM design_projects WHERE id = ? AND ${OWNER_SQL}
      `).get(input.id, input.owner.type, input.owner.id) as ProjectRow;
    })();
    return decodeProject(row);
  }

  async findById(id: string, owner: ProjectOwner): Promise<DesignProject | null> {
    const row = this.database.prepare(`
      SELECT * FROM design_projects WHERE id = ? AND ${OWNER_SQL}
    `).get(id, owner.type, owner.id) as ProjectRow | undefined;
    return row ? decodeProject(row) : null;
  }

  async list(owner: ProjectOwner): Promise<DesignProject[]> {
    const rows = this.database.prepare(`
      SELECT * FROM design_projects
      WHERE ${OWNER_SQL} AND status != 'archived'
      ORDER BY updated_at DESC, id DESC
    `).all(owner.type, owner.id) as ProjectRow[];
    return rows.map(decodeProject);
  }

  async update(input: UpdateProjectInput): Promise<UpdateProjectResult> {
    const result = this.database.transaction((): UpdateProjectResult => {
      const existing = this.database.prepare(`
        SELECT revision, status FROM design_projects WHERE id = ? AND ${OWNER_SQL}
      `).get(input.id, input.owner.type, input.owner.id) as {
        revision: number;
        status: ProjectStatus;
      } | undefined;
      if (!existing) return { kind: "not-found" };
      if (existing.revision !== input.expectedRevision) {
        return { kind: "conflict", currentRevision: existing.revision };
      }

      const nextRevision = existing.revision + 1;
      const designJson = JSON.stringify(input.design);
      const nextStatus = input.status ?? (
        existing.status === "ready_for_preflight" || existing.status === "production_ready"
          ? "draft"
          : null
      );
      const changed = this.database.prepare(`
        UPDATE design_projects
        SET design_json = ?, revision = ?, updated_at = ?,
            title = COALESCE(?, title), status = COALESCE(?, status)
        WHERE id = ? AND ${OWNER_SQL} AND revision = ?
      `).run(
        designJson,
        nextRevision,
        input.now,
        input.title ?? null,
        nextStatus,
        input.id,
        input.owner.type,
        input.owner.id,
        input.expectedRevision,
      );
      if (changed.changes !== 1) {
        const current = this.database.prepare(`
          SELECT revision FROM design_projects WHERE id = ? AND ${OWNER_SQL}
        `).get(input.id, input.owner.type, input.owner.id) as { revision: number } | undefined;
        return current
          ? { kind: "conflict", currentRevision: current.revision }
          : { kind: "not-found" };
      }
      this.database.prepare(`
        INSERT INTO project_revisions(project_id, revision, design_json, created_at)
        VALUES (?, ?, ?, ?)
      `).run(input.id, nextRevision, designJson, input.now);
      const row = this.database.prepare(`
        SELECT * FROM design_projects WHERE id = ? AND ${OWNER_SQL}
      `).get(input.id, input.owner.type, input.owner.id) as ProjectRow;
      return { kind: "updated", project: decodeProject(row) };
    })();
    return result;
  }

  async archive(id: string, owner: ProjectOwner, now: string): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE design_projects SET status = 'archived', updated_at = ?
      WHERE id = ? AND ${OWNER_SQL} AND status != 'archived'
    `).run(now, id, owner.type, owner.id);
    return result.changes === 1;
  }

  async setPreviewAsset(
    id: string,
    owner: ProjectOwner,
    assetId: string | null,
  ): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE design_projects SET preview_asset_id = ?
      WHERE id = ? AND ${OWNER_SQL}
    `).run(assetId, id, owner.type, owner.id);
    return result.changes === 1;
  }

  async setStatusForRevision(
    id: string,
    owner: ProjectOwner,
    expectedRevision: number,
    status: ProjectStatus,
  ): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE design_projects SET status = ?
      WHERE id = ? AND ${OWNER_SQL} AND revision = ? AND status != 'archived'
    `).run(status, id, owner.type, owner.id, expectedRevision);
    return result.changes === 1;
  }

  async createAsset(input: CreateProjectAssetInput): Promise<ProjectAsset> {
    this.database.prepare(`
      INSERT INTO project_assets (
        id, project_id, kind, filename, mime_type, byte_size, width, height,
        sha256, storage_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.projectId,
      input.kind,
      input.filename,
      input.mimeType,
      input.byteSize,
      input.width,
      input.height,
      input.sha256,
      input.storageKey,
      input.createdAt,
    );
    return input;
  }

  async findAsset(
    id: string,
    projectId: string,
    owner: ProjectOwner,
  ): Promise<ProjectAsset | null> {
    const row = this.database.prepare(`
      SELECT asset.* FROM project_assets asset
      JOIN design_projects project ON project.id = asset.project_id
      WHERE asset.id = ? AND asset.project_id = ?
        AND project.owner_type = ? AND project.owner_id = ?
    `).get(id, projectId, owner.type, owner.id) as AssetRow | undefined;
    return row ? decodeAsset(row) : null;
  }

  async listAssets(projectId: string, owner: ProjectOwner): Promise<ProjectAsset[]> {
    const rows = this.database.prepare(`
      SELECT asset.* FROM project_assets asset
      JOIN design_projects project ON project.id = asset.project_id
      WHERE asset.project_id = ? AND project.owner_type = ? AND project.owner_id = ?
      ORDER BY asset.created_at, asset.id
    `).all(projectId, owner.type, owner.id) as AssetRow[];
    return rows.map(decodeAsset);
  }

  async deleteAsset(
    id: string,
    projectId: string,
    owner: ProjectOwner,
  ): Promise<ProjectAsset | null> {
    return this.database.transaction(() => {
      const row = this.database.prepare(`
        SELECT asset.* FROM project_assets asset
        JOIN design_projects project ON project.id = asset.project_id
        WHERE asset.id = ? AND asset.project_id = ?
          AND project.owner_type = ? AND project.owner_id = ?
      `).get(id, projectId, owner.type, owner.id) as AssetRow | undefined;
      if (!row) return null;
      this.database.prepare(`
        UPDATE design_projects SET preview_asset_id = NULL
        WHERE id = ? AND preview_asset_id = ?
      `).run(projectId, id);
      this.database.prepare("DELETE FROM project_assets WHERE id = ? AND project_id = ?")
        .run(id, projectId);
      return decodeAsset(row);
    })();
  }

  async findRevision(
    projectId: string,
    revision: number,
    owner: ProjectOwner,
  ): Promise<ProjectRevision | null> {
    const row = this.database.prepare(`
      SELECT revision.project_id, revision.revision, revision.design_json, revision.created_at
      FROM project_revisions revision
      JOIN design_projects project ON project.id = revision.project_id
      WHERE revision.project_id = ? AND revision.revision = ?
        AND project.owner_type = ? AND project.owner_id = ?
    `).get(projectId, revision, owner.type, owner.id) as {
      project_id: string;
      revision: number;
      design_json: string;
      created_at: string;
    } | undefined;
    return row
      ? {
          projectId: row.project_id,
          revision: row.revision,
          design: JSON.parse(row.design_json) as DesignDocument,
          createdAt: row.created_at,
        }
      : null;
  }

  async claimAll(from: ProjectOwner, to: ProjectOwner, now: string): Promise<number> {
    if (from.type === to.type && from.id === to.id) return 0;
    const result = this.database.prepare(`
      UPDATE design_projects
      SET owner_type = ?, owner_id = ?, updated_at = ?
      WHERE owner_type = ? AND owner_id = ?
    `).run(to.type, to.id, now, from.type, from.id);
    return result.changes;
  }
}
