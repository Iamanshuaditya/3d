"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Eye } from "lucide-react";
import type { CameraPreset, ProductConfig } from "@/types/configurator";
import type { ProductPresentation } from "@/lib/configurator/presentation";
import type { useCustomizer } from "@/lib/configurator/use-customizer";
import type { useUnfold } from "@/lib/configurator/use-unfold";
import type { ResolvedStudioPresentation } from "@/platform/presentation/types";
import { SurfaceSelector } from "@/components/configurator/SurfaceSelector";
import { StudioViewport } from "./StudioViewport";
import type { useInflation } from "@/lib/configurator/use-inflation";

const DesignEditor = dynamic(
  () => import("@/components/configurator/DesignEditor").then((module) => module.DesignEditor),
  { ssr: false },
);
type StudioPreviewProps = {
  config: ProductConfig;
  customizer: ReturnType<typeof useCustomizer>;
  studioPresentation: ResolvedStudioPresentation;
  structuralPresentation: ProductPresentation;
  unfold: ReturnType<typeof useUnfold>;
  inflation: ReturnType<typeof useInflation>;
  onPresetChange: (preset: CameraPreset) => void;
  animated: boolean;
  onAnimatedChange: (animated: boolean) => void;
  pendingPreset: CameraPreset | null;
  onPresetApplied: () => void;
  onClose: () => void;
  reviewPanel?: ReactNode;
};

const noop = () => {};

export function StudioPreview({
  config,
  customizer: c,
  studioPresentation,
  structuralPresentation,
  unfold,
  inflation,
  onPresetChange,
  animated,
  onAnimatedChange,
  pendingPreset,
  onPresetApplied,
  onClose,
  reviewPanel,
}: StudioPreviewProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const orderedSurfaces = useMemo(
    () => studioPresentation.targets.map((target) =>
      config.editableSurfaces.find((surface) => surface.id === target.surfaceId),
    ).filter((surface): surface is ProductConfig["editableSurfaces"][number] => Boolean(surface)),
    [config.editableSurfaces, studioPresentation.targets],
  );

  useEffect(() => {
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hidden);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const activeTarget = studioPresentation.targets.find(
    (target) => target.surfaceId === c.activeSurfaceId,
  );
  const unit = c.activeSurface.displayUnit ?? "cm";
  const displayScale = unit === "in" ? 1 / 2.54 : unit === "mm" ? 10 : 1;
  const width = c.activeSurface.physicalWidthCm * displayScale;
  const height = c.activeSurface.physicalHeightCm * displayScale;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${config.name} design preview`}
      className="fixed inset-0 z-[100] flex flex-col bg-[var(--st-bg)] text-[var(--st-text)]"
    >
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-[var(--st-line)] bg-[var(--st-surface)] px-4 py-3 sm:px-6">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-[var(--st-text)] ring-1 ring-[var(--st-line)] hover:bg-[var(--st-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-accent)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to editing
        </button>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{config.name}</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--st-faint)]">
            {studioPresentation.previewKind === "2d-proof" ? "2D artwork proof" : "Product preview"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-[var(--st-dim)]">
          <Eye className="h-4 w-4" />
          Review your design before downloading
        </div>
      </header>

      {orderedSurfaces.length > 1 && (
        <div className="flex shrink-0 justify-center border-b border-[var(--st-line)] bg-[var(--st-surface)] px-4 py-2">
          <SurfaceSelector
            surfaces={orderedSurfaces}
            activeId={c.activeSurfaceId}
            onSelect={c.selectSurface}
            ariaLabel={studioPresentation.navigationLabel}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
      {studioPresentation.previewKind === "2d-proof" ? (
        <main className="min-h-[400px] flex-1 overflow-auto p-5 sm:p-8 lg:min-h-0">
          <div className="mx-auto max-w-[1050px]">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--st-faint)]">
                  {activeTarget?.kind === "page" && activeTarget.pageNumber
                    ? `Page ${activeTarget.pageNumber}`
                    : activeTarget?.kind === "continuous-web"
                      ? "Continuous production web"
                      : "Print area"}
                </p>
                <h2 className="mt-1 text-[20px] font-semibold">{c.activeSurface.label}</h2>
              </div>
              <p className="text-[12px] tabular-nums text-[var(--st-dim)]">
                {width.toFixed(2)} × {height.toFixed(2)} {unit}
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--st-surface)] p-4 shadow-sm ring-1 ring-[var(--st-line)] sm:p-7">
              <DesignEditor
                surface={c.activeSurface}
                design={c.activeDesign}
                images={c.images}
                embroidery={c.embroidery.results}
                selectedId={null}
                showGuides={false}
                onSelect={noop}
                onChange={noop}
                onCommit={noop}
                showProductionChrome={false}
                readOnly
              />
            </div>
          </div>
        </main>
      ) : (
        <main className="min-h-[400px] flex-1 lg:min-h-0">
          <StudioViewport
            config={config} customizer={c} structuralPresentation={structuralPresentation}
            unfold={unfold} inflation={inflation} animated={animated}
            onAnimatedChange={onAnimatedChange} pendingPreset={pendingPreset}
            onPresetApplied={onPresetApplied} onPresetChange={onPresetChange}
          />
        </main>
      )}
      {reviewPanel}
      </div>
    </div>
  );
}
