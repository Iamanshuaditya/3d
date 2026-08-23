"use client";

import { useState } from "react";

export function TemplateAssetPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (formData: FormData) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/admin/template-assets", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null) as {
        asset?: { id: string; filename: string; sha256: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.asset) {
        throw new Error(payload?.error?.message || "Template asset upload failed.");
      }
      setMessage(`Stored immutable asset ${payload.asset.id} (${payload.asset.filename}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template asset upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-[var(--st-line)] bg-white p-5 sm:p-6" aria-label="Template artwork">
      <h2 className="text-[20px] font-semibold text-[var(--st-text)]">Reusable template artwork</h2>
      <p className="mt-2 text-[13px] leading-5 text-[var(--st-dim)]">
        Catalogue artwork is private and immutable. Published template versions bind its stable asset ID; customer projects receive their own copy.
      </p>
      <form action={upload} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-[11px] font-medium text-[var(--st-dim)]">
          PNG, JPEG, or WebP (max 20 MB)
          <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required className="mt-1 block text-[12px]" />
        </label>
        <button type="submit" disabled={busy} className="h-9 rounded-md border border-[var(--st-line)] px-3 text-[11px] font-semibold disabled:opacity-50">
          {busy ? "Uploading…" : "Upload immutable asset"}
        </button>
      </form>
      {message && <p className="mt-3 text-[12px] text-[var(--st-dim)]">{message}</p>}
    </section>
  );
}
