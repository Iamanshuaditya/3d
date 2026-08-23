"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DesignDocument, ProductConfig } from "@/types/configurator";
import type { EmbroideryResult } from "@/types/embroidery";
import { generateEmbroidery, type EmbroideryQuality } from "./index";
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

const FULL_QUALITY_DELAY_MS = 280;

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

    const run = (quality: EmbroideryQuality) => {
      const next: Record<string, EmbroideryResult> = {};
      let generated = 0;
      for (const job of jobs) {
        const image = images[job.src];
        if (!image) continue;
        const key = embroideryCacheKey(job.src, job.widthMm, job.heightMm, job.settings, quality);
        const cached = readEmbroideryCache(key);
        if (cached) {
          next[job.elementId] = cached;
          continue;
        }
        const result = generateEmbroidery({
          image,
          widthMm: job.widthMm,
          heightMm: job.heightMm,
          settings: job.settings,
          quality,
        });
        writeEmbroideryCache(key, result);
        next[job.elementId] = result;
        generated += 1;
      }
      setResults(next);
      return generated;
    };

    if (!jobs.length) {
      setResults({});
      setBusy(false);
      return;
    }

    // Prefer an already-computed full pass; otherwise show the cheap one now.
    const haveFull = jobs.every((job) =>
      readEmbroideryCache(
        embroideryCacheKey(job.src, job.widthMm, job.heightMm, job.settings, "full"),
      ),
    );
    if (haveFull) {
      run("full");
      setBusy(false);
      return;
    }

    run("preview");
    setBusy(true);
    timer.current = setTimeout(() => {
      run("full");
      setBusy(false);
    }, FULL_QUALITY_DELAY_MS);

    return () => {
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
