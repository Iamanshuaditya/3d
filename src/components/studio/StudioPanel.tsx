"use client";

import { useRef } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { StudioTool } from "./StudioToolRail";
import { LayersPanel } from "@/components/configurator/LayersPanel";
import type { useCustomizer } from "@/lib/configurator/use-customizer";

type StudioPanelProps = {
  tool: StudioTool;
  customizer: ReturnType<typeof useCustomizer>;
};

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";

/** Neutral, print-safe starting points rather than a brand palette. */
const SWATCHES = [
  "#ffffff",
  "#f2ede3",
  "#d6d3cc",
  "#111111",
  "#3f4a5a",
  "#0f4c5c",
  "#2d6a4f",
  "#a4341f",
];

const TITLES: Record<StudioTool, string> = {
  Text: "Text",
  Uploads: "Uploads",
  Background: "Colour",
  Editor: "Adjust",
};

const HINTS: Record<StudioTool, string> = {
  Text: "Type is placed inside the printable area and stays with your design between visits.",
  Uploads: "Artwork stays on this device — nothing is uploaded to a server.",
  Background: "Fills the whole printable area behind your artwork.",
  Editor: "Position and scale whatever is selected on the canvas.",
};

function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary:
      "bg-[var(--st-accent)] text-[var(--st-accent-ink)] hover:opacity-90",
    secondary:
      "bg-[var(--st-raised)] text-[var(--st-text)] hover:bg-[var(--st-line-strong)]",
    danger:
      "bg-[var(--st-raised)] text-[var(--st-danger)] hover:bg-[var(--st-line-strong)]",
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${styles}`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--st-faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg bg-[var(--st-raised)] px-3 py-2 text-[14px] text-[var(--st-text)] outline-none ring-[var(--st-accent)] focus-visible:ring-2";

export function StudioPanel({ tool, customizer: c }: StudioPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const elements = c.activeDesign?.elements ?? [];
  const selected = c.selectedElement;
  const selectedText = selected?.type === "text" ? selected : null;

  return (
    <aside
      aria-label={`${TITLES[tool]} panel`}
      className="flex max-h-[42vh] w-full shrink-0 flex-col overflow-y-auto border-t border-[var(--st-line)] bg-[var(--st-surface)] px-5 py-4 lg:max-h-none lg:w-[320px] lg:border-r lg:border-t-0 lg:py-5"
    >
      <h2 className="text-[17px] font-semibold tracking-tight text-[var(--st-text)]">
        {TITLES[tool]}
      </h2>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-[var(--st-dim)]">{HINTS[tool]}</p>

      <div className="mt-5 flex flex-col gap-3">
        {tool === "Uploads" && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void c.uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button variant="primary" onClick={() => inputRef.current?.click()}>
              <Upload className="h-[18px] w-[18px]" />
              Upload artwork
            </Button>
            <p className="text-center text-[12px] text-[var(--st-faint)]">
              PNG, JPG or WebP · or drop onto the canvas
            </p>
          </>
        )}

        {tool === "Text" && (
          <>
            <Button variant="primary" onClick={c.addText}>
              <Plus className="h-[18px] w-[18px]" />
              Add text
            </Button>

            {selectedText && (
              <div className="mt-2 flex flex-col gap-3 border-t border-[var(--st-line)] pt-4">
                <Field label="Content">
                  <textarea
                    rows={2}
                    value={selectedText.text}
                    onChange={(e) => c.applyChange(selectedText.id, { text: e.target.value }, true)}
                    onBlur={c.commitHistory}
                    className={`${inputClass} resize-none`}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Size">
                    <input
                      type="number"
                      min={8}
                      max={400}
                      value={Math.round(selectedText.fontSize)}
                      onChange={(e) =>
                        c.applyChange(
                          selectedText.id,
                          { fontSize: Number(e.target.value) || selectedText.fontSize },
                          true,
                        )
                      }
                      onBlur={c.commitHistory}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Colour">
                    <input
                      type="color"
                      value={selectedText.fill}
                      onChange={(e) => c.applyChange(selectedText.id, { fill: e.target.value }, true)}
                      onBlur={c.commitHistory}
                      className="h-[38px] w-full cursor-pointer rounded-lg bg-[var(--st-raised)] px-1.5"
                    />
                  </Field>
                </div>
              </div>
            )}
          </>
        )}

        {tool === "Background" && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {SWATCHES.map((color) => {
                const isActive = c.activeDesign?.background === color;
                return (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Background ${color}`}
                    aria-pressed={isActive}
                    onClick={() => c.setBackground(color)}
                    style={{ background: color }}
                    className={`h-11 rounded-lg transition-transform hover:scale-[1.06] ${
                      isActive
                        ? "ring-2 ring-[var(--st-accent)] ring-offset-2 ring-offset-[var(--st-surface)]"
                        : "ring-1 ring-inset ring-[var(--st-line-strong)]"
                    }`}
                  />
                );
              })}
            </div>
            <Button onClick={() => c.setBackground(null)}>No background</Button>
          </>
        )}

        {tool === "Editor" && (
          <>
            <Button onClick={c.centerSelected} disabled={!selected}>
              Centre in print area
            </Button>
            <Button onClick={c.fitSelected} disabled={selected?.type !== "image"}>
              Fit to print area
            </Button>
            <Button onClick={c.fillSelected} disabled={selected?.type !== "image"}>
              Fill print area
            </Button>
            <Button variant="danger" onClick={c.deleteSelected} disabled={!selected}>
              <Trash2 className="h-[17px] w-[17px]" />
              Delete selected
            </Button>
            <div className="my-1 h-px bg-[var(--st-line)]" />
            <Button variant="danger" onClick={c.resetSurface}>
              Clear this surface
            </Button>
          </>
        )}
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--st-faint)]">
          Layers
        </h3>
        <LayersPanel
          elements={elements}
          selectedId={c.selectedId}
          onSelect={c.setSelectedId}
          onReorder={c.reorderElement}
          onRemove={c.removeElement}
        />
      </div>
    </aside>
  );
}
