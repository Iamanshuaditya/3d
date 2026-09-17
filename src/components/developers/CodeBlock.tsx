"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const COPIED_FOR_MS = 1800;

/**
 * A code sample with a copy button.
 *
 * The clipboard is unavailable on insecure origins and can be denied outright,
 * so a failure leaves the button alone rather than claiming success — the code
 * is still selectable either way.
 */
export function CodeBlock({ code, caption, className }: { code: string; caption?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
  }

  return (
    <div className={cn("group/code relative min-w-0", className)}>
      {caption && (
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--st-faint)]">{caption}</p>
      )}
      <pre className="min-w-0 overflow-auto overscroll-contain rounded-2xl bg-[#17191c] p-5 pr-14 text-xs leading-[1.8] text-[#e2e3e6] sm:p-6 sm:pr-16">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied to clipboard" : "Copy code"}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white/80 transition-[background-color,transform,opacity] duration-[var(--duration-press)] ease-[var(--ease-out)] hover:bg-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 active:scale-95 sm:opacity-0 sm:group-hover/code:opacity-100 sm:focus-visible:opacity-100"
      >
        {/* Both icons stay mounted and cross-fade, so the button never reflows
            and the swap can be interrupted by a second copy. */}
        <span className="relative block h-4 w-4">
          <Copy
            aria-hidden="true"
            className={cn(
              "absolute inset-0 h-4 w-4 transition-[opacity,transform] duration-[var(--duration-panel)] ease-[var(--ease-out)]",
              copied ? "scale-90 opacity-0" : "scale-100 opacity-100",
            )}
          />
          <Check
            aria-hidden="true"
            className={cn(
              "absolute inset-0 h-4 w-4 transition-[opacity,transform] duration-[var(--duration-panel)] ease-[var(--ease-out)]",
              copied ? "scale-100 opacity-100" : "scale-90 opacity-0",
            )}
          />
        </span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">{copied ? "Copied" : ""}</span>
    </div>
  );
}
