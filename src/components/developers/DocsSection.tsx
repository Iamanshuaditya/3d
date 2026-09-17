import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One documentation section, deep-linkable and registered with the scroll spy.
 * `scroll-mt` keeps the heading clear of the sticky chrome when jumped to.
 */
export function DocsSection({
  id, title, kicker, children, className,
}: { id: string; title: string; kicker?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24 border-t border-[var(--st-line)] py-11", className)}>
      {kicker && (
        <p data-reveal="up" className="mb-3 font-mono text-xs text-[var(--st-dim)]">{kicker}</p>
      )}
      <h2 data-reveal="up" className="group/anchor text-2xl font-medium tracking-tight">
        <a href={`#${id}`} className="inline-flex items-baseline gap-2">
          {title}
          <span
            aria-hidden="true"
            className="text-[var(--st-faint)] opacity-0 transition-opacity duration-[var(--duration-hover)] group-hover/anchor:opacity-100"
          >
            #
          </span>
        </a>
      </h2>
      {children}
    </section>
  );
}

/** A two-column reference table. Rows stay readable on a phone by scrolling. */
export function DocsTable({
  head, rows, mono,
}: { head: string[]; rows: ReadonlyArray<ReadonlyArray<string>>; mono?: number[] }) {
  return (
    <div data-reveal="up" className="mt-5 overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="border-b border-[var(--st-line)] text-[var(--st-dim)]">
          <tr>{head.map((cell) => <th key={cell} className="py-3 pr-4 font-medium">{cell}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--st-line)]">
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    "py-3.5 pr-4 align-top",
                    mono?.includes(index) && "font-mono text-xs",
                    index > 0 && "text-[var(--st-dim)]",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
