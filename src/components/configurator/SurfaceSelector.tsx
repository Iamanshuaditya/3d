"use client";

import type { EditableSurface } from "@/types/configurator";

type SurfaceSelectorProps = {
  surfaces: EditableSurface[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
};

/**
 * Surface switcher (§22). Hidden for single-surface products like the bottle,
 * but ready for a box exposing FRONT/BACK/LEFT/RIGHT/TOP/BOTTOM.
 */
export function SurfaceSelector({
  surfaces,
  activeId,
  onSelect,
  ariaLabel = "Printable surfaces",
}: SurfaceSelectorProps) {
  if (surfaces.length <= 1) return null;

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {surfaces.map((surface) => {
        const active = surface.id === activeId;
        return (
          <button
            key={surface.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(surface.id)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              active
                ? "bg-[var(--st-accent)] text-[var(--st-accent-ink)]"
                : "text-[var(--st-dim)] hover:bg-[var(--st-raised)] hover:text-[var(--st-text)]"
            }`}
          >
            {surface.label}
          </button>
        );
      })}
    </div>
  );
}
