"use client";

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { CameraPreset, ProductConfig } from "@/types/configurator";
import type { ProductPresentation } from "@/lib/configurator/presentation";
import type { useCustomizer } from "@/lib/configurator/use-customizer";
import type { useUnfold } from "@/lib/configurator/use-unfold";
import type { ResolvedStudioPresentation } from "@/platform/presentation/types";
import { SurfaceSelector } from "@/components/configurator/SurfaceSelector";
import { UnfoldControl } from "@/components/configurator/UnfoldControl";

const DesignEditor = dynamic(
  () => import("@/components/configurator/DesignEditor").then((module) => module.DesignEditor),
  { ssr: false },
);
const Product3DViewer = dynamic(
  () => import("@/components/configurator/Product3DViewer").then((module) => module.Product3DViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--st-dim)]">
        Loading product proof…
      </div>
    ),
  },
);

type StudioPreviewProps = {
  config: ProductConfig;
  customizer: ReturnType<typeof useCustomizer>;
  studioPresentation: ResolvedStudioPresentation;
  structuralPresentation: ProductPresentation;
  unfold: ReturnType<typeof useUnfold>;
  animated: boolean;
  onAnimatedChange: (animated: boolean) => void;
  pendingPreset: CameraPreset | null;
  onPresetApplied: () => void;
  onClose: () => void;
};

const noop = () => {};

export function StudioPreview({
  config,
  customizer: c,
  studioPresentation,
  structuralPresentation,
  unfold,
  animated,
  onAnimatedChange,
  pendingPreset,
  onPresetApplied,
  onClose,
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
          <CheckCircle2 className="h-4 w-4 text-[var(--st-positive)]" />
          Same design state · no editing controls
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

      {studioPresentation.previewKind === "2d-proof" ? (
        <main className="min-h-0 flex-1 overflow-auto p-5 sm:p-8">
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
        <main className="relative min-h-0 flex-1 p-3 sm:p-5">
          <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[var(--st-surface)]/95 p-1.5 shadow-lg ring-1 ring-[var(--st-line)] backdrop-blur">
            <UnfoldControl
              presentation={structuralPresentation}
              status={unfold.status}
              onNext={unfold.next}
              onPrevious={unfold.previous}
              onReset={unfold.reset}
            />
            <button
              type="button"
              role="switch"
              aria-checked={animated}
              onClick={() => onAnimatedChange(!animated)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[var(--st-dim)] hover:text-[var(--st-text)]"
            >
              Auto-motion
              <span
                aria-hidden="true"
                className={`relative h-[18px] w-8 rounded-full ${animated ? "bg-[var(--st-accent)]" : "bg-[var(--st-raised)]"}`}
              >
                <span
                  className={`absolute top-[3px] h-3 w-3 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-all ${animated ? "left-[17px]" : "left-[3px]"}`}
                />
              </span>
            </button>
          </div>
          <div className="h-full overflow-hidden rounded-2xl bg-[var(--st-surface)] ring-1 ring-[var(--st-line)]">
            <Product3DViewer
              config={config}
              textures={c.textures}
              materialTextures={c.materialTextures}
              consumeDirty={c.consumeDirty}
              pendingPreset={pendingPreset}
              onPresetApplied={onPresetApplied}
              onValidated={c.handleValidated}
              onSurfaceClick={c.selectSurface}
              highlightedMeshName={c.hoveredMeshName}
              onMeshHover={c.setHoveredMeshName}
              onMeshClick={c.selectMesh}
              hoverParallax={animated}
              hingeAngles={unfold.angles}
              dielineView={Boolean(unfold.status?.isFlat)}
            />
          </div>
        </main>
      )}
    </div>
  );
}
