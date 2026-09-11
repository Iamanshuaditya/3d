import type { OptionSelection } from "@/platform/products/types";
import type { VortexDatabase } from "@/server/persistence/database";
import type { EditorSessionMode, EditorSessionResult } from "@/lib/embed/editor-session-types";

export type EditorSession = {
  id: string;
  clientId: string;
  projectId: string;
  ownerId: string;
  productId: string;
  productVersionId: string;
  optionSelection: OptionSelection;
  hostOrigin: string;
  /** Full-page navigation destination on the registered host origin. */
  returnUrl?: string;
  referenceId: string | null;
  mode: EditorSessionMode;
  expiresAt: string;
  createdAt: string;
};

export class EditorSessionRepository {
  constructor(private readonly database: VortexDatabase) {}

  put(session: EditorSession, tokenSha256: string) {
    this.database.prepare(`
      INSERT INTO editor_sessions (id, client_id, project_id, token_sha256, session_json, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET token_sha256=excluded.token_sha256,
        session_json=excluded.session_json, expires_at=excluded.expires_at
    `).run(session.id, session.clientId, session.projectId, tokenSha256, JSON.stringify(session), session.expiresAt, session.createdAt);
  }

  find(id: string): { session: EditorSession; tokenSha256: string; result: EditorSessionResult | null } | null {
    const row = this.database.prepare("SELECT session_json, token_sha256, result_json FROM editor_sessions WHERE id=?").get(id) as
      { session_json: string; token_sha256: string; result_json: string | null } | undefined;
    return row ? {
      session: JSON.parse(row.session_json) as EditorSession,
      tokenSha256: row.token_sha256,
      result: row.result_json ? JSON.parse(row.result_json) as EditorSessionResult : null,
    } : null;
  }

  complete(id: string, result: EditorSessionResult) {
    this.database.prepare(`UPDATE editor_sessions SET result_json=?, completed_revision=?
      WHERE id=? AND (completed_revision IS NULL OR completed_revision<=?)`)
      .run(JSON.stringify(result), result.revision, id, result.revision);
  }
}
