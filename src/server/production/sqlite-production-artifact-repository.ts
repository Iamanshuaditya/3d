import type { PreflightReport } from "@/lib/print/types";
import type { ProjectOwner } from "@/platform/projects/types";
import type { ProductionArtifactRepository } from "@/platform/production/repository";
import type {
  CreateProductionArtifactInput,
  CreateProductionArtifactResult,
  ProductionArtifact,
  ProductionArtifactKind,
  ProductionArtifactMimeType,
} from "@/platform/production/types";
import type { VortexDatabase } from "@/server/persistence/database";

type ArtifactRow = {
  id: string;
  project_id: string;
  project_revision: number;
  product_version_id: string;
  configuration_id: string;
  kind: ProductionArtifactKind;
  mime_type: ProductionArtifactMimeType;
  filename: string;
  byte_size: number;
  sha256: string;
  storage_key: string;
  preflight_report_json: string;
  created_at: string;
};

function decodeArtifact(row: ArtifactRow): ProductionArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    projectRevision: row.project_revision,
    productVersionId: row.product_version_id,
    configurationId: row.configuration_id,
    kind: row.kind,
    mimeType: row.mime_type,
    filename: row.filename,
    byteSize: row.byte_size,
    sha256: row.sha256,
    storageKey: row.storage_key,
    preflightReport: JSON.parse(row.preflight_report_json) as PreflightReport,
    createdAt: row.created_at,
  };
}

const OWNER_JOIN = `
  JOIN design_projects project ON project.id = artifact.project_id
  WHERE project.owner_type = ? AND project.owner_id = ?
`;

export class SqliteProductionArtifactRepository implements ProductionArtifactRepository {
  constructor(private readonly database: VortexDatabase) {}

  async create(input: CreateProductionArtifactInput): Promise<CreateProductionArtifactResult> {
    return this.database.transaction(() => {
      const inserted = this.database.prepare(`
        INSERT INTO production_artifacts (
          id, project_id, project_revision, product_version_id, configuration_id,
          kind, mime_type, filename, byte_size, sha256, storage_key,
          preflight_report_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, project_revision, kind) DO NOTHING
      `).run(
        input.id,
        input.projectId,
        input.projectRevision,
        input.productVersionId,
        input.configurationId,
        input.kind,
        input.mimeType,
        input.filename,
        input.byteSize,
        input.sha256,
        input.storageKey,
        JSON.stringify(input.preflightReport),
        input.createdAt,
      );
      const row = this.database.prepare(`
        SELECT * FROM production_artifacts
        WHERE project_id = ? AND project_revision = ? AND kind = ?
      `).get(input.projectId, input.projectRevision, input.kind) as ArtifactRow;
      return { artifact: decodeArtifact(row), created: inserted.changes === 1 };
    })();
  }

  async findForRevision(
    projectId: string,
    projectRevision: number,
    kind: ProductionArtifactKind,
    owner: ProjectOwner,
  ): Promise<ProductionArtifact | null> {
    const row = this.database.prepare(`
      SELECT artifact.* FROM production_artifacts artifact
      ${OWNER_JOIN}
        AND artifact.project_id = ? AND artifact.project_revision = ? AND artifact.kind = ?
    `).get(owner.type, owner.id, projectId, projectRevision, kind) as ArtifactRow | undefined;
    return row ? decodeArtifact(row) : null;
  }

  async findById(id: string, owner: ProjectOwner): Promise<ProductionArtifact | null> {
    const row = this.database.prepare(`
      SELECT artifact.* FROM production_artifacts artifact
      ${OWNER_JOIN} AND artifact.id = ?
    `).get(owner.type, owner.id, id) as ArtifactRow | undefined;
    return row ? decodeArtifact(row) : null;
  }

  async list(projectId: string, owner: ProjectOwner): Promise<ProductionArtifact[]> {
    const rows = this.database.prepare(`
      SELECT artifact.* FROM production_artifacts artifact
      ${OWNER_JOIN} AND artifact.project_id = ?
      ORDER BY artifact.created_at DESC, artifact.id DESC
    `).all(owner.type, owner.id, projectId) as ArtifactRow[];
    return rows.map(decodeArtifact);
  }
}
