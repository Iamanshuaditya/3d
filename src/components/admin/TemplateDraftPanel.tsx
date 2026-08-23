"use client";

import { useEffect, useState } from "react";
import type { TemplateDraft } from "@/platform/templates/drafts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Template operation failed.");
  return payload;
}

export function TemplateDraftPanel({ canEdit, canPublish }: {
  canEdit: boolean;
  canPublish: boolean;
}) {
  const [drafts, setDrafts] = useState<TemplateDraft[]>([]);
  const [selected, setSelected] = useState<TemplateDraft | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [documentJson, setDocumentJson] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const result = await request<{ drafts: TemplateDraft[] }>("/api/v1/admin/template-drafts");
    setDrafts(result.drafts);
    if (selected) {
      const current = result.drafts.find((draft) => draft.id === selected.id) ?? null;
      setSelected(current);
      if (current) setDocumentJson(JSON.stringify(current.document, null, 2));
    }
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Drafts could not load."));
    // Selection refreshes explicitly after mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (draft: TemplateDraft) => {
    setSelected(draft);
    setDocumentJson(JSON.stringify(draft.document, null, 2));
    setMessage(null);
  };

  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const body: { templateId: string; document?: unknown } = { templateId };
      if (documentJson.trim()) body.document = JSON.parse(documentJson);
      const result = await request<{ draft: TemplateDraft }>("/api/v1/admin/template-drafts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSelected(result.draft);
      setDocumentJson(JSON.stringify(result.draft.document, null, 2));
      setMessage(`Draft ${result.draft.id} created at revision 1.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft creation failed.");
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (action: "save" | "validate" | "publish") => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const url = action === "save"
        ? `/api/v1/admin/template-drafts/${selected.id}`
        : `/api/v1/admin/template-drafts/${selected.id}/${action}`;
      const body = action === "save"
        ? { expectedRevision: selected.revision, document: JSON.parse(documentJson) }
        : { expectedRevision: selected.revision };
      const result = await request<{ draft: TemplateDraft; version?: { id: string } }>(url, {
        method: action === "save" ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setSelected(result.draft);
      setDocumentJson(JSON.stringify(result.draft.document, null, 2));
      setMessage(action === "publish"
        ? `Published immutable ${result.version?.id}.`
        : `${action === "save" ? "Saved" : "Validated"} revision ${result.draft.revision}.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Template ${action} failed.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-[var(--st-line)] bg-white p-5 sm:p-6" aria-label="Template drafts">
      <h2 className="text-[20px] font-semibold text-[var(--st-text)]">Template publishing</h2>
      <p className="mt-2 text-[13px] leading-5 text-[var(--st-dim)]">
        Clone a current template or provide a complete normal DesignDocument draft. Validation resolves exact product versions and private asset IDs before immutable publication.
      </p>
      {canEdit && (
        <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
          <label className="text-[11px] font-medium text-[var(--st-dim)]">
            Template ID
            <input value={templateId} onChange={(event) => setTemplateId(event.target.value)} placeholder="team-launch-shirt" className="mt-1 w-full rounded-md border border-[var(--st-line)] px-3 py-2 font-mono text-[12px]" />
          </label>
          <p className="text-[11px] leading-5 text-[var(--st-faint)]">
            Leave the document editor empty to clone the current version. For a new ID, paste the complete draft document first.
          </p>
          <button type="button" disabled={busy || !templateId.trim()} onClick={() => void create()} className="h-9 rounded-md border border-[var(--st-line)] px-3 text-[11px] font-semibold disabled:opacity-50">
            Create draft
          </button>
        </div>
      )}
      <div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          {drafts.map((draft) => (
            <button key={draft.id} type="button" onClick={() => choose(draft)} className="w-full rounded-lg border border-[var(--st-line)] px-3 py-2 text-left">
              <span className="block text-[12px] font-semibold text-[var(--st-text)]">{draft.templateId}</span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[var(--st-faint)]">{draft.status} · r{draft.revision}</span>
            </button>
          ))}
          {!drafts.length && <p className="text-[12px] text-[var(--st-faint)]">No operator drafts yet.</p>}
        </div>
        <div>
          <textarea
            aria-label="Template draft document JSON"
            value={documentJson}
            onChange={(event) => setDocumentJson(event.target.value)}
            readOnly={!canEdit || selected?.status === "published"}
            placeholder="Select a draft, or paste a complete document before creating a new template."
            className="min-h-72 w-full rounded-lg border border-[var(--st-line)] bg-[var(--st-raised)] p-3 font-mono text-[11px] leading-5"
          />
          {selected && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canEdit && selected.status !== "published" && (
                <>
                  <button type="button" disabled={busy} onClick={() => void mutate("save")} className="rounded-md border border-[var(--st-line)] px-3 py-2 text-[11px] font-semibold">Save revision</button>
                  <button type="button" disabled={busy} onClick={() => void mutate("validate")} className="rounded-md border border-[var(--st-line)] px-3 py-2 text-[11px] font-semibold">Validate</button>
                </>
              )}
              {canPublish && selected.status === "validated" && (
                <button type="button" disabled={busy} onClick={() => void mutate("publish")} className="rounded-md bg-[var(--st-text)] px-3 py-2 text-[11px] font-semibold text-white">Publish immutable version</button>
              )}
            </div>
          )}
          {selected?.validation && !selected.validation.passed && (
            <ul className="mt-3 space-y-1 text-[11px] text-[var(--st-danger)]">
              {selected.validation.issues.map((issue) => <li key={`${issue.code}:${issue.message}`}>{issue.code}: {issue.message}</li>)}
            </ul>
          )}
        </div>
      </div>
      {message && <p className="mt-3 text-[12px] text-[var(--st-dim)]">{message}</p>}
    </section>
  );
}
