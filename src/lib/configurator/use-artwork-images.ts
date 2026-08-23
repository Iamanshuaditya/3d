"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignDocument } from "@/types/configurator";

/**
 * Decoded artwork, keyed by source URL and shared across the whole customizer.
 *
 * Both the 2D editor and the embroidery pipeline need the decoded bitmap; two
 * separate loaders would decode every upload twice and could disagree about
 * which assets are ready.
 */
export function useArtworkImages(design: DesignDocument): Record<string, HTMLImageElement> {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sources = Object.values(design.surfaces).flatMap((surface) =>
      surface.elements
        .filter((element) => element.type === "image")
        .map((element) => (element as { src: string }).src),
    );
    const pending = sources.filter((src) => !requested.current.has(src));
    if (!pending.length) return;
    pending.forEach((src) => requested.current.add(src));

    let cancelled = false;
    Promise.all(
      pending.map(
        (src) =>
          new Promise<[string, HTMLImageElement] | null>((resolve) => {
            const image = new window.Image();
            image.crossOrigin = "anonymous";
            image.onload = () => resolve([src, image]);
            image.onerror = () => resolve(null);
            image.src = src;
          }),
      ),
    ).then((loaded) => {
      if (cancelled) return;
      const next: Record<string, HTMLImageElement> = {};
      for (const entry of loaded) if (entry) next[entry[0]] = entry[1];
      if (Object.keys(next).length) setImages((previous) => ({ ...previous, ...next }));
    });

    return () => {
      cancelled = true;
    };
  }, [design]);

  return images;
}
