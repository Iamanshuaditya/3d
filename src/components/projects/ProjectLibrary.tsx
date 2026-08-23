"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Archive, Copy, LoaderCircle, Pencil } from "lucide-react";
import type { ProjectSummaryDto } from "@/platform/projects/types";
import {
  archiveProject,
  duplicateProject,
  generateProjectPreview,
  listProjects,
} from "@/lib/projects/client";

type ProjectLibraryProps = {
  productNames: Record<string, string>;
};

const STATUS_LABEL: Record<ProjectSummaryDto["status"], string> = {
  draft: "Draft",
  ready_for_preflight: "Ready for preflight",
  production_ready: "Production ready",
  archived: "Archived",
};

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function ProjectLibrary({ productNames }: ProjectLibraryProps) {
  const [projects, setProjects] = useState<ProjectSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projects],
  );

  useEffect(() => {
    let cancelled = false;
    void listProjects()
      .then((items) => {
        if (cancelled) return;
        setProjects(items);
        // Previews are deliberately outside the edit/save path. If a tab was
        // closed before the post-save debounce fired, the library repairs the
        // missing cache in the background without changing project revision.
        for (const project of items.filter((item) => !item.previewUrl).slice(0, 12)) {
          void generateProjectPreview(project.id)
            .then((generated) => {
              if (cancelled) return;
              setProjects((current) =>
                current.map((item) => (item.id === generated.id ? generated : item)),
              );
            })
            .catch(() => {
              // A preview is a regenerable cache; the editable project remains
              // available even if rendering is temporarily unavailable.
            });
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Your designs could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const duplicate = async (project: ProjectSummaryDto) => {
    setBusyId(project.id);
    setError(null);
    try {
      const copy = await duplicateProject(project.id);
      let previewUrl = copy.previewUrl;
      try {
        previewUrl = (await generateProjectPreview(copy.id)).previewUrl;
      } catch {
        // The editable duplicate is complete even when preview rendering fails.
      }
      const summary: ProjectSummaryDto = {
        id: copy.id,
        title: copy.title,
        productId: copy.productId,
        productVersionId: copy.productVersionId,
        configurationId: copy.configurationId,
        optionSelection: copy.optionSelection,
        status: copy.status,
        revision: copy.revision,
        previewUrl,
        createdAt: copy.createdAt,
        updatedAt: copy.updatedAt,
      };
      setProjects((current) => [summary, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The design could not be duplicated.");
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (project: ProjectSummaryDto) => {
    if (!window.confirm(`Archive “${project.title}”?`)) return;
    setBusyId(project.id);
    setError(null);
    try {
      await archiveProject(project.id);
      setProjects((current) => current.filter((candidate) => candidate.id !== project.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The design could not be archived.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-[14px] text-[var(--st-dim)]">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Loading your designs…
      </div>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-5 rounded-xl bg-[var(--st-danger)]/10 px-4 py-3 text-[13px] text-[var(--st-danger)]">
          {error}
        </p>
      )}

      {!orderedProjects.length ? (
        <div className="rounded-2xl border border-dashed border-[var(--st-line-strong)] px-6 py-16 text-center">
          <h2 className="text-[20px] font-semibold text-[var(--st-text)]">No saved designs yet</h2>
          <p className="mx-auto mt-2 max-w-[42ch] text-[14px] leading-6 text-[var(--st-dim)]">
            Choose a product and start designing. Your project and uploaded artwork will save automatically.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-lg bg-[var(--st-accent)] px-4 py-2.5 text-[14px] font-semibold text-[var(--st-accent-ink)]"
          >
            Choose a product
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {orderedProjects.map((project) => {
            const busy = busyId === project.id;
            return (
              <article
                key={project.id}
                className="overflow-hidden rounded-2xl bg-[var(--st-surface)] shadow-sm ring-1 ring-[var(--st-line)]"
              >
                <div className="relative aspect-[4/3] bg-[var(--st-raised)]">
                  {project.previewUrl ? (
                    <Image
                      src={project.previewUrl}
                      alt={`Preview of ${project.title}`}
                      fill
                      unoptimized
                      className="object-contain p-4"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-[12px] uppercase tracking-[0.16em] text-[var(--st-faint)]">
                      Preview is generated after the first save
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[16px] font-semibold text-[var(--st-text)]">
                        {project.title}
                      </h2>
                      <p className="mt-1 truncate text-[13px] text-[var(--st-dim)]">
                        {productNames[project.productId] ?? project.productId}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--st-raised)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--st-dim)]">
                      {STATUS_LABEL[project.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-[12px] text-[var(--st-faint)]">
                    Updated {relativeTime(project.updatedAt)} · revision {project.revision}
                  </p>

                  <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
                    <Link
                      href={`/studio?product=${encodeURIComponent(project.productId)}&project=${encodeURIComponent(project.id)}&version=${encodeURIComponent(project.productVersionId)}${Object.keys(project.optionSelection).length ? `&options=${encodeURIComponent(JSON.stringify(project.optionSelection))}` : ""}`}
                      className="flex items-center justify-center gap-2 rounded-lg bg-[var(--st-accent)] px-3 py-2 text-[13px] font-semibold text-[var(--st-accent-ink)]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Continue
                    </Link>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void duplicate(project)}
                      aria-label={`Duplicate ${project.title}`}
                      title="Duplicate"
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--st-raised)] text-[var(--st-text)] disabled:opacity-40"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void archive(project)}
                      aria-label={`Archive ${project.title}`}
                      title="Archive"
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--st-raised)] text-[var(--st-danger)] disabled:opacity-40"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
