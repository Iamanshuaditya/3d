"use client";

import { useEffect, useState } from "react";

type JobDto = {
  id: string;
  productId: string;
  draftId: string | null;
  status: "queued" | "running" | "passed" | "failed" | "cancelled";
  commandVersion: string;
  reportAssetId: string | null;
  errorCode: string | null;
  outputs: Array<{
    id: string;
    role: string;
    filename: string;
    byteSize: number;
    sha256: string;
    contentUrl: string;
  }>;
};

export function OnboardingPanel() {
  const [job, setJob] = useState<JobDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draftId, setDraftId] = useState("");
  const [draftRevision, setDraftRevision] = useState("1");

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/v1/admin/onboarding/jobs/${encodeURIComponent(job.id)}`, {
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { job: JobDto };
        setJob(payload.job);
      });
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [job]);

  const submit = async (formData: FormData) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/admin/onboarding/jobs", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null) as {
        job?: JobDto;
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.job) {
        throw new Error(payload?.error?.message || "Onboarding job could not be created.");
      }
      setJob(payload.job);
      setDraftId(payload.job.draftId ?? String(formData.get("draftId") ?? ""));
      setMessage("Bounded onboarding job queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Onboarding failed.");
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    if (!job) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/admin/onboarding/jobs/${encodeURIComponent(job.id)}/attach`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            draftId,
            expectedRevision: Number(draftRevision),
          }),
        },
      );
      const payload = await response.json().catch(() => null) as {
        draft?: { revision: number };
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.draft) {
        throw new Error(payload?.error?.message || "Report could not be attached.");
      }
      setDraftRevision(String(payload.draft.revision));
      setMessage(`Report provenance attached at draft revision ${payload.draft.revision}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Attachment failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-[var(--st-line)] bg-white p-5 sm:p-6" aria-label="GLB onboarding">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--st-faint)]">Existing Python pipeline</p>
        <h2 className="mt-2 text-[20px] font-semibold text-[var(--st-text)]">GLB onboarding job</h2>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-5 text-[var(--st-dim)]">
          Upload a GLB for inspection. Add a manifest to run the complete inspect, build, and mathematical validation pipeline in an isolated working directory.
        </p>
      </div>
      <form action={submit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[11px] font-medium text-[var(--st-dim)]">
          Product ID
          <input name="productId" required pattern="[a-z0-9][a-z0-9._-]*" maxLength={128} className="mt-1 h-10 w-full rounded-md border border-[var(--st-line)] px-3 text-[13px]" />
        </label>
        <label className="text-[11px] font-medium text-[var(--st-dim)]">
          Draft ID (optional)
          <input name="draftId" maxLength={180} className="mt-1 h-10 w-full rounded-md border border-[var(--st-line)] px-3 text-[13px]" />
        </label>
        <label className="text-[11px] font-medium text-[var(--st-dim)]">
          Source GLB (max 64 MB)
          <input name="glb" type="file" accept=".glb,model/gltf-binary" required className="mt-1 block w-full text-[12px]" />
        </label>
        <label className="text-[11px] font-medium text-[var(--st-dim)]">
          Manifest JSON (optional)
          <input name="manifest" type="file" accept=".json,application/json" className="mt-1 block w-full text-[12px]" />
        </label>
        <button type="submit" disabled={busy} className="h-10 rounded-lg bg-[var(--st-text)] px-4 text-[12px] font-semibold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-1">
          {busy ? "Submitting…" : "Run onboarding"}
        </button>
      </form>

      {job && (
        <div className="mt-5 border-t border-[var(--st-line)] pt-4">
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <span className="rounded-full bg-[var(--st-raised)] px-2.5 py-1 font-semibold uppercase tracking-[0.12em]">{job.status}</span>
            <span className="font-mono text-[var(--st-faint)]">{job.id}</span>
            {job.errorCode && <span className="font-mono font-semibold text-red-700">{job.errorCode}</span>}
          </div>
          {job.outputs.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {job.outputs.map((output) => (
                <li key={output.id}>
                  <a href={output.contentUrl} className="inline-flex rounded-md border border-[var(--st-line)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--st-text)] hover:bg-[var(--st-raised)]">
                    {output.role}: {output.filename}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {job.status === "passed" && job.reportAssetId && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="text-[11px] font-medium text-[var(--st-dim)]">
                Draft ID
                <input value={draftId} onChange={(event) => setDraftId(event.target.value)} className="mt-1 h-9 w-64 rounded-md border border-[var(--st-line)] px-2 text-[12px]" />
              </label>
              <label className="text-[11px] font-medium text-[var(--st-dim)]">
                Expected revision
                <input value={draftRevision} onChange={(event) => setDraftRevision(event.target.value)} inputMode="numeric" className="mt-1 h-9 w-24 rounded-md border border-[var(--st-line)] px-2 text-[12px]" />
              </label>
              <button type="button" onClick={() => void attach()} disabled={busy || !draftId} className="h-9 rounded-md border border-[var(--st-line)] px-3 text-[11px] font-semibold disabled:opacity-50">
                Attach validated provenance
              </button>
            </div>
          )}
        </div>
      )}
      {message && <p className="mt-3 text-[12px] text-[var(--st-dim)]">{message}</p>}
    </section>
  );
}
