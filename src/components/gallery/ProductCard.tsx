"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowUpRight, Box, Layers, Ruler } from "lucide-react";
import type { ProductConfig } from "@/types/configurator";
import {
  formatBytes,
  previewBackground,
  type ProductSummary,
} from "@/lib/configurator/product-summary";

const Product3DPreview = dynamic(
  () => import("./Product3DPreview").then((m) => m.Product3DPreview),
  { ssr: false },
);

type ProductCardProps = {
  config: ProductConfig;
  summary: ProductSummary;
};

/** Starts loading a little before the card is on screen. */
const PRELOAD_MARGIN = "300px";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

export function ProductCard({ config, summary }: ProductCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // Meshes here run to tens of megabytes, so a card only pulls its model once
  // it is close to the viewport. Off-screen cards cost nothing.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView]);

  return (
    <article className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[var(--st-surface)] ring-1 ring-[var(--st-line)] transition-shadow hover:shadow-[0_8px_28px_rgba(16,18,22,0.10)] hover:ring-[var(--st-line-strong)]">
      <div
        ref={containerRef}
        className="relative aspect-[5/4] w-full overflow-hidden"
        style={{ background: previewBackground(config) }}
      >
        {inView ? (
          <Product3DPreview config={config} spin={!reducedMotion} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-[12px] text-black/35">Preparing preview…</span>
          </div>
        )}

        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[var(--st-dim)] ring-1 ring-black/5 backdrop-blur">
          {summary.familyLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <h2 className="text-[16px] font-semibold leading-tight tracking-tight text-[var(--st-text)]">
            {summary.name}
          </h2>
          <p className="mt-1 font-mono text-[11px] text-[var(--st-faint)]">{summary.id}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
          <div className="flex items-center gap-2 text-[var(--st-dim)]">
            <Ruler className="h-3.5 w-3.5 shrink-0 text-[var(--st-faint)]" />
            <dt className="sr-only">Print size</dt>
            <dd className="truncate">{summary.printSize}</dd>
          </div>
          <div className="flex items-center gap-2 text-[var(--st-dim)]">
            <Layers className="h-3.5 w-3.5 shrink-0 text-[var(--st-faint)]" />
            <dt className="sr-only">Printable surfaces</dt>
            <dd className="truncate">
              {summary.surfaceCount} surface{summary.surfaceCount === 1 ? "" : "s"}
              {summary.sectionCount > 0 ? ` · ${summary.sectionCount} panels` : ""}
            </dd>
          </div>
          <div className="flex items-center gap-2 text-[var(--st-dim)]">
            <Box className="h-3.5 w-3.5 shrink-0 text-[var(--st-faint)]" />
            <dt className="sr-only">Model weight</dt>
            <dd className="truncate">{formatBytes(summary.modelBytes)}</dd>
          </div>
          <div className="flex items-center gap-2 text-[var(--st-dim)]">
            <dt className="sr-only">Editor canvas</dt>
            <dd className="truncate font-mono text-[11px]">{summary.canvasSize}</dd>
          </div>
        </dl>

        <Link
          href={`/studio?product=${summary.id}`}
          className="mt-auto flex items-center justify-between rounded-lg px-1 py-1 text-[13px] font-medium text-[var(--st-dim)] outline-none transition-colors group-hover:text-[var(--st-text)] focus-visible:ring-2 focus-visible:ring-[var(--st-accent)]"
        >
          {/* Stretched so the whole card is one target, while the link itself
              stays the only focusable element. */}
          <span className="after:absolute after:inset-0 after:content-['']">
            Open in studio
          </span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
