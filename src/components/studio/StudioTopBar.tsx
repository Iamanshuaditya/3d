"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, LayoutGrid, Redo2, Undo2 } from "lucide-react";

export type CatalogueEntry = { id: string; name: string };

type StudioTopBarProps = {
  catalogue: CatalogueEntry[];
  activeProductId: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
};

export function StudioTopBar({
  catalogue,
  activeProductId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExport,
}: StudioTopBarProps) {
  const router = useRouter();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--st-line)] bg-[var(--st-surface)] px-3 sm:gap-4 sm:px-4">
      <Link
        href="/"
        title="Product library"
        className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-[var(--st-dim)] outline-none transition-colors hover:bg-[var(--st-raised)] hover:text-[var(--st-text)] focus-visible:ring-2 focus-visible:ring-[var(--st-accent)]"
      >
        <LayoutGrid className="h-[18px] w-[18px]" />
        <span className="hidden select-none text-[11px] font-semibold uppercase tracking-[0.24em] sm:inline">
          Library
        </span>
      </Link>

      <div className="hidden h-5 w-px bg-[var(--st-line)] sm:block" aria-hidden="true" />

      {/* Product switcher — options come from the product registry, so there is
          no per-product copy to keep in sync here. */}
      <div className="relative min-w-0 max-w-[46vw] sm:max-w-none">
        <select
          aria-label="Product"
          value={activeProductId}
          onChange={(event) => router.push(`/studio?product=${event.target.value}`)}
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

      <p className="hidden items-center gap-2 text-[13px] text-[var(--st-dim)] md:flex">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-[var(--st-positive)]"
        />
        Saved on this device
      </p>

      <button
        type="button"
        onClick={onExport}
        className="ml-auto flex shrink-0 items-center gap-2 rounded-lg bg-[var(--st-accent)] px-3 py-2 text-[14px] font-semibold text-[var(--st-accent-ink)] transition-opacity hover:opacity-90 sm:px-4"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Export PNG</span>
        <span className="sr-only sm:hidden">Export PNG</span>
      </button>
    </header>
  );
}
