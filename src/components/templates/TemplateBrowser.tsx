"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FilePlus2, LoaderCircle, Search } from "lucide-react";
import type { TemplateSummaryDto } from "@/platform/templates/types";
import type { PersonalizationData, PersonalizationScalar } from "@/types/configurator";
import { instantiateTemplate, listTemplates } from "@/lib/templates/client";
import { configurationStudioHref, projectStudioHref } from "@/lib/projects/location";

type TemplateBrowserProps = {
  productId: string;
  productName: string;
  productVersionId: string;
  configurationId: string;
  optionSelection: Record<string, string | number | boolean>;
};

function valueAt(data: PersonalizationData, key: string): PersonalizationScalar | undefined {
  let value: PersonalizationData | PersonalizationScalar | undefined = data;
  for (const segment of key.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = value[segment];
  }
  return value && typeof value === "object" ? undefined : value;
}

function nestedData(values: Record<string, string>): PersonalizationData {
  const result: PersonalizationData = {};
  for (const [path, value] of Object.entries(values)) {
    const segments = path.split(".");
    let target = result;
    segments.forEach((segment, index) => {
      if (index === segments.length - 1) {
        target[segment] = value;
      } else {
        const existing = target[segment];
        if (!existing || typeof existing !== "object") target[segment] = {};
        target = target[segment] as PersonalizationData;
      }
    });
  }
  return result;
}

export function TemplateBrowser({
  productId,
  productName,
  productVersionId,
  configurationId,
  optionSelection,
}: TemplateBrowserProps) {
  const [templates, setTemplates] = useState<TemplateSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    void listTemplates({ productId, productVersionId, configurationId })
      .then((items) => {
        if (cancelled) return;
        setTemplates(items);
        setValues(Object.fromEntries(items.map((template) => [
          template.versionId,
          Object.fromEntries(template.placeholderDefinitions.map((field) => [
            field.key,
            String(valueAt(template.defaultPersonalization, field.key) ?? ""),
          ])),
        ])));
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Templates could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configurationId, productId, productVersionId]);

  const categories = useMemo(
    () => [...new Set(templates.map((template) => template.taxonomy.category))].sort(),
    [templates],
  );
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return templates.filter((template) => {
      if (category && template.taxonomy.category !== category) return false;
      if (!needle) return true;
      return [
        template.name,
        template.description ?? "",
        template.taxonomy.style ?? "",
        template.taxonomy.industry ?? "",
        ...template.taxonomy.tags,
      ].join(" ").toLocaleLowerCase().includes(needle);
    });
  }, [category, search, templates]);

  const createFromTemplate = async (template: TemplateSummaryDto) => {
    setBusyId(template.versionId);
    setError(null);
    const clientRequestId = requestIds.current.get(template.versionId) ?? crypto.randomUUID();
    requestIds.current.set(template.versionId, clientRequestId);
    try {
      const project = await instantiateTemplate({
        templateId: template.id,
        templateVersionId: template.versionId,
        productId,
        productVersionId,
        optionSelection,
        personalization: nestedData(values[template.versionId] ?? {}),
        clientRequestId,
      });
      window.location.assign(projectStudioHref(project));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The template could not be used.");
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--st-faint)]" />
          <span className="sr-only">Search templates</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search style, industry, or tag"
            className="w-full rounded-xl bg-[var(--st-surface)] py-3 pl-10 pr-4 text-[14px] outline-none ring-1 ring-[var(--st-line)] focus:ring-2 focus:ring-[var(--st-accent)]"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {[null, ...categories].map((item) => (
            <button
              key={item ?? "all"}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 ${
                category === item
                  ? "bg-[var(--st-accent)] text-[var(--st-accent-ink)] ring-transparent"
                  : "bg-[var(--st-surface)] text-[var(--st-dim)] ring-[var(--st-line)]"
              }`}
            >
              {item ?? "All"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-5 rounded-xl bg-[var(--st-danger)]/10 px-4 py-3 text-[13px] text-[var(--st-danger)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex min-h-56 items-center justify-center text-[14px] text-[var(--st-dim)]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading templates…
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <article className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--st-line-strong)] bg-[var(--st-surface)] p-7 text-center">
            <FilePlus2 className="h-10 w-10 text-[var(--st-faint)]" />
            <h2 className="mt-5 text-[19px] font-semibold text-[var(--st-text)]">Blank design</h2>
            <p className="mt-2 text-[13px] leading-6 text-[var(--st-dim)]">
              Start with an empty {productName} and build it from scratch.
            </p>
            <Link
              href={configurationStudioHref({
                productId,
                productVersionId,
                optionSelection,
              })}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--st-accent)] px-4 py-2.5 text-[13px] font-semibold text-[var(--st-accent-ink)]"
            >
              Start blank <ArrowRight className="h-4 w-4" />
            </Link>
          </article>

          {visible.map((template, index) => {
            const busy = busyId === template.versionId;
            return (
              <article key={template.versionId} className="overflow-hidden rounded-2xl bg-[var(--st-surface)] ring-1 ring-[var(--st-line)]">
                <div className="relative aspect-[4/3] bg-[var(--st-raised)]">
                  <Image
                    src={template.previewUrl}
                    alt={`Preview of ${template.name}`}
                    fill
                    unoptimized
                    priority={index === 0}
                    className="object-contain p-3"
                  />
                </div>
                <div className="p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--st-faint)]">
                    {template.taxonomy.style ?? template.taxonomy.category}
                  </p>
                  <h2 className="mt-2 text-[18px] font-semibold text-[var(--st-text)]">{template.name}</h2>
                  <p className="mt-1.5 text-[13px] leading-5 text-[var(--st-dim)]">{template.description}</p>

                  {template.placeholderDefinitions.length > 0 && (
                    <div className="mt-4 space-y-3 border-t border-[var(--st-line)] pt-4">
                      {template.placeholderDefinitions.map((field) => (
                        <label key={field.key} className="block">
                          <span className="mb-1 block text-[11px] font-medium text-[var(--st-dim)]">
                            {field.label}{field.required ? " *" : ""}
                          </span>
                          <input
                            value={values[template.versionId]?.[field.key] ?? ""}
                            maxLength={field.maxLength}
                            onChange={(event) => setValues((current) => ({
                              ...current,
                              [template.versionId]: {
                                ...current[template.versionId],
                                [field.key]: event.target.value,
                              },
                            }))}
                            className="w-full rounded-lg bg-[var(--st-raised)] px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[var(--st-accent)]"
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => void createFromTemplate(template)}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--st-accent)] px-4 py-2.5 text-[13px] font-semibold text-[var(--st-accent-ink)] disabled:opacity-50"
                  >
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                    {busy ? "Creating project…" : "Use this template"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
