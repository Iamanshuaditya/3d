"use client";

import type { EditableSurface, ImageElement } from "@/types/configurator";
import type { ArtworkRenderMode, EmbroiderySettings } from "@/types/embroidery";

type ArtworkTreatmentControlsProps = {
  surface: EditableSurface;
  element: ImageElement;
  stitchCount: number;
  notices: string[];
  busy: boolean;
  onModeChange: (mode: ArtworkRenderMode) => void;
  onSettingsChange: (patch: Partial<EmbroiderySettings>, transient: boolean) => void;
  onCommit: () => void;
};

/**
 * Reproduction method for one placed image.
 *
 * Deliberately small: style, density and thread weight are the three things a
 * customer actually has an opinion about. The data model behind it carries the
 * full digitiser vocabulary (underlay, satin threshold, colour budget, relief)
 * so the panel can grow without another migration.
 */
const MODE_LABELS: Record<ArtworkRenderMode, string> = {
  print: "Print",
  embroidery: "Embroidery",
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--st-faint)]">
          {label}
        </span>
        <span className="text-[12px] tabular-nums text-[var(--st-dim)]">
          {value.toFixed(2)}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onBlur={onCommit}
        className="w-full accent-[var(--st-accent)]"
      />
    </label>
  );
}

export function ArtworkTreatmentControls({
  surface,
  element,
  stitchCount,
  notices,
  busy,
  onModeChange,
  onSettingsChange,
  onCommit,
}: ArtworkTreatmentControlsProps) {
  const modes = surface.renderModes ?? ["print"];
  // A surface that only prints never shows a choice it cannot honour.
  if (modes.length < 2) return null;

  const current: ArtworkRenderMode = element.treatment?.mode === "embroidery" ? "embroidery" : "print";
  const settings = element.treatment?.mode === "embroidery" ? element.treatment.settings : null;

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-[var(--st-line)] pt-4">
      <div>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--st-faint)]">
          Style
        </span>
        <div
          role="radiogroup"
          aria-label="Reproduction method"
          className="mt-1.5 flex gap-1 rounded-lg bg-[var(--st-raised)] p-1"
        >
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={current === mode}
              onClick={() => onModeChange(mode)}
              className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                current === mode
                  ? "bg-[var(--st-surface)] text-[var(--st-text)] shadow-sm"
                  : "text-[var(--st-dim)] hover:text-[var(--st-text)]"
              }`}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {settings && (
        <>
          <Slider
            label="Density"
            value={settings.densityMm}
            min={0.3}
            max={0.9}
            step={0.05}
            suffix="mm"
            onChange={(densityMm) => onSettingsChange({ densityMm }, true)}
            onCommit={onCommit}
          />
          <Slider
            label="Thread thickness"
            value={settings.threadWidthMm}
            min={0.25}
            max={0.8}
            step={0.05}
            suffix="mm"
            onChange={(threadWidthMm) => onSettingsChange({ threadWidthMm }, true)}
            onCommit={onCommit}
          />

          <p className="text-[12px] leading-[1.5] text-[var(--st-faint)]">
            {busy
              ? "Refining stitches…"
              : `${stitchCount.toLocaleString()} stitches · spacing and thread are in millimetres, so the look holds at any preview resolution.`}
          </p>

          {notices.map((notice) => (
            <p
              key={notice}
              className="rounded-lg bg-[var(--st-raised)] px-3 py-2 text-[12px] leading-[1.5] text-[var(--st-dim)]"
            >
              {notice}
            </p>
          ))}

          <p className="text-[11px] leading-[1.45] text-[var(--st-faint)]">
            Visual preview only. Machine-ready digitising (DST/PES) is a separate
            production step.
          </p>
        </>
      )}
    </div>
  );
}
