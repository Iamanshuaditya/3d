"use client";

import { RotateCcw, Undo2 } from "lucide-react";
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
 * The product's structural control.
 *
 * Deliberately not packaging-specific: it renders whatever the plan says the
 * next stage is called, so a carton says "Open lid" then "Lay the walls flat"
 * while some future product could say "Explode" or "Flatten" from the same
 * component. Products without articulation render nothing at all.
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

  const isToggle = presentation.mode === "open-close";
  const primaryLabel = status.atEnd
    ? (status.reverseLabel ?? (isToggle ? "Close" : "Fold back"))
    : status.nextLabel;
  const primaryAction = status.atEnd ? onPrevious : onNext;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={primaryAction}
        data-unfold-action="primary"
        className="rounded-lg bg-[var(--st-raised)] px-3 py-1.5 text-[13px] font-medium text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)]"
      >
        {primaryLabel}
      </button>

      {!isToggle && (
        <>
          <span
            aria-live="polite"
            data-unfold-status=""
            className="whitespace-nowrap text-[12px] tabular-nums text-[var(--st-dim)]"
          >
            {status.isFlat
              ? "Fully unfolded"
              : `Step ${Math.min(status.stage + 1, status.stepCount)} of ${status.stepCount}`}
          </span>

          {!status.atStart && (
            <>
              {!status.atEnd && (
                <button
                  type="button"
                  onClick={onPrevious}
                  data-unfold-action="previous"
                  aria-label="Fold back one step"
                  title="Fold back one step"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--st-dim)] transition-colors hover:bg-[var(--st-raised)] hover:text-[var(--st-text)]"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              )}
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
            </>
          )}
        </>
      )}
    </div>
  );
}
