"use client";

import type { BoxLabSolution, PouchLabSolution } from "@/lib/pacdora-lab";

const roleFill = {
  body: "#eef6ff",
  wall: "#f7f8fa",
  lid: "#fff7e8",
  flap: "#f3f0ff",
  film: "#fff2ec",
  seal: "#eaf8f4",
} as const;

export function DielinePreview({ solution }: { solution: BoxLabSolution | PouchLabSolution }) {
  const width = solution.kind === "box" ? solution.blank.width : solution.web.width;
  const height = solution.kind === "box" ? solution.blank.height : solution.web.height;
  const padding = Math.max(width, height) * 0.04;
  const fontSize = Math.max(width, height) * 0.025;

  return (
    <svg
      viewBox={`${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}`}
      role="img"
      aria-label={`${solution.kind} generated dieline`}
      className="h-full w-full"
    >
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      {solution.panels.map((panel) => (
        <g key={panel.id}>
          <rect
            x={panel.x}
            y={panel.y}
            width={panel.width}
            height={panel.height}
            fill={roleFill[panel.role]}
            stroke="#1f2937"
            strokeWidth={Math.max(0.45, width * 0.0015)}
          />
          {panel.width > fontSize * 3 && panel.height > fontSize * 1.8 ? (
            <text
              x={panel.x + panel.width / 2}
              y={panel.y + panel.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#64748b"
              fontSize={fontSize}
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
    </svg>
  );
}
