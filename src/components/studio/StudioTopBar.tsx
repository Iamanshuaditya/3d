"use client";

import type { ReactNode, Ref } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, Eye, FileCode2, FolderOpen, LayoutGrid, Redo2, Undo2 } from "lucide-react";
import type { ProjectSaveState } from "@/platform/projects/types";
import type { ProductionArtifactKind } from "@/platform/production/types";
import { AccountControl } from "@/components/auth/AccountControl";
import { studioHref } from "@/lib/projects/location";

export type CatalogueEntry = { id: string; name: string };

type StudioTopBarProps = {
  catalogue: CatalogueEntry[];
  activeProductId: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onExportSvg: () => void;
  canExportSvg: boolean;
  onPreview: () => void;
  previewButtonRef: Ref<HTMLButtonElement>;
  saveState: ProjectSaveState;
  beforeNavigate: () => Promise<boolean>;
  exporting?: ProductionArtifactKind | null;
  previewOnly?: boolean;
  previewDownloads?: ReactNode;
  designSetupHref?: string;
};

const SAVE_STATUS: Record<ProjectSaveState, { label: string; dot: string }> = {
  loading: { label: "Opening project…", dot: "bg-[var(--st-faint)] animate-pulse" },
  saved: { label: "Saved", dot: "bg-[var(--st-positive)]" },
  saving: { label: "Saving…", dot: "bg-[var(--st-accent)] animate-pulse" },
  unsaved: { label: "Unsaved changes", dot: "bg-amber-500" },
  failed: { label: "Save failed", dot: "bg-[var(--st-danger)]" },
  offline: { label: "Offline", dot: "bg-amber-500" },
};

export function StudioTopBar({
  catalogue,
  activeProductId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExport,
  onExportSvg,
  canExportSvg,
  onPreview,
  previewButtonRef,
  saveState,
  beforeNavigate,
  exporting = null,
  previewOnly = false,
  previewDownloads,
  designSetupHref,
}: StudioTopBarProps) {
  const router = useRouter();
  const status = SAVE_STATUS[saveState];

  const navigate = async (href: string) => {
    if (await beforeNavigate()) router.push(href);
  };

  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-[var(--st-line)] bg-[var(--st-surface)] px-3 sm:gap-3 sm:px-5">
      <button
        type="button"
        onClick={() => void navigate("/")}
        title="Product library"
        className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-[var(--st-dim)] outline-none transition-colors hover:bg-[var(--st-raised)] hover:text-[var(--st-text)] focus-visible:ring-2 focus-visible:ring-[var(--st-accent)]"
      >
        <span className="select-none font-display text-2xl tracking-tight text-[var(--st-text)] sm:text-3xl">
          Vortex
        </span>
      </button>

      <div className="hidden h-5 w-px bg-[var(--st-line)] sm:block" aria-hidden="true" />

      {/* Product switcher — options come from the product registry, so there is
          no per-product copy to keep in sync here. */}
      <div className="relative min-w-0 max-w-[46vw] sm:max-w-[320px]">
        <select
          aria-label="Product"
          value={activeProductId}
          onChange={(event) => {
            const nextProductId = event.target.value;
            event.target.value = activeProductId;
            void navigate(studioHref({ product: nextProductId }));
          }}
          className="h-9 w-full cursor-pointer appearance-none truncate rounded-lg bg-[var(--st-raised)] pl-3 pr-9 text-[14px] font-medium text-[var(--st-text)] outline-none ring-[var(--st-accent)] transition-colors hover:bg-[var(--st-line-strong)] focus-visible:ring-2"
        >
          {catalogue.map((entry) => (
            <option key={entry.id} value={entry.id} className="bg-[var(--st-surface)]">
              {entry.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--st-dim)]"
        />
      </div>

      {designSetupHref && (
        <button type="button" onClick={() => void navigate(designSetupHref)} title="Templates & size"
          className="hidden h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-[var(--st-dim)] hover:bg-[var(--st-raised)] sm:flex">
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden xl:inline">Templates & size</span>
          <span className="sr-only xl:hidden">Templates & size</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => void navigate("/designs")}
        title="My designs"
        className="hidden h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-[var(--st-dim)] transition-colors hover:bg-[var(--st-raised)] hover:text-[var(--st-text)] md:flex"
      >
        <FolderOpen className="h-4 w-4" />
        My designs
      </button>

      <AccountControl compact />

      <div className="hidden items-center gap-0.5 rounded-lg bg-[var(--st-raised)] p-0.5 sm:flex">
        <button
          type="button"
          aria-label="Undo"
          title="Undo"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)] disabled:cursor-not-allowed disabled:text-[var(--st-faint)] disabled:hover:bg-transparent"
        >
          <Undo2 className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo"
          onClick={onRedo}
          disabled={!canRedo}
          className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)] disabled:cursor-not-allowed disabled:text-[var(--st-faint)] disabled:hover:bg-transparent"
        >
          <Redo2 className="h-[18px] w-[18px]" />
        </button>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="hidden items-center gap-2 text-[13px] text-[var(--st-dim)] md:flex"
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
        />
        {previewOnly ? "Session only" : status.label}
      </p>

      <button
        ref={previewButtonRef}
        type="button"
        onClick={onPreview}
        disabled={saveState === "loading"}
        className="ml-auto flex shrink-0 items-center gap-2 rounded-lg bg-[var(--st-raised)] px-3 py-2 text-[14px] font-semibold text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)] disabled:opacity-40 sm:px-4"
      >
        <Eye className="h-4 w-4" />
        <span className="hidden sm:inline">Review & export</span>
        <span className="sr-only sm:hidden">Open design preview</span>
      </button>

      {previewOnly ? previewDownloads : <button
        type="button"
        onClick={onExport}
        disabled={Boolean(exporting) || saveState === "loading"}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-[var(--st-accent)] px-3 py-2 text-[14px] font-semibold text-[var(--st-accent-ink)] transition-opacity hover:opacity-90 sm:px-4"
      >
        <Download className={`h-4 w-4 ${exporting === "pdf" ? "animate-pulse" : ""}`} />
        <span className="hidden sm:inline">
          {exporting === "pdf" ? "Preparing PDF…" : "Download print PDF"}
        </span>
        <span className="sr-only sm:hidden">
          {exporting === "pdf" ? "Preparing print PDF" : "Download print-ready PDF"}
        </span>
      </button>}

      {!previewOnly && canExportSvg && (
        <button
          type="button"
          onClick={onExportSvg}
          disabled={Boolean(exporting) || saveState === "loading"}
          title="Download manufacturing dieline SVG"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--st-raised)] text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)] disabled:opacity-40"
        >
          <FileCode2 className={`h-4 w-4 ${exporting === "svg" ? "animate-pulse" : ""}`} />
          <span className="sr-only">
            {exporting === "svg" ? "Preparing manufacturing SVG" : "Download manufacturing SVG"}
          </span>
        </button>
      )}
    </header>
  );
}
