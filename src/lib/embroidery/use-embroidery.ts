"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DesignDocument, ProductConfig } from "@/types/configurator";
import type { EmbroideryResult } from "@/types/embroidery";
import type { EmbroideryQuality } from "./index";
import { generateEmbroideryAsync } from "./worker-client";
import { embroideryCacheKey, readEmbroideryCache, writeEmbroideryCache } from "./cache";
import {
  composeSurfaceMaterialMaps,
  createSurfaceMaterialMaps,
  elementPhysicalSizeMm,
  type SurfaceMaterialMaps,
} from "./compose-surface-maps";

/**
 * Derives stitching for every embroidered element, then composites the
 * surface-wide material maps.
 *
 * Two properties make this cheap enough to run on the main thread:
 *
 *  - the cache key ignores position and rotation, so dragging or turning a
 *    placed logo recomputes nothing at all;
 *  - a change first produces a low-resolution pass so the canvas keeps up with
 *    a resize handle, and the full-resolution pass lands once the pointer has
 *    been still for a moment.
 */

/**
 * How long the pointer has to be still before any stitching is recomputed.
 *
 * Nothing recomputes while a logo is dragged or rotated — position is not part
 * of the cache key — so this only gates a genuine change of size or settings.
 * Until it fires the previous stitching stays on screen, scaled, which reads as
 * progressive refinement rather than as a stall.
 */
const RECOMPUTE_DELAY_MS = 180;

type ElementJob = {
  surfaceId: string;
  elementId: string;
  src: string;
  widthMm: number;
  heightMm: number;
  settings: import("@/types/embroidery").EmbroiderySettings;
};

export function useEmbroidery(
  config: ProductConfig,
  design: DesignDocument,
  images: Record<string, HTMLImageElement>,
) {
  const [results, setResults] = useState<Record<string, EmbroideryResult>>({});
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One flat list of "what needs stitching, at what physical size". Derived
  // from the design document, so it changes only when something real changes.
  const jobs = useMemo<ElementJob[]>(() => {
    const out: ElementJob[] = [];
    for (const surface of config.editableSurfaces) {
      const surfaceDesign = design.surfaces[surface.id];
      if (!surfaceDesign) continue;
      for (const element of surfaceDesign.elements) {
        if (element.type !== "image") continue;
        if (element.treatment?.mode !== "embroidery") continue;
        if (!element.src) continue;
        const { widthMm, heightMm } = elementPhysicalSizeMm(surface, element);
        if (widthMm < 1 || heightMm < 1) continue;
        out.push({
          surfaceId: surface.id,
          elementId: element.id,
          src: element.src,
          widthMm,
          heightMm,
          settings: element.treatment.settings,
        });
      }
    }
    return out;
  }, [config.editableSurfaces, design]);

  const signature = useMemo(
    () =>
      jobs
        .map((job) =>
          embroideryCacheKey(job.src, job.widthMm, job.heightMm, job.settings, "full"),
        )
        .join("~"),
    [jobs],
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (!jobs.length) {
      setResults({});
      setBusy(false);
      return;
    }

    const keyFor = (job: ElementJob, quality: EmbroideryQuality) =>
      embroideryCacheKey(job.src, job.widthMm, job.heightMm, job.settings, quality);

    // Adopt anything already computed, best tier first.
    const known: Record<string, EmbroideryResult> = {};
    const missing: ElementJob[] = [];
    for (const job of jobs) {
      const full = readEmbroideryCache(keyFor(job, "full"));
      if (full) {
        known[job.elementId] = full;
        continue;
      }
      const preview = readEmbroideryCache(keyFor(job, "preview"));
      if (preview) known[job.elementId] = preview;
      missing.push(job);
    }
    if (!missing.length) {
      setResults(known);
      setBusy(false);
      return;
    }
    if (Object.keys(known).length) setResults((current) => ({ ...current, ...known }));
    setBusy(true);

    let cancelled = false;

    /**
     * Both tiers go through the worker client, which falls back to running
     * inline where `OffscreenCanvas` is unavailable. The cheap tier is NOT
     * special-cased onto the main thread: measured on a 21 cm placement it
     * cost 546 ms there, a visible freeze. "Cheap" was only ever true relative
     * to the full tier, not in absolute terms.
     */
    const runTier = async (quality: EmbroideryQuality) => {
      const settled: Record<string, EmbroideryResult> = {};
      await Promise.all(
        missing.map(async (job) => {
          const image = images[job.src];
          if (!image) return;
          const key = keyFor(job, quality);
          const hit = readEmbroideryCache(key);
          if (hit) {
            settled[job.elementId] = hit;
            return;
          }
          try {
            const result = await generateEmbroideryAsync({
              image,
              widthMm: job.widthMm,
              heightMm: job.heightMm,
              settings: job.settings,
              quality,
            });
            writeEmbroideryCache(key, result);
            settled[job.elementId] = result;
          } catch {
            // Keep whatever is on screen rather than blanking the artwork.
          }
        }),
      );
      if (cancelled || !Object.keys(settled).length) return;
      setResults((current) => ({ ...current, ...settled }));
    };

    timer.current = setTimeout(() => {
      void (async () => {
        await runTier("preview");
        if (cancelled) return;
        await runTier("full");
        if (cancelled) return;
        setBusy(false);
      })();
    }, RECOMPUTE_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // `signature` is the real dependency: it changes exactly when a stitch
    // would change. `jobs`/`images` are read through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, images]);

  // Persistent map canvases, redrawn in place. `mapsVersion` is how the
  // renderer learns it must re-upload them.
  const mapsRef = useRef<Record<string, SurfaceMaterialMaps>>({});
  const [mapsVersion, setMapsVersion] = useState(0);
  const [surfacesWithEmbroidery, setSurfacesWithEmbroidery] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const active: Record<string, boolean> = {};
    for (const surface of config.editableSurfaces) {
      const surfaceDesign = design.surfaces[surface.id];
      if (!surfaceDesign) {
        active[surface.id] = false;
        continue;
      }
      const target =
        mapsRef.current[surface.id] ??
        (mapsRef.current[surface.id] = createSurfaceMaterialMaps(surface));
      active[surface.id] = composeSurfaceMaterialMaps(
        surface,
        surfaceDesign.elements,
        results,
        target,
      );
    }
    setSurfacesWithEmbroidery(active);
    setMapsVersion((version) => version + 1);
  }, [config.editableSurfaces, design, results]);

  const notices = useMemo(() => {
    const seen = new Set<string>();
    for (const result of Object.values(results)) {
      for (const notice of result.notices) seen.add(notice);
    }
    return [...seen];
  }, [results]);

  const stitchCount = useMemo(
    () => Object.values(results).reduce((total, result) => total + result.stitchCount, 0),
    [results],
  );

  return {
    results,
    surfaceMaps: mapsRef.current,
    surfacesWithEmbroidery,
    mapsVersion,
    notices,
    busy,
    stitchCount,
  };
}
