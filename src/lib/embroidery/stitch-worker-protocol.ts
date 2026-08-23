import type { EmbroideryResult, EmbroiderySettings, ThreadRun } from "@/types/embroidery";
import type { EmbroideryQuality } from "./index";

/**
 * The wire format between the studio and the stitch worker.
 *
 * Kept in its own module so the worker and its client cannot drift, and so
 * importing the protocol never drags the worker's code into the main bundle.
 */

export type StitchRequest = {
  id: number;
  /** Transferred; the worker takes ownership and closes it when done. */
  bitmap: ImageBitmap;
  widthMm: number;
  heightMm: number;
  settings: EmbroiderySettings;
  quality: EmbroideryQuality;
};

/** `EmbroideryResult` with its canvases replaced by transferable bitmaps. */
export type StitchPayload = Omit<
  EmbroideryResult,
  "colour" | "normal" | "roughness" | "mask"
> & {
  colour: ImageBitmap;
  normal: ImageBitmap;
  roughness: ImageBitmap;
  mask: ImageBitmap;
};

export type StitchResponse =
  | { id: number; ok: true; payload: StitchPayload }
  | { id: number; ok: false; error: string };

/** Everything in a payload that can move rather than copy. */
export function payloadTransferables(payload: StitchPayload): Transferable[] {
  return [
    payload.colour,
    payload.normal,
    payload.roughness,
    payload.mask,
    ...payload.runs.map((run: ThreadRun) => run.segments.buffer as ArrayBuffer),
  ];
}
