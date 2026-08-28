"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { Hand, Maximize2, Minus, Plus } from "lucide-react";
import {
  resolvePouchArtworkFrame,
  type DielinePanel,
  type PouchArtwork,
  type PouchLabSolution,
} from "@/lib/pacdora-lab";

type ArtworkTransformPatch = Partial<Pick<
  PouchArtwork,
  "scale" | "offsetX" | "offsetY" | "rotationDeg"
>>;

type PouchArtworkEditorProps = {
  solution: PouchLabSolution;
  artwork: PouchArtwork | null;
  onArtworkChange: (patch: ArtworkTransformPatch) => void;
};

type ViewportSize = { width: number; height: number };
type PanPoint = { x: number; y: number };

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;

function targetPanels(solution: PouchLabSolution, artwork: PouchArtwork | null): DielinePanel[] {
  if (!artwork) return [];
  return solution.panels.filter((panel) => (
    panel.id === "front-film" && artwork.placement !== "back"
  ) || (
    panel.id === "back-film" && artwork.placement !== "front"
  ));
}

function panelName(panel: DielinePanel | undefined): string {
  if (!panel) return "panel";
  return panel.id === "front-film" ? "Front" : "Back";
}

export function PouchArtworkEditor({
  solution,
  artwork,
  onArtworkChange,
}: PouchArtworkEditorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const imageRefs = useRef<Record<string, Konva.Image>>({});
  const [viewport, setViewport] = useState<ViewportSize>({ width: 620, height: 560 });
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState<PanPoint>({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [activePanelId, setActivePanelId] = useState<string>("front-film");
  const [decodedArtwork, setDecodedArtwork] = useState<{
    sourceUrl: string;
    image: HTMLImageElement;
  } | null>(null);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const artworkSourceUrl = artwork?.sourceUrl ?? null;
  useEffect(() => {
    if (!artworkSourceUrl) return;
    let cancelled = false;
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) setDecodedArtwork({ sourceUrl: artworkSourceUrl, image });
    };
    image.src = artworkSourceUrl;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [artworkSourceUrl]);
  const decodedImage = artworkSourceUrl && decodedArtwork?.sourceUrl === artworkSourceUrl
    ? decodedArtwork.image
    : null;

  const printablePanels = useMemo(
    () => targetPanels(solution, artwork),
    [artwork, solution],
  );
  const activePanel = printablePanels.find((panel) => panel.id === activePanelId)
    ?? printablePanels[0];
  const sourceSize = useMemo(
    () => decodedImage
      ? { width: decodedImage.naturalWidth, height: decodedImage.naturalHeight }
      : null,
    [decodedImage],
  );
  const frames = useMemo(() => {
    if (!artwork || !sourceSize) return new Map<string, ReturnType<typeof resolvePouchArtworkFrame>>();
    return new Map(printablePanels.map((panel) => [
      panel.id,
      resolvePouchArtworkFrame(sourceSize, panel, artwork),
    ]));
  }, [artwork, printablePanels, sourceSize]);

  const webWidth = solution.web.width;
  const webHeight = solution.web.height;
  const baseScale = Math.max(0.001, Math.min(
    (viewport.width - 52) / webWidth,
    (viewport.height - 92) / webHeight,
  ));
  const viewScale = baseScale * zoom / 100;
  const originX = (viewport.width - webWidth * viewScale) * 0.5 + pan.x;
  const originY = (viewport.height - webHeight * viewScale) * 0.5 + pan.y;
  const screenSpace = (pixels: number) => pixels / viewScale;

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = activePanel ? imageRefs.current[activePanel.id] : null;
    transformer.nodes(node && artwork && !panMode ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [activePanel, artwork, decodedImage, frames, panMode, viewScale]);

  const resolveRequested = (
    panel: DielinePanel,
    requestedX: number,
    requestedY: number,
    updates: ArtworkTransformPatch = {},
  ) => {
    if (!artwork || !sourceSize) return null;
    const candidate = {
      ...artwork,
      ...updates,
      offsetX: (requestedX - (panel.x + panel.width * 0.5)) / panel.width,
      offsetY: (requestedY - (panel.y + panel.height * 0.5)) / panel.height,
    };
    return resolvePouchArtworkFrame(sourceSize, panel, candidate);
  };

  const finishDrag = (panel: DielinePanel, node: Konva.Image) => {
    const resolved = resolveRequested(panel, node.x(), node.y());
    if (!resolved) return;
    node.position({ x: resolved.centreX, y: resolved.centreY });
    onArtworkChange({ offsetX: resolved.offsetX, offsetY: resolved.offsetY });
  };

  const finishTransform = (panel: DielinePanel, node: Konva.Image) => {
    if (!artwork) return;
    const nextScale = Math.min(2.5, Math.max(0.5, artwork.scale * Math.abs(node.scaleX())));
    const nextRotation = node.rotation();
    const resolved = resolveRequested(panel, node.x(), node.y(), {
      scale: nextScale,
      rotationDeg: nextRotation,
    });
    node.scale({ x: 1, y: 1 });
    if (!resolved) return;
    node.position({ x: resolved.centreX, y: resolved.centreY });
    onArtworkChange({
      scale: nextScale,
      rotationDeg: nextRotation,
      offsetX: resolved.offsetX,
      offsetY: resolved.offsetY,
    });
  };

  const resetView = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setPanMode(false);
  };

  return (
    <div
      ref={viewportRef}
      data-testid="pouch-artwork-editor"
      className={`relative h-full min-h-[520px] overflow-hidden rounded-xl border border-[#d7dce2] bg-[#ececec] ${panMode ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <Stage width={viewport.width} height={viewport.height}>
        <Layer>
          <Group
            x={originX}
            y={originY}
            scaleX={viewScale}
            scaleY={viewScale}
            draggable={panMode}
            onDragEnd={(event) => {
              // Konva drag events bubble. Ignore artwork drags here so moving a
              // print does not accidentally pan the entire dieline workspace.
              if (event.target !== event.currentTarget) return;
              setPan({
                x: event.target.x() - (viewport.width - webWidth * viewScale) * 0.5,
                y: event.target.y() - (viewport.height - webHeight * viewScale) * 0.5,
              });
            }}
          >
            <Rect
              width={webWidth}
              height={webHeight}
              fill="#ffffff"
              stroke="#6aaed8"
              strokeWidth={screenSpace(1)}
              shadowColor="#0f172a"
              shadowBlur={screenSpace(14)}
              shadowOpacity={0.12}
            />

            {solution.panels.map((panel) => (
              <Rect
                key={`panel-fill-${panel.id}`}
                x={panel.x}
                y={panel.y}
                width={panel.width}
                height={panel.height}
                fill={panel.role === "seal" ? "#edf8f5" : "#ffffff"}
                onClick={() => {
                  if (printablePanels.some((candidate) => candidate.id === panel.id)) {
                    setActivePanelId(panel.id);
                  }
                }}
                onTap={() => {
                  if (printablePanels.some((candidate) => candidate.id === panel.id)) {
                    setActivePanelId(panel.id);
                  }
                }}
              />
            ))}

            {decodedImage && artwork ? printablePanels.map((panel) => {
              const frame = frames.get(panel.id);
              if (!frame) return null;
              return (
                <Group
                  key={`artwork-clip-${panel.id}`}
                  clipX={panel.x}
                  clipY={panel.y}
                  clipWidth={panel.width}
                  clipHeight={panel.height}
                >
                  <KonvaImage
                    ref={(node) => {
                      if (node) imageRefs.current[panel.id] = node;
                      else delete imageRefs.current[panel.id];
                    }}
                    image={decodedImage}
                    x={frame.centreX}
                    y={frame.centreY}
                    width={frame.width}
                    height={frame.height}
                    offsetX={frame.width * 0.5}
                    offsetY={frame.height * 0.5}
                    rotation={frame.rotationDeg}
                    draggable={!panMode && panel.id === activePanel?.id}
                    dragBoundFunc={(position) => {
                      const resolved = resolveRequested(panel, position.x, position.y);
                      return resolved
                        ? { x: resolved.centreX, y: resolved.centreY }
                        : position;
                    }}
                    onClick={() => setActivePanelId(panel.id)}
                    onTap={() => setActivePanelId(panel.id)}
                    onDragEnd={(event) => finishDrag(panel, event.target as Konva.Image)}
                    onTransformEnd={(event) => finishTransform(panel, event.target as Konva.Image)}
                  />
                </Group>
              );
            }) : null}

            {solution.panels.map((panel) => (
              <Group key={`panel-guide-${panel.id}`} listening={false}>
                <Rect
                  x={panel.x}
                  y={panel.y}
                  width={panel.width}
                  height={panel.height}
                  fill="transparent"
                  stroke={panel.id === activePanel?.id ? "#3478c5" : "#8bbfdc"}
                  strokeWidth={screenSpace(panel.id === activePanel?.id ? 2 : 1)}
                />
                {!decodedImage || panel.role === "seal" ? (
                  <Text
                    x={panel.x}
                    y={panel.y + panel.height * 0.5 - screenSpace(6)}
                    width={panel.width}
                    text={panel.label.toUpperCase()}
                    align="center"
                    fill={panel.role === "seal" ? "#0f766e" : "#64748b"}
                    fontFamily="Arial, sans-serif"
                    fontStyle="bold"
                    fontSize={screenSpace(10)}
                  />
                ) : null}
              </Group>
            ))}

            {solution.lines.map((line) => (
              <Line
                key={line.id}
                points={[line.x1, line.y1, line.x2, line.y2]}
                stroke={line.kind === "crease" ? "#e25555" : line.kind === "seal" ? "#4cae8b" : "#111827"}
                strokeWidth={screenSpace(line.kind === "crease" ? 1 : 1.2)}
                dash={line.kind === "crease" ? [screenSpace(5), screenSpace(4)] : undefined}
                listening={false}
              />
            ))}

            <Transformer
              ref={transformerRef}
              keepRatio
              flipEnabled={false}
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
              ]}
              anchorSize={screenSpace(10)}
              anchorCornerRadius={screenSpace(5)}
              anchorFill="#ffffff"
              anchorStroke="#2563eb"
              anchorStrokeWidth={screenSpace(1.25)}
              borderStroke="#2563eb"
              borderStrokeWidth={screenSpace(1.25)}
              rotateAnchorOffset={screenSpace(25)}
              boundBoxFunc={(oldBox, nextBox) => {
                const minimum = screenSpace(24);
                return nextBox.width < minimum || nextBox.height < minimum ? oldBox : nextBox;
              }}
            />
          </Group>
        </Layer>
      </Stage>

      {printablePanels.length ? (
        <div className="absolute left-3 top-3 flex rounded-lg bg-white p-1 shadow-md ring-1 ring-black/10">
          {printablePanels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              aria-pressed={panel.id === activePanel?.id}
              onClick={() => setActivePanelId(panel.id)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${panel.id === activePanel?.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {panelName(panel)}
            </button>
          ))}
        </div>
      ) : null}

      {!artwork ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-[220px] rounded-xl bg-white/90 px-4 py-3 text-center text-xs font-medium leading-5 text-slate-600 shadow-sm ring-1 ring-black/5">
            Upload artwork to place it on a selectable print panel.
          </p>
        </div>
      ) : null}

      {artwork && activePanel ? (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/85 px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm">
          Artwork clipped to {panelName(activePanel)} · drag to move · corner handles scale
        </div>
      ) : null}

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black/10">
        <button
          type="button"
          aria-label="Pan artwork workspace"
          aria-pressed={panMode}
          onClick={() => setPanMode((current) => !current)}
          className={`flex size-8 items-center justify-center rounded-lg transition ${panMode ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <Hand className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Fit dieline to editor"
          onClick={resetView}
          className="flex size-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
        >
          <Maximize2 className="size-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - 10))}
          className="flex size-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-11 text-center font-mono text-[11px] font-semibold text-slate-700">{zoom}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + 10))}
          className="flex size-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
