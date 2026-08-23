import type {
  TemplateDraft,
  TemplateDraftEvent,
  TemplateDraftRepository,
} from "@/platform/templates/drafts";
import type { VortexDatabase } from "@/server/persistence/database";

type DraftRow = {
  id: string;
  template_id: string;
  base_version_id: string | null;
  status: TemplateDraft["status"];
  revision: number;
  document_json: string;
  validation_json: string | null;
  published_version_id: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  template_id: string;
  draft_id: string;
  action: TemplateDraftEvent["action"];
  actor_id: string;
  draft_revision: number;
  template_version_id: string | null;
  created_at: string;
};

function decode(row: DraftRow): TemplateDraft {
  return {
    id: row.id,
    templateId: row.template_id,
    baseVersionId: row.base_version_id,
    status: row.status,
    revision: row.revision,
    document: JSON.parse(row.document_json) as TemplateDraft["document"],
    validation: row.validation_json
      ? JSON.parse(row.validation_json) as TemplateDraft["validation"]
      : null,
    publishedVersionId: row.published_version_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function decodeEvent(row: EventRow): TemplateDraftEvent {
  return {
    id: row.id,
    templateId: row.template_id,
    draftId: row.draft_id,
    action: row.action,
    actorId: row.actor_id,
    draftRevision: row.draft_revision,
    templateVersionId: row.template_version_id,
    createdAt: row.created_at,
  };
}

function insertEvent(database: VortexDatabase, event: TemplateDraftEvent) {
  database.prepare(`
    INSERT INTO template_draft_events (
      id, template_id, draft_id, action, actor_id, draft_revision,
      template_version_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id, event.templateId, event.draftId, event.action, event.actorId,
    event.draftRevision, event.templateVersionId, event.createdAt,
  );
}

export class SqliteTemplateDraftRepository implements TemplateDraftRepository {
  constructor(private readonly database: VortexDatabase) {}

  async create(draft: TemplateDraft, event: TemplateDraftEvent) {
    return this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO template_drafts (
          id, template_id, base_version_id, status, revision, document_json,
          validation_json, published_version_id, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'draft', 1, ?, NULL, NULL, ?, ?, ?, ?)
      `).run(
        draft.id, draft.templateId, draft.baseVersionId, JSON.stringify(draft.document),
        draft.createdBy, draft.updatedBy, draft.createdAt, draft.updatedAt,
      );
      insertEvent(this.database, event);
      return draft;
    })();
  }

  async find(id: string) {
    const row = this.database.prepare("SELECT * FROM template_drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    return row ? decode(row) : null;
  }

  async list() {
    return (this.database.prepare(`
      SELECT * FROM template_drafts ORDER BY updated_at DESC, id DESC
    `).all() as DraftRow[]).map(decode);
  }

  async update(input: {
    id: string;
    expectedRevision: number;
    document: TemplateDraft["document"];
    actorId: string;
    now: string;
    eventId: string;
  }) {
    return this.database.transaction(() => {
      const changed = this.database.prepare(`
        UPDATE template_drafts
        SET document_json = ?, status = 'draft', revision = revision + 1,
            validation_json = NULL, updated_by = ?, updated_at = ?
        WHERE id = ? AND revision = ? AND status != 'published'
      `).run(JSON.stringify(input.document), input.actorId, input.now, input.id, input.expectedRevision);
      if (changed.changes !== 1) return null;
      const draft = this.database.prepare("SELECT * FROM template_drafts WHERE id = ?")
        .get(input.id) as DraftRow;
      insertEvent(this.database, {
        id: input.eventId,
        templateId: draft.template_id,
        draftId: draft.id,
        action: "draft_updated",
        actorId: input.actorId,
        draftRevision: draft.revision,
        templateVersionId: null,
        createdAt: input.now,
      });
      return decode(draft);
    })();
  }

  async setValidation(input: {
    id: string;
    expectedRevision: number;
    validation: NonNullable<TemplateDraft["validation"]>;
    actorId: string;
    eventId: string;
  }) {
    return this.database.transaction(() => {
      const status = input.validation.passed ? "validated" : "draft";
      const changed = this.database.prepare(`
        UPDATE template_drafts
        SET status = ?, validation_json = ?, updated_by = ?, updated_at = ?
        WHERE id = ? AND revision = ? AND status != 'published'
      `).run(
        status, JSON.stringify(input.validation), input.actorId,
        input.validation.validatedAt, input.id, input.expectedRevision,
      );
      if (changed.changes !== 1) return null;
      const draft = this.database.prepare("SELECT * FROM template_drafts WHERE id = ?")
        .get(input.id) as DraftRow;
      insertEvent(this.database, {
        id: input.eventId,
        templateId: draft.template_id,
        draftId: draft.id,
        action: input.validation.passed ? "draft_validated" : "draft_validation_failed",
        actorId: input.actorId,
        draftRevision: draft.revision,
        templateVersionId: null,
        createdAt: input.validation.validatedAt,
      });
      return decode(draft);
    })();
  }

  async markPublished(input: {
    id: string;
    expectedRevision: number;
    version: { id: string };
    actorId: string;
    now: string;
    eventId: string;
  }) {
    return this.database.transaction(() => {
      const changed = this.database.prepare(`
        UPDATE template_drafts
        SET status = 'published', published_version_id = ?, updated_by = ?, updated_at = ?
        WHERE id = ? AND revision = ? AND status = 'validated'
      `).run(input.version.id, input.actorId, input.now, input.id, input.expectedRevision);
      if (changed.changes !== 1) return null;
      const draft = this.database.prepare("SELECT * FROM template_drafts WHERE id = ?")
        .get(input.id) as DraftRow;
      insertEvent(this.database, {
        id: input.eventId,
        templateId: draft.template_id,
        draftId: draft.id,
        action: "version_published",
        actorId: input.actorId,
        draftRevision: draft.revision,
        templateVersionId: input.version.id,
        createdAt: input.now,
      });
      return decode(draft);
    })();
  }

  async audit(id: string) {
    return (this.database.prepare(`
      SELECT * FROM template_draft_events WHERE draft_id = ? ORDER BY created_at, id
    `).all(id) as EventRow[]).map(decodeEvent);
  }
}
