"use client";

import { useState } from "react";

type DraftDto = {
  id: string;
  productId: string;
  baseVersionId: string | null;
  status: "draft" | "validated" | "published";
  revision: number;
  visibility: "public" | "unlisted";
  metadata: {
    name: string;
    description: string | null;
    presentationMode: string;
    optionCount: number;
    resolutionKind: string;
  };
  validation: {
    passed: boolean;
    issues: Array<{ code: string; severity: "error" | "warning"; message: string }>;
  } | null;
  publishedVersionId: string | null;
};

type ApiError = { error?: { message?: string } };

async function mutation<T>(url: string, method: "POST" | "PATCH", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as (T & ApiError) | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Operator action failed.");
  return payload as T;
}

export function ProductDraftPanel({
  productId,
  canEdit,
  canValidate,
  canPublish,
}: {
  productId: string;
  canEdit: boolean;
  canValidate: boolean;
  canPublish: boolean;
}) {
  const [draft, setDraft] = useState<DraftDto | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const apply = (next: DraftDto) => {
    setDraft(next);
    setName(next.metadata.name);
    setDescription(next.metadata.description ?? "");
    setVisibility(next.visibility);
  };

  const run = async (action: () => Promise<DraftDto>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      apply(await action());
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operator action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!draft) {
    return canEdit ? (
      <div className="mt-5 border-t border-[var(--st-line)] pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(async () => (
            await mutation<{ draft: DraftDto }>(
              `/api/v1/admin/products/${encodeURIComponent(productId)}/drafts`,
              "POST",
            )
          ).draft, "Draft created.")}
          className="rounded-lg border border-[var(--st-line)] px-3 py-2 text-[12px] font-semibold text-[var(--st-text)] hover:bg-[var(--st-raised)] disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create draft from current"}
        </button>
        {message && <p className="mt-2 text-[12px] text-[var(--st-dim)]">{message}</p>}
      </div>
    ) : null;
  }

  const endpoint = `/api/v1/admin/product-drafts/${encodeURIComponent(draft.id)}`;
  return (
    <section className="mt-5 rounded-lg border border-[var(--st-line)] bg-[var(--st-raised)]/40 p-4" aria-label="Product draft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-[var(--st-text)]">Draft revision {draft.revision}</p>
          <p className="mt-0.5 font-mono text-[10px] text-[var(--st-faint)]">{draft.id}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--st-dim)]">
          {draft.status}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-medium text-[var(--st-dim)]">
          Product name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canEdit || draft.status === "published"}
            maxLength={200}
            className="mt-1 h-10 w-full rounded-md border border-[var(--st-line)] bg-white px-3 text-[13px] text-[var(--st-text)]"
          />
        </label>
        <label className="text-[11px] font-medium text-[var(--st-dim)]">
          Visibility
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as "public" | "unlisted")}
            disabled={!canEdit || draft.status === "published"}
            className="mt-1 h-10 w-full rounded-md border border-[var(--st-line)] bg-white px-3 text-[13px] text-[var(--st-text)]"
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
          </select>
        </label>
        <label className="text-[11px] font-medium text-[var(--st-dim)] sm:col-span-2">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={!canEdit || draft.status === "published"}
            maxLength={4_000}
            rows={3}
            className="mt-1 w-full rounded-md border border-[var(--st-line)] bg-white px-3 py-2 text-[13px] text-[var(--st-text)]"
          />
        </label>
      </div>

      {draft.validation && (
        <div className={`mt-3 rounded-md px-3 py-2 text-[11px] ${draft.validation.passed ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {draft.validation.passed
            ? "Validation passed for this exact revision."
            : draft.validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join(" · ")}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canEdit && draft.status !== "published" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(async () => (
              await mutation<{ draft: DraftDto }>(endpoint, "PATCH", {
                expectedRevision: draft.revision,
                name,
                description: description || null,
                visibility,
              })
            ).draft, "Draft saved; revalidation is required.")}
            className="rounded-lg border border-[var(--st-line)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--st-text)] disabled:opacity-50"
          >Save metadata</button>
        )}
        {canValidate && draft.status !== "published" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(async () => (
              await mutation<{ draft: DraftDto }>(`${endpoint}/validate`, "POST", {
                expectedRevision: draft.revision,
              })
            ).draft, "Validation completed.")}
            className="rounded-lg border border-[var(--st-line)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--st-text)] disabled:opacity-50"
          >Validate</button>
        )}
        {canPublish && draft.status === "validated" && draft.validation?.passed && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(async () => (
              await mutation<{ draft: DraftDto }>(`${endpoint}/publish`, "POST", {
                expectedRevision: draft.revision,
              })
            ).draft, "Immutable product version published.")}
            className="rounded-lg bg-[var(--st-text)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
          >Publish version</button>
        )}
      </div>
      {message && <p className="mt-3 text-[12px] text-[var(--st-dim)]">{message}</p>}
    </section>
  );
}
