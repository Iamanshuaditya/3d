import { test } from "node:test";
import assert from "node:assert/strict";
import { rasterSize } from "@/lib/embroidery/preprocess";
import { MAX_PIXELS, PX_PER_MM } from "@/lib/embroidery";
import { payloadTransferables } from "@/lib/embroidery/stitch-worker-protocol";
import { supportsWorkerPipeline } from "@/lib/embroidery/canvas";

/**
 * The stitch pipeline's cost is linear in raster area, so the raster-sizing
 * decision is what bounds it. These assertions are the reason the preview tier
 * cannot silently become as expensive as the full one — which is exactly what
 * had happened: a 21 cm placement cost 546 ms on the main thread because the
 * "cheap" tier had no ceiling.
 */

test("resolution is requested in physical units", () => {
  const { width, height, pxPerMm } = rasterSize(100, 50, 8, 10_000_000);
  assert.equal(pxPerMm, 8, "an unconstrained raster keeps the requested density");
  assert.equal(width, 800);
  assert.equal(height, 400);
});

test("an oversized placement degrades resolution instead of blowing up", () => {
  const cap = 420_000;
  const { width, height, pxPerMm } = rasterSize(400, 300, 8, cap);
  assert.ok(width * height <= cap * 1.01, `${width}x${height} exceeds the ceiling`);
  assert.ok(pxPerMm < 8, "density should have been reduced");
  // Aspect ratio must survive, or the artwork would be distorted.
  assert.ok(Math.abs(width / height - 400 / 300) < 0.02);
});

test("the preview tier stays bounded for any placement a garment can hold", () => {
  // A logo spanning a whole 40 x 50 cm print panel is the realistic worst case.
  const preview = rasterSize(400, 500, PX_PER_MM.preview, MAX_PIXELS.preview);
  assert.ok(
    preview.width * preview.height <= MAX_PIXELS.preview * 1.01,
    `preview raster ${preview.width}x${preview.height} is unbounded`,
  );
  const full = rasterSize(400, 500, PX_PER_MM.full, MAX_PIXELS.full);
  assert.ok(
    preview.width * preview.height * 4 < full.width * full.height,
    "the preview tier must be substantially cheaper than the full tier",
  );
});

test("a tiny placement still gets a usable raster", () => {
  const { width, height } = rasterSize(0.2, 0.2, 8, 420_000);
  assert.ok(width >= 4 && height >= 4, "must not collapse to a zero-area raster");
});

// -------------------------------------------------------------- worker wire

test("every heavy layer in a worker payload is transferred, not copied", () => {
  const bitmap = { close() {} } as unknown as ImageBitmap;
  const payload = {
    colour: bitmap,
    normal: bitmap,
    roughness: bitmap,
    mask: bitmap,
    runs: [
      { colour: "#000000", segments: new Float32Array([0, 0, 1, 1]) },
      { colour: "#ffffff", segments: new Float32Array([2, 2, 3, 3]) },
    ],
  } as never;

  const transfers = payloadTransferables(payload);
  // Four bitmaps plus one buffer per thread colour: a megapixel normal map
  // costs a pointer move rather than a structured-clone copy.
  assert.equal(transfers.length, 6);
  assert.ok(transfers.filter((t) => t instanceof ArrayBuffer).length === 2);
});

test("the worker path is correctly reported as unavailable without OffscreenCanvas", () => {
  // Node has no OffscreenCanvas, which is the same condition an older browser
  // presents — and the client must fall back rather than throw.
  assert.equal(supportsWorkerPipeline(), false);
});
