import type { EmbroideryResult, EmbroiderySettings } from "@/types/embroidery";
import type { EmbroideryQuality } from "./index";

/**
 * Memoisation for the stitch pipeline.
 *
 * The key deliberately omits position and rotation: moving or turning a placed
 * logo does not change one stitch, only where the finished patch is drawn. So
 * dragging and rotating are free, and only a genuine change — a different
 * asset, different settings, or a different PHYSICAL size — recomputes.
 * Physical size is quantised to a quarter-millimetre so nudging a resize
 * handle reuses the previous result instead of thrashing.
 */

const MAX_ENTRIES = 24;
const cache = new Map<string, EmbroideryResult>();

/** FNV-1a over the asset URL; data URLs are long and are not worth keeping twice. */
function hashSource(src: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + ":" + src.length.toString(36);
}

export function embroideryCacheKey(
  src: string,
  widthMm: number,
  heightMm: number,
  settings: EmbroiderySettings,
  quality: EmbroideryQuality,
): string {
  const quantise = (value: number) => Math.round(value * 4) / 4;
  return [
    hashSource(src),
    quantise(widthMm),
    quantise(heightMm),
    quality,
    settings.densityMm,
    settings.threadWidthMm,
    settings.stitchLengthMm,
    settings.maxColours,
    settings.sheen,
    settings.satinMaxWidthMm,
    settings.reliefMm,
  ].join("|");
}

export function readEmbroideryCache(key: string): EmbroideryResult | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  // Refresh recency.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function writeEmbroideryCache(key: string, result: EmbroideryResult): void {
  cache.set(key, result);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function clearEmbroideryCache(): void {
  cache.clear();
}
