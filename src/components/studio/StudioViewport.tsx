"use client";

import dynamic from "next/dynamic";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { CameraPreset, ProductConfig } from "@/types/configurator";
import type { ProductPresentation } from "@/lib/configurator/presentation";
import type { useCustomizer } from "@/lib/configurator/use-customizer";
import type { useUnfold } from "@/lib/configurator/use-unfold";
import type { useInflation } from "@/lib/configurator/use-inflation";
import { UnfoldControl } from "@/components/configurator/UnfoldControl";

const Product3DViewer = dynamic(
  () => import("@/components/configurator/Product3DViewer").then((module) => module.Product3DViewer),
  { ssr: false, loading: () => <p className="p-6 text-sm text-[var(--st-dim)]">Loading 3D preview…</p> },
);

export type StudioViewportProps = {
  config: ProductConfig;
  customizer: ReturnType<typeof useCustomizer>;
  structuralPresentation: ProductPresentation;
  unfold: ReturnType<typeof useUnfold>;
  inflation: ReturnType<typeof useInflation>;
  animated: boolean;
  onAnimatedChange: (value: boolean) => void;
  pendingPreset: CameraPreset | null;
  onPresetApplied: () => void;
  onPresetChange: (preset: CameraPreset) => void;
  unfoldEnabled?: boolean;
};

const button = "inline-flex items-center gap-1.5 rounded-lg bg-[var(--st-raised)] px-3 py-1.5 text-xs font-medium text-[var(--st-text)] hover:bg-[var(--st-line-strong)] focus-visible:outline-2 focus-visible:outline-[var(--st-accent)]";

export function StudioViewport({
  config, customizer: c, structuralPresentation, unfold, inflation,
  animated, onAnimatedChange, pendingPreset, onPresetApplied, onPresetChange, unfoldEnabled = true,
}: StudioViewportProps) {
  const reset = () => {
    inflation.reset();
    unfold.reset();
    onAnimatedChange(false);
    onPresetChange({ id: "default", label: "Default", position: config.camera.initial, target: config.camera.target });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--st-line)] px-3 py-2.5">
        {unfoldEnabled && <UnfoldControl presentation={structuralPresentation} status={unfold.status}
          onNext={unfold.next} onPrevious={unfold.previous} onReset={unfold.reset} />}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} onClick={reset} title="Reset preview pose, finish and camera">
            <RotateCcw className="h-3.5 w-3.5" /> Default
          </button>
          <button type="button" role="switch" aria-checked={animated}
            onClick={() => onAnimatedChange(!animated)} className={button}>
            Auto-motion <span className="text-[var(--st-dim)]">{animated ? "On" : "Off"}</span>
          </button>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-[var(--st-line)] px-3 py-2" aria-label="Camera views" role="group">
        {config.camera.presets.map((preset) => (
          <button type="button" key={preset.id} onClick={() => onPresetChange(preset)}
            className="rounded-md px-2.5 py-1.5 text-xs text-[var(--st-dim)] hover:bg-[var(--st-raised)] hover:text-[var(--st-text)] focus-visible:outline-2 focus-visible:outline-[var(--st-accent)]">
            {preset.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 p-3">
        <Product3DViewer config={config} textures={c.textures} materialTextures={c.materialTextures}
          consumeDirty={c.consumeDirty} pendingPreset={pendingPreset} onPresetApplied={onPresetApplied}
          onValidated={c.handleValidated} onSurfaceClick={c.selectSurface}
          highlightedMeshName={c.hoveredMeshName} onMeshHover={c.setHoveredMeshName} onMeshClick={c.selectMesh}
          hoverParallax={animated} hingeAngles={unfold.angles} dielineView={Boolean(unfold.status?.isFlat)}
          inflation={inflation.value} finish={inflation.finish} />
      </div>
      {config.inflation && (
        <div className="shrink-0 space-y-3 border-t border-[var(--st-line)] bg-[var(--st-surface)] p-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>Inflation</span>
            <output aria-label="Inflation amount" className="tabular-nums">{Math.round(inflation.value * 100)}%</output>
          </div>
          <input type="range" min="0" max="1" step="0.01" value={inflation.value}
            aria-label="Pouch inflation" onChange={(event) => inflation.change(Number(event.target.value))}
            className="w-full cursor-pointer accent-[var(--st-accent)]" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <button type="button" className={button} onClick={() => inflation.change(0)}>Flat</button>
              <button type="button" className={button} onClick={() => inflation.change(1)}>Filled</button>
              <button type="button" className={button} onClick={inflation.toggle} aria-pressed={inflation.playing}>
                {inflation.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {inflation.playing ? "Pause" : "Animate"}
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--st-dim)]">
              Finish
              <select aria-label="Pouch finish" value={inflation.finish}
                onChange={(event) => inflation.setFinish(event.target.value === "gloss" ? "gloss" : "satin")}
                className="rounded-lg bg-[var(--st-raised)] px-2 py-1.5 text-[var(--st-text)]">
                <option value="satin">Satin</option><option value="gloss">Gloss</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
