"use client";

import { useRef } from "react";
import {
  getPacdoraLabStandUpHangHole,
  type BoxLabSolution,
  type PouchArtworkPlacement,
  type PouchLabSolution,
} from "@/lib/pacdora-lab";

const roleFill = {
  body: "#eef6ff",
  wall: "#f7f8fa",
  lid: "#fff7e8",
  flap: "#f3f0ff",
  film: "#fff2ec",
  seal: "#eaf8f4",
} as const;

export function DielinePreview({
  solution,
  artworkPreviewUrl = null,
  artworkPlacement = "front",
  onArtworkDrag,
}: {
  solution: BoxLabSolution | PouchLabSolution;
  artworkPreviewUrl?: string | null;
  artworkPlacement?: PouchArtworkPlacement;
  onArtworkDrag?: (deltaX: number, deltaY: number) => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panelWidth: number;
    panelHeight: number;
  } | null>(null);
  const width = solution.kind === "box" ? solution.blank.width : solution.web.width;
  const height = solution.kind === "box" ? solution.blank.height : solution.web.height;
  const padding = Math.max(width, height) * 0.04;
  const fontSize = Math.max(width, height) * 0.025;
  const hangHole = solution.kind === "pouch"
    ? getPacdoraLabStandUpHangHole(solution.input)
    : null;
  const hangHoleCutYPositions = solution.kind === "pouch"
    && solution.style === "stand-up"
    && solution.input.hangHole
    ? [
        solution.input.endSealMm * 0.48,
        solution.web.height - solution.input.endSealMm * 0.48,
      ]
    : [];
  const editablePanels = solution.kind === "pouch"
    ? solution.panels.filter((panel) => (
        panel.id === "front-film" && artworkPlacement !== "back"
      ) || (
        panel.id === "back-film" && artworkPlacement !== "front"
      ))
    : [];
  const editable = Boolean(artworkPreviewUrl && onArtworkDrag && editablePanels.length);

  const svgPoint = (element: SVGSVGElement, clientX: number, clientY: number) => {
    const matrix = element.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  };

  return (
    <svg
      viewBox={`${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}`}
      role="img"
      aria-label={editable ? "Editable 2D pouch dieline; drag to position artwork" : `${solution.kind} generated dieline`}
      className={`h-full w-full ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ touchAction: editable ? "none" : undefined }}
      onPointerDown={editable ? (event) => {
        const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
        const panel = point
          ? editablePanels.find((candidate) => (
              point.x >= candidate.x
              && point.x <= candidate.x + candidate.width
              && point.y >= candidate.y
              && point.y <= candidate.y + candidate.height
            ))
          : null;
        if (!point || !panel) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          x: point.x,
          y: point.y,
          panelWidth: panel.width,
          panelHeight: panel.height,
        };
      } : undefined}
      onPointerMove={editable ? (event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
        if (!point) return;
        onArtworkDrag?.(
          (point.x - drag.x) / drag.panelWidth,
          (point.y - drag.y) / drag.panelHeight,
        );
        drag.x = point.x;
        drag.y = point.y;
      } : undefined}
      onPointerUp={editable ? (event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      } : undefined}
      onPointerCancel={editable ? () => {
        dragRef.current = null;
      } : undefined}
    >
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      {solution.kind === "pouch" && artworkPreviewUrl ? (
        <image
          href={artworkPreviewUrl}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="none"
        />
      ) : null}
      {solution.panels.map((panel) => (
        <g key={panel.id}>
          {panel.outline ? (
            <polygon
              points={panel.outline.map((point) => `${panel.x + point.x},${panel.y + point.y}`).join(" ")}
              fill={artworkPreviewUrl ? "transparent" : roleFill[panel.role]}
              stroke="#1f2937"
              strokeLinejoin="round"
              strokeWidth={Math.max(0.45, width * 0.0015)}
            />
          ) : (
            <rect
              x={panel.x}
              y={panel.y}
              width={panel.width}
              height={panel.height}
              fill={artworkPreviewUrl ? "transparent" : roleFill[panel.role]}
              stroke="#1f2937"
              strokeWidth={Math.max(0.45, width * 0.0015)}
            />
          )}
          {panel.width > fontSize * 3
          && panel.height > fontSize * 1.8
          && !(artworkPreviewUrl && panel.role === "film") ? (
            <text
              x={panel.x + panel.width / 2}
              y={panel.y + panel.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#64748b"
              fontSize={Math.min(
                fontSize,
                panel.width / Math.max(4, panel.label.length * 0.58),
                panel.height * 0.22,
              )}
              fontWeight={600}
            >
              {panel.label}
            </text>
          ) : null}
        </g>
      ))}
      {solution.lines.map((line) => {
        const color = line.kind === "crease" ? "#ef4444" : line.kind === "seal" ? "#0f9f7f" : "#111827";
        return (
          <line
            key={line.id}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={color}
            strokeWidth={Math.max(0.7, width * 0.0022)}
            strokeDasharray={line.kind === "crease" ? `${width * 0.012} ${width * 0.008}` : undefined}
          />
        );
      })}
      {solution.kind === "pouch" && hangHole
        ? hangHoleCutYPositions.map((cy) => (
          <circle
            key={`hang-hole-${cy}`}
            cx={solution.input.endSealMm + solution.input.width * 0.5}
            cy={cy}
            r={hangHole.radiusMm}
            fill="#f8fafc"
            stroke="#111827"
            strokeWidth={Math.max(0.7, width * 0.0022)}
          />
        ))
        : null}
      {(editable ? editablePanels : []).map((panel) => (
        <g key={`editable-${panel.id}`} pointerEvents="none">
          <rect
            x={panel.x}
            y={panel.y}
            width={panel.width}
            height={panel.height}
            fill="none"
            stroke="#2563eb"
            strokeWidth={Math.max(1, width * 0.003)}
            strokeDasharray={`${width * 0.018} ${width * 0.009}`}
          />
          <text
            x={panel.x + panel.width * 0.5}
            y={panel.y + Math.max(fontSize * 1.25, panel.height * 0.05)}
            textAnchor="middle"
            fill="#1d4ed8"
            fontSize={fontSize * 0.72}
            fontWeight={700}
          >
            DRAG ARTWORK
          </text>
        </g>
      ))}
    </svg>
  );
}
