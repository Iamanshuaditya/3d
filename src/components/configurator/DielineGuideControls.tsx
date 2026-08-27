import { Check } from "lucide-react";
import {
  DIELINE_GUIDE_CLASS_ORDER,
  DIELINE_GUIDE_DETAILS,
  type DielineGuideClass,
  type DielineGuideVisibility,
} from "@/lib/configurator/dieline-presentation";

type DielineGuideControlsProps = {
  visibility: Readonly<DielineGuideVisibility>;
  onToggle: (guideClass: DielineGuideClass) => void;
  onHighlight: (guideClass: DielineGuideClass | null) => void;
};

const SWATCH_CLASS: Readonly<Record<DielineGuideClass, string>> = {
  cut: "bg-[#1463a5]",
  crease: "bg-[#c2415b]",
  bleed: "bg-[#0e9f6e]",
  safe: "bg-[#7c3aed]",
  technical: "bg-[#64748b]",
  panel: "bg-[#2563eb]",
};

export function DielineGuideControls({
  visibility,
  onToggle,
  onHighlight,
}: DielineGuideControlsProps) {
  return (
    <div
      className="w-72 rounded-2xl bg-[var(--st-surface)] p-2 shadow-[0_12px_40px_rgba(16,18,22,0.2)] ring-1 ring-[var(--st-line)]"
      role="group"
      aria-label="Production guide classes"
    >
      <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--st-dim)]">
        Production guides
      </div>
      {DIELINE_GUIDE_CLASS_ORDER.map((guideClass) => {
        const details = DIELINE_GUIDE_DETAILS[guideClass];
        const enabled = visibility[guideClass];
        return (
          <button
            key={guideClass}
            type="button"
            aria-pressed={enabled}
            title={details.description}
            onClick={() => onToggle(guideClass)}
            onMouseEnter={() => onHighlight(guideClass)}
            onMouseLeave={() => onHighlight(null)}
            onFocus={() => onHighlight(guideClass)}
            onBlur={() => onHighlight(null)}
            className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--st-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-accent)]"
          >
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${SWATCH_CLASS[guideClass]}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--st-text)]">
                {details.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-[var(--st-dim)]">
                {details.description}
              </span>
            </span>
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                enabled
                  ? "border-[var(--st-accent)] bg-[var(--st-accent)] text-[var(--st-accent-ink)]"
                  : "border-[var(--st-line)] text-transparent"
              }`}
              aria-hidden="true"
            >
              <Check className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
