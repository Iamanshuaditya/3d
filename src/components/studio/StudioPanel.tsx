"use client";

import { useMemo, useRef } from "react";
import { Check, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import type { StudioTool } from "./StudioToolRail";
import { LayersPanel } from "@/components/configurator/LayersPanel";
import { ArtworkTreatmentControls } from "@/components/configurator/ArtworkTreatmentControls";
import type { useCustomizer } from "@/lib/configurator/use-customizer";
import {
  cropToFillFrame,
  cropZoom,
  setCropCenter,
  setCropZoom,
} from "@/lib/configurator/image-crop";

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
  Uploads: "Artwork is securely saved with this project and is restored when you return.",
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
  const selectedImage = selected?.type === "image" ? selected : null;
  const cropState = useMemo(() => {
    if (!selectedImage) return null;
    const sourceWidth = selectedImage.sourcePixelWidth ?? selectedImage.width;
    const sourceHeight = selectedImage.sourcePixelHeight ?? selectedImage.height;
    const base = cropToFillFrame(
      sourceWidth,
      sourceHeight,
      selectedImage.width,
      selectedImage.height,
    );
    const current = selectedImage.crop ?? base;
    return {
      base,
      current,
      zoom: cropZoom(base, current),
      centerX: current.x + current.width / 2,
      centerY: current.y + current.height / 2,
    };
  }, [selectedImage]);
  const quality = c.selectedImageQuality;
  const qualityTone = quality?.state === "good"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : quality?.state === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : quality?.state === "poor"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

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
        {selectedImage && quality && (tool === "Uploads" || tool === "Editor") && (
          <div className={`rounded-xl border px-3 py-2.5 ${qualityTone}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold capitalize">
                {quality.state === "unknown" ? "Resolution unknown" : `${quality.state} print quality`}
              </span>
              {quality.ppi && (
                <span className="text-[12px] font-semibold tabular-nums">
                  {Math.floor(quality.ppi.minimum)} PPI
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-4 opacity-80">
              {quality.state === "good"
                ? `Meets the recommended ${quality.warningPpi} PPI at this physical size.`
                : quality.state === "warning"
                  ? `Printable, but ${quality.warningPpi} PPI is recommended for best results.`
                  : quality.state === "poor"
                    ? `Below the ${quality.minimumPpi} PPI production minimum. Reduce its printed size or use a larger source.`
                    : "The original pixel dimensions are unavailable, so print resolution cannot be checked."}
            </p>
          </div>
        )}

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

            {selectedImage && (
              <ArtworkTreatmentControls
                surface={c.activeSurface}
                element={selectedImage}
                stitchCount={c.embroidery.stitchCount}
                notices={c.embroidery.notices}
                busy={c.embroidery.busy}
                onModeChange={(mode) => c.setElementRenderMode(selectedImage.id, mode)}
                onSettingsChange={(patch, transient) =>
                  c.updateEmbroiderySettings(selectedImage.id, patch, transient)
                }
                onCommit={c.commitHistory}
              />
            )}
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
                {selectedText.binding && (
                  <p className="rounded-lg bg-[var(--st-raised)] px-3 py-2 text-[12px] leading-5 text-[var(--st-dim)]">
                    Personalized field: <span className="font-mono text-[var(--st-text)]">{selectedText.binding.key}</span>.
                    Editing the content detaches this layer from that field.
                  </p>
                )}
                <Field label="Content">
                  <textarea
                    rows={2}
                    value={selectedText.text}
                    onChange={(e) =>
                      c.applyChange(
                        selectedText.id,
                        { text: e.target.value, binding: undefined },
                        true,
                      )
                    }
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
            {c.cropMode && selectedImage && cropState ? (
              <div className="flex flex-col gap-4 rounded-xl border border-[var(--st-line)] bg-[var(--st-raised)]/55 p-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--st-text)]">Crop image</h3>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--st-dim)]">
                    The frame stays fixed while you move and zoom the original image underneath it.
                  </p>
                </div>
                <Field label="Zoom">
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.01}
                    value={Math.min(4, cropState.zoom)}
                    onChange={(event) =>
                      c.updateSelectedCrop(
                        setCropZoom(cropState.base, cropState.current, Number(event.target.value)),
                      )
                    }
                    className="w-full accent-[var(--st-accent)]"
                  />
                </Field>
                <Field label="Horizontal position">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={cropState.centerX}
                    onChange={(event) =>
                      c.updateSelectedCrop(
                        setCropCenter(
                          cropState.current,
                          Number(event.target.value),
                          cropState.centerY,
                        ),
                      )
                    }
                    className="w-full accent-[var(--st-accent)]"
                  />
                </Field>
                <Field label="Vertical position">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={cropState.centerY}
                    onChange={(event) =>
                      c.updateSelectedCrop(
                        setCropCenter(
                          cropState.current,
                          cropState.centerX,
                          Number(event.target.value),
                        ),
                      )
                    }
                    className="w-full accent-[var(--st-accent)]"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => c.updateSelectedCrop(cropState.base)}
                  className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-[var(--st-dim)] transition-colors hover:bg-[var(--st-line)] hover:text-[var(--st-text)]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset crop
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={c.cancelCrop}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--st-surface)] px-3 py-2 text-[13px] font-medium text-[var(--st-text)] ring-1 ring-[var(--st-line)]"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={c.finishCrop}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--st-accent)] px-3 py-2 text-[13px] font-medium text-[var(--st-accent-ink)]"
                  >
                    <Check className="h-4 w-4" />
                    Done
                  </button>
                </div>
              </div>
            ) : (
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
