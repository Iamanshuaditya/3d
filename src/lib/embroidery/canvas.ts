/**
 * Canvas creation, abstracted over where the pipeline is running.
 *
 * The stitch pipeline rasterises into canvases, and it has to work in two
 * places: on the main thread, where a canvas comes from `document`, and inside
 * a Web Worker, where there is no DOM and the equivalent is `OffscreenCanvas`.
 * Threading a factory through is what lets one implementation serve both
 * rather than maintaining a worker copy that can drift.
 */

/** Anything the compositor and the 2D editor can draw from. */
export type RasterSurface = HTMLCanvasElement | OffscreenCanvas;

export type CanvasFactory = (width: number, height: number) => RasterSurface;

/** Main-thread factory. */
export const domCanvasFactory: CanvasFactory = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/** Worker factory. */
export const offscreenCanvasFactory: CanvasFactory = (width, height) =>
  new OffscreenCanvas(width, height);

/**
 * `getContext("2d")` is typed per-surface and the two signatures do not
 * overlap, so the cast lives here once instead of at every call site.
 */
export function context2d(
  surface: RasterSurface,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = (surface as HTMLCanvasElement).getContext("2d", options);
  if (!ctx) throw new Error("2D canvas context is unavailable.");
  return ctx as CanvasRenderingContext2D;
}

/** True when the stitch pipeline can be moved off the main thread. */
export function supportsWorkerPipeline(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function"
  );
}
