"use client";

import { useState } from "react";
import { CodeBlock } from "./CodeBlock";

export type CodeTab = { id: string; label: string; code: string; caption?: string };

/**
 * Switching tabs is a frequent, user-driven action, so the tab itself only
 * changes colour — no sliding indicator — and the panel enters in 220ms rather
 * than with a reveal.
 */
export function CodeTabs({ tabs, label }: { tabs: CodeTab[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  if (!current) return null;

  return (
    <div className="min-w-0">
      <div role="tablist" aria-label={label} className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const selected = tab.id === current.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={
                selected
                  ? "rounded-lg bg-[var(--st-text)] px-3.5 py-2 text-xs font-medium text-[var(--st-bg)] transition-colors duration-[var(--duration-hover)]"
                  : "rounded-lg border border-[var(--st-line)] px-3.5 py-2 text-xs font-medium text-[var(--st-dim)] transition-colors duration-[var(--duration-hover)] hover:border-[var(--st-text)] hover:text-[var(--st-text)]"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div key={current.id} data-appear role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`}>
        <CodeBlock code={current.code} caption={current.caption} />
      </div>
    </div>
  );
}
