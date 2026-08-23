"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Text as KonvaText,
  Rect,
  Line,
  Group,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import type { DesignElement, EditableSurface, SurfaceDesign } from "@/types/configurator";
import type { EmbroideryResult } from "@/types/embroidery";

type DesignEditorProps = {
  surface: EditableSurface;
  design: SurfaceDesign;
  /** Decoded artwork, keyed by source URL. Owned by the customizer. */
  images: Record<string, HTMLImageElement>;
  /**
   * Stitched renderings, keyed by element id. When present for an element the
   * editor draws the stitching instead of the flat asset, so the 2D canvas and
   * the 3D texture are the same pixels — there is no separate preview path.
   */
  embroidery?: Record<string, EmbroideryResult>;
  selectedId: string | null;
  showGuides: boolean;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<DesignElement>, transient: boolean) => void;
  onCommit: () => void;
  /**
   * Publishes the artwork layer's backing canvas for use as a CanvasTexture.
   * Takes the surface id so callers can pass a single stable callback — an
   * inline arrow here would change identity every render and thrash the
   * registration effect below into an infinite loop.
   */
  onCanvasReady?: (surfaceId: string, canvas: HTMLCanvasElement | null) => void;
  /** Fired whenever pixels change so the 3D preview can re-upload. */
  onDirty?: (surfaceId: string) => void;
  /** Selected/hovered production panel, shared bidirectionally with the GLB. */
  selectedSectionId?: string | null;
  hoveredMeshName?: string | null;
  onSectionSelect?: (sectionId: string) => void;
  onSectionHover?: (meshName: string | null) => void;
  /** StudioShell already supplies the surrounding rulers/chips. */
  showProductionChrome?: boolean;
  /** Optional dieline overlay (cut outlines + crease lines), in editor pixels. */
  dieline?: {
    cuts: { points: number[]; closed: boolean }[];
    creases: { points: number[]; closed: boolean }[];
    safety?: { points: number[]; closed: boolean }[];
  };
  /** Renders the same artwork without selection, dragging, guides, or texture ownership. */
  readOnly?: boolean;
};

export function DesignEditor({
  surface,
  design,
  images,
  embroidery,
  selectedId,
  showGuides,
  onSelect,
  onChange,
  onCommit,
  onCanvasReady,
  onDirty,
  selectedSectionId = null,
  hoveredMeshName = null,
  onSectionSelect,
  onSectionHover,
  showProductionChrome = true,
  dieline,
  readOnly = false,
}: DesignEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const artLayerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
  const textureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoveredMeshRef = useRef<string | null>(null);
  const [scale, setScale] = useState(0.3);

  const { editorWidth: W, editorHeight: H } = surface;
  const sections = useMemo(
    () =>
      (surface.sections ?? []).map((section) => ({
        ...section,
        x: (section.xCm / surface.physicalWidthCm) * W,
        y: (section.yCm / surface.physicalHeightCm) * H,
        width: (section.widthCm / surface.physicalWidthCm) * W,
        height: (section.heightCm / surface.physicalHeightCm) * H,
      })),
    [H, W, surface.physicalHeightCm, surface.physicalWidthCm, surface.sections],
  );

  // Fit the fixed-resolution stage to whatever width the column gives us.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width;
      if (available > 0) setScale(available / W);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [W]);

  // Vistaprint does not upload the transparent Konva/document canvas directly.
  // Vortex first composites it over the substrate colour (white for this film),
  // then sends that clean canvas to Three.js. Besides matching production, this
  // is what prevents untouched pixels from appearing black on the pouch.
  useEffect(() => {
    if (!onCanvasReady || readOnly) return;
    const output = document.createElement("canvas");
    output.width = W;
    output.height = H;
    textureCanvasRef.current = output;
    onCanvasReady(surface.id, output);
    return () => onCanvasReady(surface.id, null);
  }, [H, W, onCanvasReady, readOnly, surface.id]);

  // Copy after Konva has painted the artwork layer. The UI layer is deliberately
  // excluded, so panel highlighting, rulers and production guides never print.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const layer = artLayerRef.current;
      const output = textureCanvasRef.current;
      if (!layer || !output) return;
      layer.draw();
      const konvaCanvas = layer.getCanvas() as unknown as {
        _canvas?: HTMLCanvasElement;
        getNativeCanvasElement?: () => HTMLCanvasElement;
      };
      const native = konvaCanvas.getNativeCanvasElement?.() ?? konvaCanvas._canvas ?? null;
      const context = output.getContext("2d");
      if (!native || !context) return;
      context.clearRect(0, 0, W, H);
      const outputBackground = design.background ?? surface.defaultBackground;
      if (outputBackground) {
        context.fillStyle = outputBackground;
        context.fillRect(0, 0, W, H);
      }

      const hasPrintTransforms = sections.some(
        (section) => (section.textureRotation ?? 0) !== 0,
      );
      if (!hasPrintTransforms) {
        context.drawImage(native, 0, 0, W, H);
      } else {
        // Keep customer artwork upright in the editor. Only this print canvas
        // receives the panel quarter-turn required by the horizontal pouch web.
        for (const section of sections) {
          const rotation = section.textureRotation ?? 0;
          const sx = Math.round(section.x);
          const sy = Math.round(section.y);
          const sw = Math.max(1, Math.round(section.width));
          const sh = Math.max(1, Math.round(section.height));
          context.save();
          context.beginPath();
          context.rect(sx, sy, sw, sh);
          context.clip();
          if (rotation === 0) {
            context.drawImage(native, sx, sy, sw, sh, sx, sy, sw, sh);
          } else {
            const panel = document.createElement("canvas");
            panel.width = sw;
            panel.height = sh;
            panel.getContext("2d")?.drawImage(native, sx, sy, sw, sh, 0, 0, sw, sh);
            context.translate(sx + sw / 2, sy + sh / 2);
            context.rotate((rotation * Math.PI) / 180);
            context.drawImage(panel, -sw / 2, -sh / 2);
          }
          context.restore();
        }
      }
      onDirty?.(surface.id);
    });
    return () => cancelAnimationFrame(frame);
  }, [H, W, design, images, embroidery, onDirty, sections, surface.defaultBackground, surface.id]);

  // Bind the transformer to the current selection.
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const node = selectedId ? nodeRefs.current[selectedId] : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, design.elements]);

  const handleDragMove = useCallback(
    (el: DesignElement, e: Konva.KonvaEventObject<DragEvent>) => {
      onChange(el.id, { x: e.target.x(), y: e.target.y() }, true);
      onDirty?.(surface.id);
    },
    [onChange, onDirty, surface.id],
  );

  const handleTransform = useCallback(
    (el: DesignElement, e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      onChange(
        el.id,
        {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
        },
        true,
      );
      onDirty?.(surface.id);
    },
    [onChange, onDirty, surface.id],
  );

  const bleed = surface.guides?.bleed ?? 0;
  const safe = surface.guides?.safeArea ?? 0;

  const displayHeight = useMemo(() => H * scale, [H, scale]);

  const sectionAtPointer = useCallback(() => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return null;
    return (
      sections.find(
        (section) =>
          pointer.x >= section.x &&
          pointer.x <= section.x + section.width &&
          pointer.y >= section.y &&
          pointer.y <= section.y + section.height,
      ) ?? null
    );
  }, [sections]);

  const publishSectionHover = useCallback(
    (meshName: string | null) => {
      if (hoveredMeshRef.current === meshName) return;
      hoveredMeshRef.current = meshName;
      onSectionHover?.(meshName);
    },
    [onSectionHover],
  );

  const isPanelWeb = sections.length > 0;
  const withProductionChrome = isPanelWeb && showProductionChrome;
  const widthLabel = `${(surface.physicalWidthCm / 2.54).toFixed(2)}in`;
  const heightLabel = `${(surface.physicalHeightCm / 2.54).toFixed(2)}in`;

  const stage = (
    <div ref={wrapperRef} className="w-full">
      <div
        style={{ height: displayHeight }}
        className={`relative w-full overflow-hidden border ${
          isPanelWeb
            ? "border-[#87bde0] bg-[#ececec]"
            : "rounded-lg border-black/12 bg-[repeating-conic-gradient(#e4e4e6_0%_25%,#ffffff_0%_50%)] bg-[length:20px_20px]"
        }`}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: W,
            height: H,
          }}
        >
          <Stage
            ref={stageRef}
            width={W}
            height={H}
            onMouseMove={() => publishSectionHover(sectionAtPointer()?.meshName ?? null)}
            onMouseLeave={() => publishSectionHover(null)}
            onMouseDown={(e) => {
              if (readOnly) return;
              if (e.target !== e.target.getStage()) return;
              onSelect(null);
              const section = sectionAtPointer();
              if (section) onSectionSelect?.(section.id);
            }}
            onTouchStart={(e) => {
              if (readOnly) return;
              if (e.target !== e.target.getStage()) return;
              onSelect(null);
              const section = sectionAtPointer();
              if (section) onSectionSelect?.(section.id);
            }}
          >
            {/* ---- Artwork layer: composited into the 3D texture above ---- */}
            <Layer ref={artLayerRef}>
              {design.background && (
                <Rect x={0} y={0} width={W} height={H} fill={design.background} />
              )}

              {design.elements.map((el) => {
                const common = {
                  id: el.id,
                  x: el.x,
                  y: el.y,
                  rotation: el.rotation,
                  scaleX: el.scaleX,
                  scaleY: el.scaleY,
                  opacity: el.opacity,
                  draggable: !readOnly,
                  ref: (node: Konva.Node | null) => {
                    if (node) nodeRefs.current[el.id] = node;
                    else delete nodeRefs.current[el.id];
                  },
                  onMouseDown: readOnly ? undefined : () => onSelect(el.id),
                  onTouchStart: readOnly ? undefined : () => onSelect(el.id),
                  onDragMove: readOnly
                    ? undefined
                    : (e: Konva.KonvaEventObject<DragEvent>) => handleDragMove(el, e),
                  onDragEnd: readOnly ? undefined : onCommit,
                  onTransform: readOnly
                    ? undefined
                    : (e: Konva.KonvaEventObject<Event>) => handleTransform(el, e),
                  onTransformEnd: readOnly ? undefined : onCommit,
                };

                if (el.type === "image") {
                  // Stitching wins when it exists; while it is still being
                  // generated the original asset keeps the canvas populated so
                  // the artwork never blinks out from under the customer.
                  const stitched = embroidery?.[el.id];
                  const source = stitched?.colour ?? (el.src ? images[el.src] : undefined);
                  if (!source) return null;
                  return (
                    <KonvaImage
                      key={el.id}
                      {...common}
                      image={source}
                      width={el.width}
                      height={el.height}
                    />
                  );
                }

                return (
                  <KonvaText
                    key={el.id}
                    {...common}
                    text={el.text}
                    fontFamily={el.fontFamily}
                    fontSize={el.fontSize}
                    fill={el.fill}
                  />
                );
              })}
            </Layer>

            {/* ---- UI layer: never part of the exported artwork ---- */}
            <Layer listening>
              {sections.map((section) => {
                const selected = section.id === selectedSectionId;
                const hovered = section.meshName === hoveredMeshName;
                if (!selected && !hovered) return null;
                const color = selected ? "#3478c5" : "#b7d63d";
                const labelWidth = Math.max(122, section.label.length * 27 + 30);
                return (
                  <Group key={`section-${section.id}`} listening={false}>
                    <Rect
                      x={section.x}
                      y={section.y}
                      width={section.width}
                      height={section.height}
                      stroke={color}
                      strokeWidth={8}
                    />
                    <Rect
                      x={section.x}
                      y={section.y}
                      width={labelWidth}
                      height={48}
                      fill={color}
                    />
                    <KonvaText
                      x={section.x + 12}
                      y={section.y + 7}
                      text={section.label}
                      fontFamily="Arial, sans-serif"
                      fontSize={32}
                      fill={selected ? "#ffffff" : "#172100"}
                    />
                  </Group>
                );
              })}

              {/* Dieline: blue cut outlines, red dashed creases. */}
              {dieline?.cuts.map((cut, i) => (
                <Line key={`cut-${i}`} points={cut.points} closed={cut.closed} stroke="#4a90d9" strokeWidth={3} lineJoin="round" listening={false} />
              ))}
              {dieline?.creases.map((crease, i) => (
                <Line key={`crease-${i}`} points={crease.points} closed={crease.closed} stroke="#e05252" strokeWidth={2.5} dash={[14, 10]} listening={false} />
              ))}
              {dieline?.safety?.map((safeLine, i) => (
                <Line key={`safety-${i}`} points={safeLine.points} closed={safeLine.closed} stroke="#55ad80" strokeWidth={2.5} dash={[14, 10]} lineJoin="round" listening={false} />
              ))}
              {showGuides && bleed > 0 && (
                <Rect x={bleed} y={bleed} width={W - bleed * 2} height={H - bleed * 2} stroke="#e05252" strokeWidth={3} dash={[14, 10]} listening={false} />
              )}
              {showGuides && safe > 0 && (
                <Rect x={safe} y={safe} width={W - safe * 2} height={H - safe * 2} stroke="#3a9ad9" strokeWidth={3} dash={[14, 10]} listening={false} />
              )}
              {!readOnly && (
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  keepRatio
                  anchorSize={18}
                  borderStroke="#3a9ad9"
                  anchorStroke="#3a9ad9"
                  boundBoxFunc={(oldBox, newBox) =>
                    newBox.width < 20 || newBox.height < 20 ? oldBox : newBox
                  }
                />
              )}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );

  return (
    <div className={withProductionChrome ? "relative w-full bg-[#f4f4f4] px-11 pb-11 pt-12" : "w-full"}>
      {withProductionChrome && (
        <div className="absolute right-3 top-2 flex items-center gap-2 text-[12px] text-[#151515]">
          <span className="rounded-full border-2 border-[#6aba91] bg-[#f2f2f2] px-2 py-0.5 shadow-[0_0_0_2px_#b6d8c5_inset]">Safety Area</span>
          <span className="rounded-full border-2 border-[#70b6df] bg-[#f2f2f2] px-2 py-0.5 shadow-[0_0_0_2px_#c0dbea_inset]">Bleed</span>
        </div>
      )}
      {withProductionChrome && (
        <div
          className="absolute left-1 top-12 flex w-9 items-center justify-center text-[12px] text-[#666]"
          style={{ height: displayHeight }}
        >
          <span className="absolute left-5 top-0 h-px w-4 bg-[#222]" />
          <span className="absolute left-5 bottom-0 h-px w-4 bg-[#222]" />
          <span className="absolute left-[27px] top-0 h-full w-px bg-[#222]" />
          <span className="-rotate-90 whitespace-nowrap bg-[#f4f4f4] px-1">{heightLabel}</span>
        </div>
      )}
      {stage}
      {withProductionChrome && (
        <div className="absolute bottom-2 left-11 right-11 h-7 text-center text-[12px] text-[#666]">
          <span className="absolute left-0 top-1 h-4 w-px bg-[#222]" />
          <span className="absolute right-0 top-1 h-4 w-px bg-[#222]" />
          <span className="absolute left-0 right-0 top-[11px] h-px bg-[#222]" />
          <span className="relative top-0 bg-[#f4f4f4] px-2">{widthLabel}</span>
        </div>
      )}
    </div>
  );
}
