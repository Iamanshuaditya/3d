"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Hand, ImagePlus, Maximize2, Minus, Plus, Ruler } from "lucide-react";
import { useCustomizer } from "@/lib/configurator/use-customizer";
import {
  createPacdoraLabStudioConfig,
  type PouchLabSolution,
} from "@/lib/pacdora-lab";
import { StudioPanel } from "@/components/studio/StudioPanel";
import { StudioToolRail, type StudioTool } from "@/components/studio/StudioToolRail";

const DesignEditor = dynamic(
  () => import("@/components/configurator/DesignEditor").then((module) => module.DesignEditor),
  {
    ssr: false,
    loading: () => <div className="h-[520px] w-full animate-pulse rounded bg-black/5" />,
  },
);

type PouchStudioEditorProps = {
  solution: PouchLabSolution;
  onArtworkCanvasChange: (canvas: HTMLCanvasElement | null, revision: number) => void;
};

type PanPoint = { x: number; y: number };

const EDITOR_DISPLAY_WIDTH = 520;
const VERTICAL_RULE_WIDTH = 42;
const WORKSPACE_GAP = 14;
const HORIZONTAL_RULE_HEIGHT = 32;
const MIN_ZOOM = 25;
const MAX_ZOOM = 200;

export function PouchStudioEditor({
  solution,
  onArtworkCanvasChange,
}: PouchStudioEditorProps) {
  const config = useMemo(() => createPacdoraLabStudioConfig(solution), [solution]);
  const c = useCustomizer(config, null, true);
  const {
    activeDesign,
    applyChange,
    commitHistory,
    markDirty,
    registerCanvas,
    scheduleDirty,
    uploadFiles,
  } = c;
  const [tool, setTool] = useState<StudioTool>("Uploads");
  const [zoom, setZoom] = useState(70);
  const [pan, setPan] = useState<PanPoint>({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [artworkDropActive, setArtworkDropActive] = useState(false);
  const [artworkCanvas, setArtworkCanvas] = useState<HTMLCanvasElement | null>(null);
  const [artworkRevision, setArtworkRevision] = useState(0);
  const workspaceViewportRef = useRef<HTMLDivElement>(null);
  const artworkDragDepthRef = useRef(0);
  const fitModeRef = useRef(true);
  const previousEditorSizeRef = useRef({
    width: config.editableSurfaces[0].editorWidth,
    height: config.editableSurfaces[0].editorHeight,
  });
  const panGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: PanPoint;
  } | null>(null);

  const surface = c.activeSurface;
  const editorDisplayHeight = EDITOR_DISPLAY_WIDTH * (
    surface.editorHeight / surface.editorWidth
  );
  const workspaceWidth = EDITOR_DISPLAY_WIDTH + VERTICAL_RULE_WIDTH + WORKSPACE_GAP;
  const workspaceHeight = editorDisplayHeight + HORIZONTAL_RULE_HEIGHT;

  const computeFitZoom = useCallback(() => {
    const viewport = workspaceViewportRef.current;
    if (!viewport) return;
    const widthScale = Math.max(0.01, (viewport.clientWidth - 44) / workspaceWidth);
    const heightScale = Math.max(0.01, (viewport.clientHeight - 118) / workspaceHeight);
    setZoom(Math.round(
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(widthScale, heightScale) * 100)),
    ));
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

  const startWorkspacePan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
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
  }, [pan, panMode]);

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

  const handleArtworkDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    artworkDragDepthRef.current = 0;
    setArtworkDropActive(false);
    if (!event.dataTransfer.files.length) return;
    setTool("Uploads");
    void uploadFiles(event.dataTransfer.files);
  }, [uploadFiles]);

  const addDemoArtwork = useCallback(() => {
    void (async () => {
      const response = await fetch("/pacdora-lab/citrus-demo.svg");
      if (!response.ok) throw new Error("Demo artwork could not be loaded.");
      const blob = await response.blob();
      const file = new File([blob], "citrus-demo.svg", { type: "image/svg+xml" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      await uploadFiles(transfer.files);
    })().catch((cause) => {
      window.alert(cause instanceof Error ? cause.message : "Demo artwork could not be loaded.");
    });
  }, [uploadFiles]);

  const handleCanvasReady = useCallback((
    surfaceId: string,
    canvas: HTMLCanvasElement | null,
  ) => {
    registerCanvas(surfaceId, canvas);
    setArtworkCanvas(canvas);
    setArtworkRevision((current) => current + 1);
  }, [registerCanvas]);

  const handleDirty = useCallback((surfaceId: string) => {
    markDirty(surfaceId);
    setArtworkRevision((current) => current + 1);
  }, [markDirty]);

  useEffect(() => {
    onArtworkCanvasChange(artworkCanvas, artworkRevision);
  }, [artworkCanvas, artworkRevision, onArtworkCanvasChange]);

  // Dimensions regenerate the web. Preserve every layer's normalized place on
  // that web so changing width/height does not strand assets off-canvas.
  useEffect(() => {
    const next = { width: surface.editorWidth, height: surface.editorHeight };
    const previous = previousEditorSizeRef.current;
    if (next.width === previous.width && next.height === previous.height) return;
    previousEditorSizeRef.current = next;
    const ratioX = next.width / previous.width;
    const ratioY = next.height / previous.height;
    for (const element of activeDesign?.elements ?? []) {
      applyChange(
        element.id,
        element.type === "image"
          ? {
              x: element.x * ratioX,
              y: element.y * ratioY,
              width: element.width * ratioX,
              height: element.height * ratioY,
            }
          : {
              x: element.x * ratioX,
              y: element.y * ratioY,
              fontSize: element.fontSize * Math.min(ratioX, ratioY),
            },
        true,
      );
    }
    commitHistory();
    scheduleDirty(surface.id);
  }, [activeDesign?.elements, applyChange, commitHistory, scheduleDirty, surface.editorHeight, surface.editorWidth, surface.id]);

  const formatPhysical = (centimetres: number) => `${(centimetres * 10).toFixed(1)}mm`;

  return (
    <div
      data-testid="pouch-studio-editor"
      className="flex h-[660px] min-h-0 min-w-0 overflow-hidden rounded-xl border border-[var(--st-line)] bg-[var(--st-bg)] text-[var(--st-text)]"
    >
      <div className="flex shrink-0">
        <StudioToolRail active={tool} onSelect={setTool} />
      </div>
      <div className="flex min-h-0 shrink-0">
        <StudioPanel
          tool={tool}
          customizer={c}
          demoArtwork={{ label: "Add demo artwork", onAdd: addDemoArtwork }}
        />
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--st-stage)] text-[var(--st-stage-ink)]">
        <div className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 gap-1 overflow-x-auto rounded-xl bg-[var(--st-surface)]/95 p-1 shadow-lg backdrop-blur">
          {surface.sections?.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-pressed={c.activeSectionId === section.id}
              onClick={() => c.selectSection(section.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                c.activeSectionId === section.id
                  ? "bg-[var(--st-accent)] text-[var(--st-accent-ink)]"
                  : "text-[var(--st-dim)] hover:bg-[var(--st-raised)]"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        <div
          ref={workspaceViewportRef}
          aria-label="Movable pouch design workspace"
          className={`absolute inset-0 touch-none overflow-hidden overscroll-none ${
            panMode ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
          }`}
          onPointerDownCapture={startWorkspacePan}
          onPointerMove={moveWorkspace}
          onPointerUp={stopWorkspacePan}
          onPointerCancel={stopWorkspacePan}
          onWheel={handleWorkspaceWheel}
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            artworkDragDepthRef.current += 1;
            setArtworkDropActive(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            artworkDragDepthRef.current = Math.max(0, artworkDragDepthRef.current - 1);
            if (artworkDragDepthRef.current === 0) setArtworkDropActive(false);
          }}
          onDrop={handleArtworkDrop}
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
                      Production regions
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-inset ring-black/10">
                      Technical guides
                    </span>
                  </div>
                  <DesignEditor
                    surface={surface}
                    design={c.activeDesign}
                    images={c.images}
                    embroidery={c.embroidery.results}
                    selectedId={c.selectedId}
                    showGuides={c.showGuides}
                    onSelect={c.setSelectedId}
                    onChange={c.applyChange}
                    onCommit={c.commitHistory}
                    onCanvasReady={handleCanvasReady}
                    onDirty={handleDirty}
                    selectedSectionId={c.activeSectionId}
                    hoveredMeshName={c.hoveredMeshName}
                    onSectionSelect={c.selectSection}
                    onSectionHover={c.setHoveredMeshName}
                    showProductionChrome={false}
                    dieline={surface.dieline}
                    interactiveGuides={false}
                    onDeleteSelected={c.deleteSelected}
                    onDuplicateSelected={c.duplicateSelected}
                    onToggleSelectedLock={c.toggleSelectedLock}
                    onLayerUp={() => {
                      if (c.selectedId) c.reorderElement(c.selectedId, "up");
                    }}
                    onLayerDown={() => {
                      if (c.selectedId) c.reorderElement(c.selectedId, "down");
                    }}
                    onCropSelected={() => {
                      setTool("Editor");
                      c.beginCrop();
                    }}
                    onReplaceSelectedFile={(file) => {
                      void c.replaceSelectedImage(file);
                    }}
                    cropMode={c.cropMode}
                  />
                </div>

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

          {artworkDropActive ? (
            <div className="pointer-events-none absolute inset-5 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--st-accent)] bg-[var(--st-surface)]/92 text-center shadow-xl backdrop-blur-sm">
              <div>
                <ImagePlus className="mx-auto h-7 w-7 text-[var(--st-accent)]" />
                <p className="mt-3 text-sm font-semibold text-[var(--st-text)]">
                  Drop artwork onto {c.activeSection?.label ?? surface.label}
                </p>
                <p className="mt-1 text-xs text-[var(--st-dim)]">PNG, JPG, WebP, or SVG</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-[var(--st-surface)] p-1 shadow-[0_6px_24px_rgba(16,18,22,0.14)] ring-1 ring-[var(--st-line)]">
            <button
              type="button"
              aria-label="Move canvas"
              aria-pressed={panMode}
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
              onClick={() => c.setShowGuides(!c.showGuides)}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                c.showGuides
                  ? "bg-[var(--st-accent)] text-[var(--st-accent-ink)]"
                  : "text-[var(--st-text)] hover:bg-[var(--st-raised)]"
              }`}
            >
              <Ruler className="h-[18px] w-[18px]" />
            </button>
            <div className="mx-1 h-5 w-px bg-[var(--st-line)]" />
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
              onClick={fitWorkspace}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--st-text)] transition-colors hover:bg-[var(--st-raised)]"
            >
              <Maximize2 className="h-[17px] w-[17px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
