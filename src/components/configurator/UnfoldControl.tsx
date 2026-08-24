"use client";

import { RotateCcw } from "lucide-react";
import type { ProductPresentation } from "@/lib/configurator/presentation";
import type { UnfoldStatus } from "@/lib/configurator/unfold-state";

type UnfoldControlProps = {
  presentation: ProductPresentation;
  status: UnfoldStatus | null;
  onNext: () => void;
  onPrevious: () => void;
  onReset: () => void;
};

/**
 * Structural controls.
 *
 * Progressive folding mirrors the benchmark contract explicitly:
 * - Backward moves one deterministic step from assembled toward the flat sheet.
 * - Forward reverses that same step toward the assembled package.
 *
 * Internally the state machine still owns only an integer stage and absolute
 * target angles, so rapidly alternating the two buttons cannot accumulate
 * transform drift. Simple open/close products retain their descriptive toggle.
 */
export function UnfoldControl({
  presentation,
  status,
  onNext,
  onPrevious,
  onReset,
}: UnfoldControlProps) {
  if (!status) return null;
  if (presentation.mode !== "open-close" && presentation.mode !== "progressive-unfold") {
    return null;
  }

  if (presentation.mode === "open-close") {
    const label = status.atEnd
      ? (status.reverseLabel ?? "Close")
      : (status.nextLabel ?? "Open");
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={status.atEnd ? onPrevious : onNext}
          data-unfold-action="primary"
          className="rounded-lg bg-[var(--st-raised)] px-3 py-1.5 text-[13px] font-medium text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)]"
        >
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onNext}
        disabled={status.atEnd}
        data-unfold-action="backward"
        aria-label={status.nextLabel ? `Backward: ${status.nextLabel}` : "Backward"}
        title={status.nextLabel ?? "Fully unfolded"}
        className="rounded-lg bg-[var(--st-raised)] px-3 py-1.5 text-[13px] font-medium text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Backward
      </button>

      <button
        type="button"
        onClick={onPrevious}
        disabled={status.atStart}
        data-unfold-action="forward"
        aria-label={status.reverseLabel ? `Forward: ${status.reverseLabel}` : "Forward"}
        title={status.reverseLabel ?? "Already assembled"}
        className="rounded-lg bg-[var(--st-raised)] px-3 py-1.5 text-[13px] font-medium text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Forward
      </button>

      <span
        aria-live="polite"
        data-unfold-status=""
        className="whitespace-nowrap text-[12px] tabular-nums text-[var(--st-dim)]"
      >
        {status.isFlat
          ? "Fully unfolded"
          : status.atStart
            ? "Assembled"
            : `Step ${status.stage} of ${status.stepCount}`}
      </span>

      {!status.atStart && (
        <button
          type="button"
          onClick={onReset}
          data-unfold-action="reset"
          aria-label="Reset to assembled"
          title="Reset to assembled"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--st-dim)] transition-colors hover:bg-[var(--st-raised)] hover:text-[var(--st-text)]"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
