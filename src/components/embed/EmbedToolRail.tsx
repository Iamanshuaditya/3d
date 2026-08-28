"use client";

import type { ComponentType } from "react";
import { ImagePlus, PaintBucket, SlidersHorizontal, Type } from "lucide-react";
import type { StudioTool } from "@/components/studio/StudioToolRail";

const TOOL_DEFS: Record<
  StudioTool,
  { label: string; Icon: ComponentType<{ className?: string }> }
> = {
  Text: { label: "Text", Icon: Type },
  Uploads: { label: "Uploads", Icon: ImagePlus },
  Background: { label: "Colour", Icon: PaintBucket },
  Editor: { label: "Adjust", Icon: SlidersHorizontal },
};

type EmbedToolRailProps = {
  /** Only the tools this client has enabled; order is the client's order. */
  tools: StudioTool[];
  active: StudioTool;
  onSelect: (tool: StudioTool) => void;
};

/**
 * The embedded tool rail renders exactly the enabled tools (#27).
 *
 * A disabled tool is absent rather than greyed out: a customer on a
 * manufacturer's site should never see a control that hints at a capability
 * their supplier has not bought.
 */
export function EmbedToolRail({ tools, active, onSelect }: EmbedToolRailProps) {
  if (tools.length <= 1) return null;
  return (
    <nav
      aria-label="Design tools"
      className="flex shrink-0 border-b border-[var(--st-line)] bg-[var(--st-surface)] lg:w-[72px] lg:flex-col lg:gap-1 lg:border-b-0 lg:border-r lg:py-3"
    >
      {tools.map((id) => {
        const { label, Icon } = TOOL_DEFS[id];
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={isActive ? "true" : undefined}
            className="group relative flex h-[62px] flex-1 flex-col items-center justify-center gap-1.5 px-1 outline-none lg:flex-none"
          >
            <span
              aria-hidden="true"
              className={`absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 rounded-b-full transition-opacity lg:left-0 lg:top-1/2 lg:h-8 lg:w-[3px] lg:-translate-y-1/2 lg:translate-x-0 lg:rounded-r-full ${
                isActive ? "bg-[var(--st-accent)] opacity-100" : "opacity-0"
              }`}
            />
            <Icon
              className={`h-[18px] w-[18px] ${isActive ? "text-[var(--st-text)]" : "text-[var(--st-dim)]"}`}
            />
            <span
              className={`text-[11px] font-medium ${isActive ? "text-[var(--st-text)]" : "text-[var(--st-dim)]"}`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
