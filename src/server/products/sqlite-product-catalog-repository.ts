import { ProductDomainError } from "@/platform/products/errors";
import { validateProductVersion } from "@/platform/products/configuration-resolver";
import type {
  ProductAuditEvent,
  ProductDraft,
  ProductDraftDocument,
  ProductDraftValidationReport,
} from "@/platform/products/drafts";
import type {
  ProductDraftRepository,
  PublishProductDraftInput,
} from "@/platform/products/draft-repository";
import type { ProductCatalogRepository } from "@/platform/products/repository";
import type { ProductDefinition, ProductVersion } from "@/platform/products/types";
import { canonicalJson } from "@/server/persistence/canonical-json";
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

type DraftRow = {
  id: string;
  product_id: string;
  base_version_id: string | null;
  status: ProductDraft["status"];
  revision: number;
  document_json: string;
  validation_json: string | null;
  published_version_id: string | null;
  onboarding_job_id: string | null;
  onboarding_report_sha256: string | null;
  onboarding_tool_version: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  product_id: string;
  draft_id: string;
  action: ProductAuditEvent["action"];
  actor_id: string;
  draft_revision: number;
  product_version_id: string | null;
  created_at: string;
};

function decodeDefinition(row: DefinitionRow): ProductDefinition {
  const definition = JSON.parse(row.definition_json) as ProductDefinition & {
    visibility?: ProductDefinition["visibility"];
  };
  return {
    ...definition,
    id: row.id,
    status: row.status,
    // Pre-P6 rows did not persist discovery policy. Fail closed until code
    // catalogue synchronization or an operator explicitly marks them public.
    visibility: definition.visibility ?? "unlisted",
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

function decodeDraft(row: DraftRow): ProductDraft {
  return {
    id: row.id,
    productId: row.product_id,
    baseVersionId: row.base_version_id,
    status: row.status,
    revision: row.revision,
    document: JSON.parse(row.document_json) as ProductDraftDocument,
    validation: row.validation_json
      ? JSON.parse(row.validation_json) as ProductDraftValidationReport
      : null,
    publishedVersionId: row.published_version_id,
    onboardingProvenance: row.onboarding_job_id &&
        row.onboarding_report_sha256 &&
        row.onboarding_tool_version
      ? {
          jobId: row.onboarding_job_id,
          reportChecksum: row.onboarding_report_sha256,
          toolVersion: row.onboarding_tool_version,
        }
      : null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function decodeAudit(row: AuditRow): ProductAuditEvent {
  return {
    id: row.id,
    productId: row.product_id,
    draftId: row.draft_id,
    action: row.action,
    actorId: row.actor_id,
    draftRevision: row.draft_revision,
    productVersionId: row.product_version_id,
    createdAt: row.created_at,
  };
}

function snapshotFromDefinition(definition: ProductDefinition) {
  return {
    name: definition.name,
    ...(definition.description ? { description: definition.description } : {}),
    options: definition.options,
    presentation: definition.presentation,
    capabilities: definition.capabilities,
    templateCompatibility: definition.templateCompatibility,
  };
}

export class SqliteProductCatalogRepository implements
  ProductCatalogRepository,
  ProductDraftRepository {
  constructor(private readonly database: VortexDatabase) {}

  private requireDraftRow(draftId: string): DraftRow {
    const row = this.database.prepare(
      "SELECT * FROM product_drafts WHERE id = ?",
    ).get(draftId) as DraftRow | undefined;
    if (!row) {
      throw new ProductDomainError("PRODUCT_DRAFT_NOT_FOUND", "Product draft was not found.");
    }
    return row;
  }

  private assertDraftRevision(row: DraftRow, expectedRevision: number) {
    if (row.revision !== expectedRevision) {
      throw new ProductDomainError(
        "PRODUCT_DRAFT_REVISION_CONFLICT",
        "This product draft changed. Reload it before saving or publishing.",
        { currentRevision: row.revision },
      );
    }
    if (row.status === "published") {
      throw new ProductDomainError(
        "PRODUCT_DRAFT_ALREADY_PUBLISHED",
        "A published product draft is immutable.",
        { productVersionId: row.published_version_id },
      );
    }
  }

  private insertAudit(event: ProductAuditEvent) {
    this.database.prepare(`
      INSERT INTO product_audit_events (
        id, product_id, draft_id, action, actor_id, draft_revision,
        product_version_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.productId,
      event.draftId,
      event.action,
      event.actorId,
      event.draftRevision,
      event.productVersionId,
      event.createdAt,
    );
  }

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

  private storePublishedVersion(
    definition: ProductDefinition,
    version: ProductVersion,
    sha256: string,
    now: string,
  ): ProductVersion {
    validateProductVersion(version);
    if (
      definition.status !== "published" ||
      definition.id !== version.productId ||
      definition.currentVersionId !== version.id ||
      canonicalJson(snapshotFromDefinition(definition)) !== canonicalJson(version.definition)
    ) {
      throw new ProductDomainError(
        "PRODUCT_VERSION_MISMATCH",
        "A published product definition must exactly match and point at its version snapshot.",
      );
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new ProductDomainError("INVALID_VERSION_CHECKSUM", "Product version checksum is invalid.");
    }

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
  }

  async publish(
    definition: ProductDefinition,
    version: ProductVersion,
    sha256: string,
    now: string,
  ): Promise<ProductVersion> {
    return this.database.transaction(() =>
      this.storePublishedVersion(definition, version, sha256, now)
    )();
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

  async listVersions(productId: string): Promise<ProductVersion[]> {
    const rows = this.database.prepare(`
      SELECT * FROM product_versions
      WHERE product_id = ?
      ORDER BY version_number DESC, id DESC
    `).all(productId) as VersionRow[];
    return rows.map(decodeVersion);
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

  async create(
    draft: ProductDraft,
    auditEvent: ProductAuditEvent,
  ): Promise<ProductDraft> {
    if (
      draft.id !== auditEvent.draftId ||
      draft.productId !== auditEvent.productId ||
      draft.revision !== auditEvent.draftRevision ||
      draft.createdBy !== auditEvent.actorId ||
      auditEvent.action !== "draft_created"
    ) {
      throw new ProductDomainError(
        "PRODUCT_DRAFT_AUDIT_MISMATCH",
        "Draft creation audit metadata does not match the draft.",
      );
    }
    return this.database.transaction(() => {
      if (this.database.prepare("SELECT 1 FROM product_drafts WHERE id = ?").get(draft.id)) {
        throw new ProductDomainError("PRODUCT_DRAFT_EXISTS", "Product draft already exists.");
      }
      this.database.prepare(`
        INSERT INTO product_drafts (
          id, product_id, base_version_id, status, revision, document_json,
          validation_json, published_version_id, created_by, updated_by,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        draft.id,
        draft.productId,
        draft.baseVersionId,
        draft.status,
        draft.revision,
        JSON.stringify(draft.document),
        draft.validation ? JSON.stringify(draft.validation) : null,
        draft.publishedVersionId,
        draft.createdBy,
        draft.updatedBy,
        draft.createdAt,
        draft.updatedAt,
      );
      this.insertAudit(auditEvent);
      return decodeDraft(this.requireDraftRow(draft.id));
    })();
  }

  async find(draftId: string): Promise<ProductDraft | null> {
    const row = this.database.prepare(
      "SELECT * FROM product_drafts WHERE id = ?",
    ).get(draftId) as DraftRow | undefined;
    return row ? decodeDraft(row) : null;
  }

  async list(): Promise<ProductDraft[]> {
    const rows = this.database.prepare(`
      SELECT * FROM product_drafts ORDER BY updated_at DESC, id DESC
    `).all() as DraftRow[];
    return rows.map(decodeDraft);
  }

  async updateDocument(
    draftId: string,
    expectedRevision: number,
    document: ProductDraftDocument,
    actorId: string,
    auditEventId: string,
    now: string,
  ): Promise<ProductDraft> {
    return this.database.transaction(() => {
      const row = this.requireDraftRow(draftId);
      this.assertDraftRevision(row, expectedRevision);
      if (document.productId !== row.product_id) {
        throw new ProductDomainError(
          "PRODUCT_DRAFT_PRODUCT_MISMATCH",
          "A product draft cannot be moved to another product.",
        );
      }
      const revision = row.revision + 1;
      this.database.prepare(`
        UPDATE product_drafts
        SET status = 'draft', revision = ?, document_json = ?,
            validation_json = NULL, onboarding_job_id = NULL,
            onboarding_report_sha256 = NULL, onboarding_tool_version = NULL,
            updated_by = ?, updated_at = ?
        WHERE id = ? AND revision = ? AND status != 'published'
      `).run(revision, JSON.stringify(document), actorId, now, draftId, expectedRevision);
      this.insertAudit({
        id: auditEventId,
        productId: row.product_id,
        draftId,
        action: "draft_updated",
        actorId,
        draftRevision: revision,
        productVersionId: null,
        createdAt: now,
      });
      return decodeDraft(this.requireDraftRow(draftId));
    })();
  }

  async recordValidation(
    draftId: string,
    expectedRevision: number,
    report: ProductDraftValidationReport,
    actorId: string,
    auditEventId: string,
    now: string,
  ): Promise<ProductDraft> {
    return this.database.transaction(() => {
      const row = this.requireDraftRow(draftId);
      this.assertDraftRevision(row, expectedRevision);
      if (report.draftId !== draftId || report.draftRevision !== expectedRevision) {
        throw new ProductDomainError(
          "PRODUCT_DRAFT_VALIDATION_MISMATCH",
          "Validation does not describe the current product draft revision.",
        );
      }
      this.database.prepare(`
        UPDATE product_drafts
        SET status = ?, validation_json = ?, updated_by = ?, updated_at = ?
        WHERE id = ? AND revision = ? AND status != 'published'
      `).run(
        report.passed ? "validated" : "draft",
        JSON.stringify(report),
        actorId,
        now,
        draftId,
        expectedRevision,
      );
      this.insertAudit({
        id: auditEventId,
        productId: row.product_id,
        draftId,
        action: report.passed ? "draft_validated" : "draft_validation_failed",
        actorId,
        draftRevision: expectedRevision,
        productVersionId: null,
        createdAt: now,
      });
      return decodeDraft(this.requireDraftRow(draftId));
    })();
  }

  async attachOnboarding(
    draftId: string,
    expectedRevision: number,
    provenance: NonNullable<ProductDraft["onboardingProvenance"]>,
    actorId: string,
    auditEventId: string,
    now: string,
  ): Promise<ProductDraft> {
    return this.database.transaction(() => {
      const row = this.requireDraftRow(draftId);
      this.assertDraftRevision(row, expectedRevision);
      const revision = row.revision + 1;
      const updated = this.database.prepare(`
        UPDATE product_drafts
        SET status = 'draft', revision = ?, validation_json = NULL,
            onboarding_job_id = ?, onboarding_report_sha256 = ?,
            onboarding_tool_version = ?, updated_by = ?, updated_at = ?
        WHERE id = ? AND revision = ? AND status != 'published'
      `).run(
        revision,
        provenance.jobId,
        provenance.reportChecksum,
        provenance.toolVersion,
        actorId,
        now,
        draftId,
        expectedRevision,
      );
      if (updated.changes !== 1) {
        throw new ProductDomainError(
          "PRODUCT_DRAFT_ALREADY_PUBLISHED",
          "A published product draft is immutable.",
        );
      }
      this.insertAudit({
        id: auditEventId,
        productId: row.product_id,
        draftId,
        action: "onboarding_attached",
        actorId,
        draftRevision: revision,
        productVersionId: null,
        createdAt: now,
      });
      return decodeDraft(this.requireDraftRow(draftId));
    })();
  }

  async publishDraft(input: PublishProductDraftInput): Promise<ProductDraft> {
    return this.database.transaction(() => {
      const row = this.requireDraftRow(input.draftId);
      this.assertDraftRevision(row, input.expectedRevision);
      const report = row.validation_json
        ? JSON.parse(row.validation_json) as ProductDraftValidationReport
        : null;
      if (
        row.status !== "validated" ||
        !report?.passed ||
        report.draftRevision !== row.revision ||
        !report.configurationId?.startsWith(`${input.version.id}|`)
      ) {
        throw new ProductDomainError(
          "PRODUCT_DRAFT_NOT_VALIDATED",
          "The current product draft revision must pass validation before publishing.",
        );
      }

      const current = this.database.prepare(`
        SELECT current_version_id FROM product_definitions WHERE id = ?
      `).get(row.product_id) as { current_version_id: string | null } | undefined;
      const currentVersionId = current?.current_version_id ?? null;
      if (currentVersionId !== row.base_version_id) {
        throw new ProductDomainError(
          "PRODUCT_DRAFT_BASE_STALE",
          "The published product changed after this draft was created.",
          { baseVersionId: row.base_version_id, currentVersionId },
        );
      }

      const document = JSON.parse(row.document_json) as ProductDraftDocument;
      if (
        input.version.productId !== row.product_id ||
        input.definition.id !== row.product_id ||
        input.definition.currentVersionId !== input.version.id ||
        input.definition.visibility !== document.visibility ||
        canonicalJson(input.version.definition) !== canonicalJson(document.definition) ||
        canonicalJson(snapshotFromDefinition(input.definition)) !== canonicalJson(document.definition) ||
        canonicalJson(input.version.resolution) !== canonicalJson(document.resolution)
      ) {
        throw new ProductDomainError(
          "PRODUCT_DRAFT_PUBLISH_MISMATCH",
          "The publish request does not match the validated draft document.",
        );
      }

      this.storePublishedVersion(
        input.definition,
        input.version,
        input.versionSha256,
        input.now,
      );
      if (
        row.onboarding_job_id &&
        row.onboarding_report_sha256 &&
        row.onboarding_tool_version
      ) {
        this.database.prepare(`
          INSERT INTO product_version_onboarding_provenance (
            product_version_id, onboarding_job_id, report_sha256,
            tool_version, recorded_at
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          input.version.id,
          row.onboarding_job_id,
          row.onboarding_report_sha256,
          row.onboarding_tool_version,
          input.now,
        );
      }
      this.database.prepare(`
        UPDATE product_drafts
        SET status = 'published', published_version_id = ?,
            updated_by = ?, updated_at = ?
        WHERE id = ? AND revision = ? AND status = 'validated'
      `).run(
        input.version.id,
        input.actorId,
        input.now,
        input.draftId,
        input.expectedRevision,
      );
      this.insertAudit({
        id: input.auditEventId,
        productId: row.product_id,
        draftId: row.id,
        action: "version_published",
        actorId: input.actorId,
        draftRevision: row.revision,
        productVersionId: input.version.id,
        createdAt: input.now,
      });
      return decodeDraft(this.requireDraftRow(input.draftId));
    })();
  }

  async listAudit(draftId: string): Promise<ProductAuditEvent[]> {
    this.requireDraftRow(draftId);
    const rows = this.database.prepare(`
      SELECT * FROM product_audit_events
      WHERE draft_id = ?
      ORDER BY rowid
    `).all(draftId) as AuditRow[];
    return rows.map(decodeAudit);
  }
}
