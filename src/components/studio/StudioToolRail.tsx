"use client";

import type { ComponentType } from "react";
import { ImagePlus, PaintBucket, SlidersHorizontal, Type } from "lucide-react";

export type StudioTool = "Text" | "Uploads" | "Background" | "Editor";

type ToolDef = {
  id: StudioTool;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

const TOOLS: ToolDef[] = [
  { id: "Text", label: "Text", Icon: Type },
  { id: "Uploads", label: "Uploads", Icon: ImagePlus },
  { id: "Background", label: "Colour", Icon: PaintBucket },
  { id: "Editor", label: "Adjust", Icon: SlidersHorizontal },
];

type StudioToolRailProps = {
  active: StudioTool;
  onSelect: (tool: StudioTool) => void;
};

export function StudioToolRail({ active, onSelect }: StudioToolRailProps) {
  return (
    <nav
      aria-label="Design tools"
      className="flex shrink-0 border-t border-[var(--st-line)] bg-[var(--st-surface)] lg:w-[72px] lg:flex-col lg:gap-1 lg:border-r lg:border-t-0 lg:py-3"
    >
      {TOOLS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={isActive ? "true" : undefined}
            className="group relative flex h-[62px] flex-1 flex-col items-center justify-center gap-1.5 px-1 outline-none lg:flex-none"
          >
            {/* Active tool is marked by an accent edge rather than a filled
                block, so the rail stays quiet next to the artwork. The edge
                follows the rail: top edge when horizontal, left when vertical. */}
            <span
              aria-hidden="true"
              className={`absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 rounded-b-full transition-opacity lg:left-0 lg:top-1/2 lg:h-8 lg:w-[3px] lg:-translate-x-0 lg:-translate-y-1/2 lg:rounded-l-none lg:rounded-r-full ${
                isActive ? "bg-[var(--st-accent)] opacity-100" : "opacity-0"
              }`}
            />
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? "bg-[var(--st-raised)] text-[var(--st-text)]"
                  : "text-[var(--st-dim)] group-hover:bg-[var(--st-raised)] group-hover:text-[var(--st-text)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--st-accent)]"
              }`}
            >
              <Icon className="h-[19px] w-[19px]" />
            </span>
            <span
              className={`max-w-full truncate text-[11px] leading-none transition-colors ${
                isActive ? "text-[var(--st-text)]" : "text-[var(--st-faint)]"
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
