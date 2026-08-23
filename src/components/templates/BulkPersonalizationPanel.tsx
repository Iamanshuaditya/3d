"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Download, LoaderCircle, Upload } from "lucide-react";
import type {
  PersonalizationDatasetDto,
  PersonalizationJobDto,
} from "@/platform/personalization/types";
import type { PlaceholderDefinition, TemplateSummaryDto } from "@/platform/templates/types";

type ApiError = {
  error?: {
    message?: string;
    details?: { report?: { issues?: Array<{ message: string; sourceRowNumber: number | null }> } };
  };
};

function csvHeaders(source: string): string[] {
  const headers: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      headers.push(value.trim().replace(/^\uFEFF/, ""));
      value = "";
    } else if (character === "\n" || character === "\r") {
      headers.push(value.trim().replace(/^\uFEFF/, ""));
      break;
    } else {
      value += character;
    }
  }
  if (!headers.length && value) headers.push(value.trim().replace(/^\uFEFF/, ""));
  return headers.filter(Boolean);
}

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, credentials: "same-origin" });
  const body = await response.json() as T & ApiError;
  if (!response.ok) {
    const issues = body.error?.details?.report?.issues;
    const detail = issues?.slice(0, 3).map((issue) =>
      `${issue.sourceRowNumber ? `Row ${issue.sourceRowNumber}: ` : ""}${issue.message}`,
    ).join(" ");
    throw new Error(detail || body.error?.message || "The request failed.");
  }
  return body;
}

function defaultMapping(headers: string[], fields: PlaceholderDefinition[]) {
  const keys = new Set(fields.map((field) => field.key));
  return Object.fromEntries(headers.map((header) => [header, keys.has(header) ? header : ""]));
}

export function BulkPersonalizationPanel({ template }: { template: TemplateSummaryDto }) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dataset, setDataset] = useState<PersonalizationDatasetDto | null>(null);
  const [previewRows, setPreviewRows] = useState<number[]>([]);
  const [job, setJob] = useState<PersonalizationJobDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mappedFields = useMemo(
    () => Object.values(mapping).filter((value) => value && value !== "__ignore__"),
    [mapping],
  );

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(() => {
      void api<{ job: PersonalizationJobDto }>(`/api/v1/personalization-jobs/${job.id}`)
        .then((result) => setJob(result.job))
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Job status failed."));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [job]);

  const chooseFile = async (next: File | null) => {
    setFile(next);
    setDataset(null);
    setJob(null);
    setError(null);
    if (!next) {
      setHeaders([]);
      setMapping({});
      return;
    }
    const parsed = csvHeaders(await next.slice(0, 64 * 1024).text());
    setHeaders(parsed);
    setMapping(defaultMapping(parsed, template.placeholderDefinitions));
    if (!parsed.length) setError("The CSV header could not be read.");
  };

  const upload = async () => {
    if (!file || !headers.length) return;
    if (Object.values(mapping).some((value) => !value)) {
      setError("Map or explicitly ignore every CSV column.");
      return;
    }
    if (new Set(mappedFields).size !== mappedFields.length) {
      setError("Each template field can be mapped only once.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("templateId", template.id);
      form.set("templateVersionId", template.versionId);
      form.set("file", file);
      form.set("mapping", JSON.stringify(Object.fromEntries(
        Object.entries(mapping).map(([header, field]) => [
          header,
          field === "__ignore__" ? null : field,
        ]),
      )));
      const result = await api<{
        dataset: PersonalizationDatasetDto;
        previewRows: number[];
      }>("/api/v1/personalization-datasets", { method: "POST", body: form });
      setDataset(result.dataset);
      setPreviewRows(result.previewRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CSV validation failed.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!dataset) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ job: PersonalizationJobDto }>(
        "/api/v1/personalization-jobs",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `bulk-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({ datasetId: dataset.id }),
        },
      );
      setJob(result.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Job could not start.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    const result = await api<{ job: PersonalizationJobDto }>(
      `/api/v1/personalization-jobs/${job.id}/cancel`,
      { method: "POST" },
    );
    setJob(result.job);
  };

  const retry = async () => {
    if (!job) return;
    setError(null);
    try {
      const result = await api<{ job: PersonalizationJobDto }>(
        `/api/v1/personalization-jobs/${job.id}/retry`,
        { method: "POST" },
      );
      setJob(result.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Job could not be retried.");
    }
  };

  return (
    <section className="mt-4 rounded-xl bg-[var(--st-raised)] p-4 ring-1 ring-[var(--st-line)]">
      <h3 className="text-[13px] font-semibold text-[var(--st-text)]">Personalize from CSV</h3>
      <p className="mt-1 text-[11px] leading-5 text-[var(--st-dim)]">
        Validate up to 10,000 rows, preview the first three, then create a private variant manifest.
      </p>
      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--st-line-strong)] px-3 py-2 text-[12px] font-medium text-[var(--st-dim)]">
        <Upload className="h-3.5 w-3.5" /> {file?.name ?? "Choose CSV"}
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
        />
      </label>

      {headers.length > 0 && !dataset && (
        <div className="mt-3 space-y-2">
          {headers.map((header) => (
            <label key={header} className="grid grid-cols-[1fr_1.2fr] items-center gap-2 text-[11px]">
              <span className="truncate text-[var(--st-dim)]">{header}</span>
              <select
                value={mapping[header] ?? ""}
                onChange={(event) => setMapping((current) => ({
                  ...current,
                  [header]: event.target.value,
                }))}
                className="min-w-0 rounded-md bg-[var(--st-surface)] px-2 py-1.5 text-[11px]"
              >
                <option value="">Choose mapping…</option>
                <option value="__ignore__">Ignore column</option>
                {template.placeholderDefinitions.map((field) => (
                  <option key={field.key} value={field.key}>{field.label}</option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void upload()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--st-text)] px-3 py-2 text-[12px] font-semibold text-[var(--st-surface)] disabled:opacity-50"
          >
            {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Validate CSV
          </button>
        </div>
      )}

      {dataset && (
        <div className="mt-3">
          <p className="text-[11px] font-medium text-[var(--st-text)]">
            {dataset.rowCount.toLocaleString()} valid rows · retained until {new Date(dataset.expiresAt).toLocaleDateString()}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {previewRows.map((row) => (
              <div key={row} className="relative aspect-square overflow-hidden rounded-md bg-white">
                <Image
                  src={`/api/v1/personalization-datasets/${dataset.id}/preview?row=${row}`}
                  alt={`Generated row ${row + 1}`}
                  fill
                  unoptimized
                  className="object-contain"
                />
              </div>
            ))}
          </div>
          {!job && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void start()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--st-accent)] px-3 py-2 text-[12px] font-semibold text-[var(--st-accent-ink)] disabled:opacity-50"
            >
              {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
              Generate variants
            </button>
          )}
        </div>
      )}

      {job && (
        <div className="mt-3 text-[11px] text-[var(--st-dim)]">
          <div className="flex items-center justify-between">
            <span className="capitalize">{job.status}</span>
            <span>{job.processed.toLocaleString()} / {job.total.toLocaleString()}</span>
          </div>
          <progress
            value={job.processed}
            max={job.total}
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full accent-[var(--st-accent)]"
          />
          {job.downloadUrl && (
            <a href={job.downloadUrl} className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[var(--st-text)] px-3 py-2 font-semibold text-[var(--st-surface)]">
              <Download className="h-3.5 w-3.5" /> Download manifest
            </a>
          )}
          {["queued", "running"].includes(job.status) && (
            <button type="button" onClick={() => void cancel()} className="mt-2 w-full py-1 text-[var(--st-danger)]">
              Cancel job
            </button>
          )}
          {job.status === "failed" && (
            <div className="mt-2 text-[var(--st-danger)]">
              <p>Generation failed safely: {job.errorCode}</p>
              {job.attempt < job.maxAttempts && (
                <button type="button" onClick={() => void retry()} className="mt-1 font-semibold underline">
                  Retry ({job.maxAttempts - job.attempt} remaining)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-[11px] leading-5 text-[var(--st-danger)]">{error}</p>}
    </section>
  );
}
