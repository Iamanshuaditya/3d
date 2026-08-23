/// <reference lib="webworker" />
import { generateEmbroidery } from "./index";
import { offscreenCanvasFactory } from "./canvas";
import {
  payloadTransferables,
  type StitchPayload,
  type StitchRequest,
  type StitchResponse,
} from "./stitch-worker-protocol";

/**
 * Full-quality stitch generation, off the main thread.
 *
 * The pipeline itself is the same code the main thread runs — only the canvas
 * factory differs — so there is no second implementation to keep in sync. The
 * finished layers come back as `ImageBitmap`s, which transfer rather than
 * copy, so a megapixel of normal map costs a pointer move.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<StitchRequest>) => {
  const { id, bitmap, widthMm, heightMm, settings, quality } = event.data;

  try {
    const result = generateEmbroidery({
      image: bitmap,
      widthMm,
      heightMm,
      settings,
      quality,
      canvas: offscreenCanvasFactory,
    });

    // The pipeline drew into OffscreenCanvases; hand over their contents.
    const toBitmap = (surface: typeof result.colour) =>
      (surface as OffscreenCanvas).transferToImageBitmap();

    const payload: StitchPayload = {
      ...result,
      colour: toBitmap(result.colour),
      normal: toBitmap(result.normal),
      roughness: toBitmap(result.roughness),
      mask: toBitmap(result.mask),
    };

    const response: StitchResponse = { id, ok: true, payload };
    scope.postMessage(response, payloadTransferables(payload));
  } catch (error) {
    const response: StitchResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(response);
  } finally {
    // The bitmap was transferred to us, so releasing it is our job.
    bitmap.close();
  }
};
