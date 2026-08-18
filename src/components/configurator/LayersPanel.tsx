"use client";

import type { DesignElement } from "@/types/configurator";

type LayersPanelProps = {
  elements: DesignElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onRemove: (id: string) => void;
};

function labelFor(el: DesignElement, index: number) {
  if (el.type === "text") return el.text.trim() || `Text ${index + 1}`;
  return `Image ${index + 1}`;
}

export function LayersPanel({
  elements,
  selectedId,
  onSelect,
  onReorder,
  onRemove,
}: LayersPanelProps) {
  if (!elements.length) {
    return (
      <p className="text-[13px] leading-[1.5] text-[var(--st-faint)]">
        Nothing on this surface yet. Add text or upload artwork to begin.
      </p>
    );
  }

  // Topmost element renders last, so present the list reversed.
  const ordered = [...elements].reverse();

  return (
    <ul className="flex flex-col gap-1">
      {ordered.map((el) => {
        const realIndex = elements.findIndex((e) => e.id === el.id);
        const isSelected = el.id === selectedId;
        return (
          <li key={el.id}>
            <div
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-colors ${
                isSelected
                  ? "bg-[var(--st-raised)] ring-1 ring-inset ring-[var(--st-accent)]"
                  : "bg-[var(--st-raised)]/60 hover:bg-[var(--st-raised)]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(el.id)}
                className="flex-1 truncate text-left text-[13px] text-[var(--st-text)]"
              >
                {labelFor(el, realIndex)}
              </button>

              <button
                type="button"
                aria-label="Move layer up"
                onClick={() => onReorder(el.id, "up")}
                disabled={realIndex === elements.length - 1}
                className="rounded px-1.5 py-0.5 text-[12px] text-[var(--st-dim)] transition-colors hover:text-[var(--st-text)] disabled:opacity-25"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move layer down"
                onClick={() => onReorder(el.id, "down")}
                disabled={realIndex === 0}
                className="rounded px-1.5 py-0.5 text-[12px] text-[var(--st-dim)] transition-colors hover:text-[var(--st-text)] disabled:opacity-25"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Delete layer"
                onClick={() => onRemove(el.id)}
                className="rounded px-1.5 py-0.5 text-[12px] text-[var(--st-dim)] transition-colors hover:text-[var(--st-danger)]"
              >
                ✕
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
