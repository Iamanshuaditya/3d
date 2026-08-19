"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Hand, Maximize2, Minus, Plus, Ruler } from "lucide-react";
import type { ProductConfig } from "@/types/configurator";
import { useCustomizer } from "@/lib/configurator/use-customizer";
import { StudioTopBar, type CatalogueEntry } from "./StudioTopBar";
import { StudioToolRail, type StudioTool } from "./StudioToolRail";
import { StudioPanel } from "./StudioPanel";
import { SurfaceSelector } from "@/components/configurator/SurfaceSelector";
import { normalizePrintJob } from "@/lib/print/normalize-job";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";

const DesignEditor = dynamic(
  () => import("@/components/configurator/DesignEditor").then((m) => m.DesignEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] w-full animate-pulse rounded bg-black/5" />
    ),
  },
);
const Product3DViewer = dynamic(
  () => import("@/components/configurator/Product3DViewer").then((m) => m.Product3DViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px] text-[var(--st-dim)]">Loading 3D preview…</p>
      </div>
    ),
  },
);

type StudioShellProps = {
  config: ProductConfig;
  catalogue: CatalogueEntry[];
};

const EDITOR_DISPLAY_WIDTH = 720;
const VERTICAL_RULE_WIDTH = 48;
const WORKSPACE_GAP = 16;
const HORIZONTAL_RULE_HEIGHT = 34;
const MIN_ZOOM = 25;
const MAX_ZOOM = 200;

type PanPoint = { x: number; y: number };

export function StudioShell({ config, catalogue }: StudioShellProps) {
  const c = useCustomizer(config);
  const [tool, setTool] = useState<StudioTool>("Text");
  const [zoom, setZoom] = useState(70);
  const [pan, setPan] = useState<PanPoint>({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  // Passive camera motion is opt-in in an editing tool. Manual orbit remains
  // available at all times and is the predictable default.
  const [animated, setAnimated] = useState(false);
  const [lidOpen, setLidOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"design" | "preview">("design");
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const workspaceViewportRef = useRef<HTMLDivElement>(null);
  const fitModeRef = useRef(true);
  const panGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: PanPoint;
  } | null>(null);

  const surface = c.activeSurface;
  const formatPhysical = (centimetres: number) =>
    surface.displayUnit === "in"
      ? `${(centimetres / 2.54).toFixed(2)}in`
      : `${centimetres.toFixed(1)}cm`;
  const editorDisplayHeight =
    EDITOR_DISPLAY_WIDTH * (surface.editorHeight / surface.editorWidth);
  const workspaceWidth = EDITOR_DISPLAY_WIDTH + VERTICAL_RULE_WIDTH + WORKSPACE_GAP;
  const workspaceHeight = editorDisplayHeight + HORIZONTAL_RULE_HEIGHT;

  const computeFitZoom = useCallback(() => {
    const viewport = workspaceViewportRef.current;
    if (!viewport) return;
    const widthScale = Math.max(0.01, (viewport.clientWidth - 80) / workspaceWidth);
    // Leave room for the floating zoom controls and comfortable grab space.
    const heightScale = Math.max(0.01, (viewport.clientHeight - 136) / workspaceHeight);
    const next = Math.round(
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(widthScale, heightScale) * 100)),
    );
    setZoom(next);
    setPan({ x: 0, y: 0 });
  }, [workspaceHeight, workspaceWidth]);

  const fitWorkspace = useCallback(() => {
    fitModeRef.current = true;
    computeFitZoom();
  }, [computeFitZoom]);

  useLayoutEffect(() => {
    const viewport = workspaceViewportRef.current;
    if (!viewport) return;
    fitModeRef.current = true;
    computeFitZoom();
    const observer = new ResizeObserver(() => {
      if (fitModeRef.current) computeFitZoom();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [computeFitZoom]);

  const adjustZoom = useCallback((delta: number) => {
    fitModeRef.current = false;
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + delta)));
  }, []);

  const startWorkspacePan = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.button !== 1) return;
      const target = event.target as HTMLElement;
      const overEditor = Boolean(target.closest("[data-design-editor]"));
      if (!panMode && event.button !== 1 && overEditor) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      fitModeRef.current = false;
      panGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: pan,
      };
      setIsPanning(true);
    },
    [pan, panMode],
  );

  const moveWorkspace = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPan({
      x: gesture.origin.x + event.clientX - gesture.startX,
      y: gesture.origin.y + event.clientY - gesture.startY,
    });
  }, []);

  const stopWorkspacePan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    panGestureRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleWorkspaceWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    fitModeRef.current = false;
    if (event.ctrlKey || event.metaKey) {
      const delta = event.deltaY < 0 ? 5 : -5;
      setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + delta)));
      return;
    }
    setPan((current) => ({
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  }, []);

  const exportProductionPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExportNotice(null);
    try {
      const job = normalizePrintJob(config, c.design);
      const { generateProductionPdf } = await import("@/lib/print/generate-production-pdf");
      const result = await generateProductionPdf(job);
      const downloadBytes = result.bytes.slice();
      const url = URL.createObjectURL(
        new Blob([downloadBytes.buffer], { type: "application/pdf" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);

      const warningCount = result.report.issues.filter(
        (issue) => issue.severity === "warning",
      ).length;
      setExportNotice({
        kind: "success",
        message: warningCount
          ? `Production PDF downloaded after preflight with ${warningCount} warning${warningCount === 1 ? "" : "s"}.`
          : "Production PDF downloaded. Geometry, image resolution, ICC output intent, and manufacturing paths passed preflight.",
      });
    } catch (error) {
      setExportNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Production PDF export failed.",
      });
    } finally {
      setExporting(false);
    }
  }, [c.design, config, exporting]);

  // Dieline overlay comes from the same spec that generates the 3D mesh —
  // or, for onboarded products, directly from generated surface data.
  const dieline = useMemo(() => {
    return resolveSurfaceDieline(config, surface);
  }, [config, surface]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--st-bg)] text-[var(--st-text)]">
      <StudioTopBar
        catalogue={catalogue}
        activeProductId={config.id}
        canUndo={c.canUndo}
        canRedo={c.canRedo}
        onUndo={c.undo}
        onRedo={c.redo}
        onExport={exportProductionPdf}
        exporting={exporting}
      />

      {exportNotice && (
        <div
          role={exportNotice.kind === "error" ? "alert" : "status"}
          className={`border-b px-5 py-2.5 text-[13px] font-medium whitespace-pre-line ${
            exportNotice.kind === "error"
              ? "border-[var(--st-danger)] bg-[var(--st-danger)]/12 text-[var(--st-danger)]"
              : "border-[var(--st-positive)] bg-[var(--st-positive)]/10 text-[var(--st-text)]"
          }`}
        >
          {exportNotice.message}
        </div>
      )}

      {c.validation && !c.validation.ok && (
        <div
          role="alert"
          className="border-b border-[var(--st-danger)] bg-[var(--st-danger)]/12 px-5 py-2.5"
        >
          <p className="text-[13px] font-medium text-[var(--st-danger)]">
            Product model invalid: {c.validation.errors.join(" ")}
          </p>
        </div>
      )}

      {/* Mobile view switcher */}
      <div className="flex gap-1 border-b border-[var(--st-line)] bg-[var(--st-surface)] p-2 lg:hidden">
        {(["design", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMobileTab(t)}
            aria-pressed={mobileTab === t}
            className={`flex-1 rounded-lg px-4 py-2 text-[13px] font-medium capitalize transition-colors ${
              mobileTab === t
                ? "bg-[var(--st-accent)] text-[var(--st-accent-ink)]"
                : "bg-[var(--st-raised)] text-[var(--st-dim)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Below lg the three regions stack: stage, panel, then the tool rail
            as a bottom bar. Above lg they sit side by side. */}
        <div
          className={`${
            mobileTab === "design" ? "flex" : "hidden"
          } min-h-0 min-w-0 flex-1 flex-col lg:flex lg:flex-row`}
        >
          <div className="order-3 flex shrink-0 lg:order-1">
            <StudioToolRail active={tool} onSelect={setTool} />
          </div>

          <div className="order-2 flex min-h-0 shrink-0 lg:order-2">
            <StudioPanel tool={tool} customizer={c} />
          </div>

          {/* ---- Working stage ---- */}
          <div className="relative order-1 flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--st-stage)] text-[var(--st-stage-ink)] lg:order-3">
            {config.editableSurfaces.length > 1 && (
              <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-xl bg-[var(--st-surface)]/95 p-1.5 shadow-lg backdrop-blur">
                <SurfaceSelector
                  surfaces={config.editableSurfaces}
                  activeId={c.activeSurfaceId}
                  onSelect={c.selectSurface}
                />
              </div>
            )}
            <div
              ref={workspaceViewportRef}
              aria-label="Movable design workspace"
              className={`absolute inset-0 touch-none overflow-hidden overscroll-none ${
                panMode ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
              }`}
              onPointerDownCapture={startWorkspacePan}
              onPointerMove={moveWorkspace}
              onPointerUp={stopWorkspacePan}
              onPointerCancel={stopWorkspacePan}
              onWheel={handleWorkspaceWheel}
            >
              <div
                className="absolute left-1/2 top-1/2 will-change-transform"
                style={{
                  width: workspaceWidth,
                  height: workspaceHeight,
                  transform: `translate(-50%, -50%) translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom / 100})`,
                  transformOrigin: "center",
                }}
              >
                <div className="flex items-start" style={{ gap: WORKSPACE_GAP }}>
                  {/* vertical rule */}
                  <div
                    className="flex shrink-0 flex-col items-center justify-center opacity-70"
                    style={{ width: VERTICAL_RULE_WIDTH, height: editorDisplayHeight }}
                  >
                    <div className="h-px w-3 bg-current" />
                    <div className="my-1 flex-1 border-l border-current" />
                    <span className="my-2 whitespace-nowrap text-[11px] tabular-nums">
                      {formatPhysical(surface.physicalHeightCm)}
                    </span>
                    <div className="my-1 flex-1 border-l border-current" />
                    <div className="h-px w-3 bg-current" />
                  </div>

                  <div style={{ width: EDITOR_DISPLAY_WIDTH }}>
                    <div className="relative" data-design-editor>
                      <div className="pointer-events-none absolute -top-7 right-0 z-10 flex gap-2 text-[11px]">
                        <span className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-inset ring-black/10">
                          Safety area
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-inset ring-black/10">
                          Bleed
                        </span>
                      </div>

                      {config.editableSurfaces.map((s) => {
                        const isActive = s.id === c.activeSurfaceId;
                        return (
                          <div
                            key={s.id}
                            aria-hidden={!isActive}
                            className={
                              isActive
                                ? "w-full"
                                : "pointer-events-none absolute left-[-99999px] top-0 w-[720px]"
                            }
                          >
                            <DesignEditor
                              surface={s}
                              design={c.design.surfaces[s.id]}
                              selectedId={isActive ? c.selectedId : null}
                              showGuides={c.showGuides && isActive}
                              onSelect={c.setSelectedId}
                              onChange={c.applyChange}
                              onCommit={c.commitHistory}
                              onCanvasReady={c.registerCanvas}
                              onDirty={c.markDirty}
                              selectedSectionId={isActive ? c.activeSectionId : null}
                              hoveredMeshName={isActive ? c.hoveredMeshName : null}
                              onSectionSelect={c.selectSection}
                              onSectionHover={c.setHoveredMeshName}
                              showProductionChrome={false}
                              dieline={isActive ? dieline : undefined}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* horizontal rule */}
                    <div className="mt-3 flex items-center opacity-70">
                      <div className="h-3 w-px bg-current" />
                      <div className="flex-1 border-t border-current" />
                      <span className="mx-2 whitespace-nowrap text-[11px] tabular-nums">
                        {formatPhysical(surface.physicalWidthCm)}
                      </span>
                      <div className="flex-1 border-t border-current" />
                      <div className="h-3 w-px bg-current" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* workspace controls */}
            <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-[var(--st-surface)] p-1 shadow-[0_6px_24px_rgba(16,18,22,0.14)] ring-1 ring-[var(--st-line)]">
                <button
                  type="button"
                  aria-label="Move canvas"
                  aria-pressed={panMode}
                  title="Move canvas"
                  onClick={() => setPanMode((current) => !current)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                    panMode
                      ? "bg-[var(--st-accent)] text-[var(--st-accent-ink)]"
                      : "text-[var(--st-text)] hover:bg-[var(--st-raised)]"
                  }`}
                >
                  <Hand className="h-[18px] w-[18px]" />
                </button>
                <button
                  type="button"
                  aria-label="Toggle print guides"
                  aria-pressed={c.showGuides}
                  title="Print guides"
                  onClick={() => c.setShowGuides(!c.showGuides)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                    c.showGuides
                      ? "bg-[var(--st-accent)] text-[var(--st-accent-ink)]"
                      : "text-[var(--st-text)] hover:bg-[var(--st-raised)]"
                  }`}
                >
                  <Ruler className="h-[18px] w-[18px]" />
                </button>

                <div className="mx-1 h-5 w-px bg-[var(--st-line)]" aria-hidden="true" />

                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() => adjustZoom(-10)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--st-text)] transition-colors hover:bg-[var(--st-raised)]"
                >
                  <Minus className="h-[18px] w-[18px]" />
                </button>
                <span className="w-12 text-center text-[13px] tabular-nums text-[var(--st-text)]">
                  {zoom}%
                </span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() => adjustZoom(10)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--st-text)] transition-colors hover:bg-[var(--st-raised)]"
                >
                  <Plus className="h-[18px] w-[18px]" />
                </button>
                <button
                  type="button"
                  aria-label="Fit canvas to screen"
                  title="Fit to screen"
                  onClick={fitWorkspace}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--st-text)] transition-colors hover:bg-[var(--st-raised)]"
                >
                  <Maximize2 className="h-[17px] w-[17px]" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ---- 3D preview ---- */}
        <section
          aria-label="3D preview"
          className={`${
            mobileTab === "preview" ? "flex" : "hidden"
          } relative min-w-0 flex-1 flex-col border-l border-[var(--st-line)] bg-[var(--st-bg)] lg:flex lg:w-[36vw] lg:min-w-[460px] lg:max-w-[720px] lg:flex-none`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--st-line)] px-4 py-2.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--st-faint)]">
              Preview
            </span>

            <div className="flex items-center gap-2">
              {config.canOpen && (
                <button
                  type="button"
                  onClick={() => setLidOpen((v) => !v)}
                  aria-pressed={lidOpen}
                  className="rounded-lg bg-[var(--st-raised)] px-3 py-1.5 text-[13px] font-medium text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)]"
                >
                  {lidOpen ? "Close lid" : "Open lid"}
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={animated}
                onClick={() => setAnimated((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[var(--st-dim)] transition-colors hover:text-[var(--st-text)]"
              >
                Auto-motion
                <span
                  aria-hidden="true"
                  className={`relative h-[18px] w-8 rounded-full transition-colors ${
                    animated ? "bg-[var(--st-accent)]" : "bg-[var(--st-raised)]"
                  }`}
                >
                  <span
                    className={`absolute top-[3px] h-3 w-3 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-all ${
                      animated ? "left-[17px]" : "left-[3px]"
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-3">
            <div className="h-full overflow-hidden rounded-xl ring-1 ring-[var(--st-line)]">
              <Product3DViewer
                config={config}
                textures={c.textures}
                consumeDirty={c.consumeDirty}
                pendingPreset={null}
                onPresetApplied={() => {}}
                onValidated={c.handleValidated}
                onSurfaceClick={c.selectSurface}
                highlightedMeshName={c.hoveredMeshName}
                onMeshHover={c.setHoveredMeshName}
                onMeshClick={c.selectMesh}
                hoverParallax={animated}
                fold={1}
                lidOpen={lidOpen ? 1 : 0}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
