"use client";

import { useEffect, useState } from "react";
import { DOCS_NAV } from "@/lib/developers/reference";
import { cn } from "@/lib/utils";

/**
 * Sticky contents with a scroll spy.
 *
 * Several sections are on screen at once while reading, so "current" is the
 * topmost intersecting section rather than the last one to fire a callback —
 * otherwise the highlight jumps backwards when scrolling up.
 */
export function DocsNav() {
  const [active, setActive] = useState("");

  useEffect(() => {
    const ids = DOCS_NAV.flatMap((group) => group.items.map((item) => item.id));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (sections.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const topmost = ids.find((id) => visible.has(id));
        if (topmost) setActive(topmost);
      },
      // Ignore the band under the sticky header, and treat only the upper
      // third of the viewport as "being read".
      { rootMargin: "-88px 0px -66% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="On this page" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--st-faint)]">On this page</p>
      <ul className="space-y-5 border-l border-[var(--st-line)]">
        {DOCS_NAV.map((group) => (
          <li key={group.group}>
            <p className="mb-2 pl-4 text-[11px] uppercase tracking-[0.12em] text-[var(--st-faint)]">{group.group}</p>
            <ul>
              {group.items.map((item) => {
                const current = item.id === active;
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      aria-current={current ? "location" : undefined}
                      className={cn(
                        "-ml-px block border-l py-1.5 pl-4 text-[13px] transition-[color,border-color] duration-[var(--duration-hover)]",
                        current
                          ? "border-[var(--st-text)] font-medium text-[var(--st-text)]"
                          : "border-transparent text-[var(--st-dim)] hover:border-[var(--st-line-strong)] hover:text-[var(--st-text)]",
                      )}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
