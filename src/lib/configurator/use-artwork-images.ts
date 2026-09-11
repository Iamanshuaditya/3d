"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignDocument } from "@/types/configurator";
import { currentEditorSessionId, embedRequestHeaders } from "@/lib/embed/embed-request-context";

async function loadArtwork(src: string): Promise<HTMLImageElement> {
  const url = new URL(src, window.location.origin);
  let objectUrl: string | null = null;
  try {
    // Third-party cookies may be unavailable. Send the capability only to our
    // owned asset endpoint, never to an external artwork URL.
    if (currentEditorSessionId() && url.origin === window.location.origin
      && /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/content$/.test(url.pathname)) {
      const response = await fetch(url, { headers: embedRequestHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("Artwork could not be loaded.");
      objectUrl = URL.createObjectURL(await response.blob());
    }
    return await new Promise((resolve, reject) => {
      const image = new window.Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Artwork could not be decoded."));
      image.src = objectUrl ?? src;
    });
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Decoded artwork, keyed by source URL and shared across the whole customizer.
 *
 * Both the 2D editor and the embroidery pipeline need the decoded bitmap; two
 * separate loaders would decode every upload twice and could disagree about
 * which assets are ready.
 */
export function useArtworkImages(design: DesignDocument): Record<string, HTMLImageElement> {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const requests = useRef(new Map<string, Promise<HTMLImageElement>>());
  const sourcesKey = JSON.stringify([...new Set(Object.values(design.surfaces).flatMap((surface) =>
    surface.elements.flatMap((element) => element.type === "image" && element.src ? [element.src] : []),
  ))].sort());

  useEffect(() => {
    const sources = JSON.parse(sourcesKey) as string[];
    let cancelled = false;
    void Promise.all(sources.map(async (src) => {
      let request = requests.current.get(src);
      if (!request) {
        request = loadArtwork(src);
        requests.current.set(src, request);
      }
      try {
        return [src, await request] as const;
      } catch {
        requests.current.delete(src);
        return null;
      }
    })).then((loaded) => {
      if (cancelled) return;
      const next: Record<string, HTMLImageElement> = {};
      for (const entry of loaded) if (entry) next[entry[0]] = entry[1];
      if (Object.keys(next).length) setImages((previous) => ({ ...previous, ...next }));
    });

    return () => {
      cancelled = true;
    };
  }, [sourcesKey]);

  return images;
}
