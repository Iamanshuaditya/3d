import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  cropToFillFrame,
  cropZoom,
  setCropCenter,
  setCropZoom,
} from "@/lib/configurator/image-crop";
import {
  effectiveImagePpi,
  imageQualityState,
} from "@/lib/print/preflight";
import { parseDesignDocument } from "@/platform/projects/design-document";
import { renderSurfaceArtworkPng } from "@/server/rendering/render-surface-artwork";
import type {
  DesignDocument,
  EditableSurface,
  ImageElement,
} from "@/types/configurator";

const image: ImageElement = {
  id: "crop-image",
  type: "image",
  assetId: "crop-asset",
  sourcePixelWidth: 1200,
  sourcePixelHeight: 600,
  x: 0,
  y: 0,
  width: 600,
  height: 600,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
};

test("fill uses a centred aspect-preserving source window", () => {
  assert.deepEqual(cropToFillFrame(1200, 600, 600, 600), {
    x: 0.25,
    y: 0,
    width: 0.5,
    height: 1,
  });
  assert.deepEqual(cropToFillFrame(600, 1200, 600, 600), {
    x: 0,
    y: 0.25,
    width: 1,
    height: 0.5,
  });
});

test("crop zoom and pan remain inside the untouched source image", () => {
  const base = cropToFillFrame(1200, 600, 600, 600);
  const zoomed = setCropZoom(base, base, 2);
  assert.deepEqual(zoomed, { x: 0.375, y: 0.25, width: 0.25, height: 0.5 });
  assert.equal(cropZoom(base, zoomed), 2);
  assert.deepEqual(setCropCenter(zoomed, 0, 1), {
    x: 0,
    y: 0.5,
    width: 0.25,
    height: 0.5,
  });
});

test("effective PPI uses only source pixels retained by a crop", () => {
  const full = effectiveImagePpi(image, 600, 600, 50.8, 50.8);
  const cropped = effectiveImagePpi(
    { ...image, crop: cropToFillFrame(1200, 600, 600, 600) },
    600,
    600,
    50.8,
    50.8,
  );
  assert.ok(full && cropped);
  assert.equal(Math.round(full.x), 600);
  assert.equal(Math.round(full.y), 300);
  assert.equal(Math.round(cropped.x), 300);
  assert.equal(Math.round(cropped.y), 300);
  assert.equal(imageQualityState(cropped, 200, 300), "good");
  assert.equal(imageQualityState({ x: 250, y: 250, minimum: 250 }, 200, 300), "warning");
  assert.equal(imageQualityState({ x: 150, y: 150, minimum: 150 }, 200, 300), "poor");
  assert.equal(imageQualityState(null, 200, 300), "unknown");
});

test("crop state is validated and remains optional for older documents", () => {
  const document: DesignDocument = {
    productId: "crop-product",
    surfaces: {
      front: {
        background: null,
        elements: [{ ...image, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } }],
      },
    },
  };
  assert.deepEqual(
    (parseDesignDocument(document).surfaces.front.elements[0] as ImageElement).crop,
    { x: 0.25, y: 0, width: 0.5, height: 1 },
  );
  const invalid = structuredClone(document);
  (invalid.surfaces.front.elements[0] as ImageElement).crop = {
    x: 0.75,
    y: 0,
    width: 0.5,
    height: 1,
  };
  assert.throws(() => parseDesignDocument(invalid), /crop falls outside/);
  delete (document.surfaces.front.elements[0] as ImageElement).crop;
  assert.equal((parseDesignDocument(document).surfaces.front.elements[0] as ImageElement).crop, undefined);
});

test("server production rendering applies the same normalized crop without changing the asset", async () => {
  const sourcePixels = Buffer.from([
    255, 0, 0, 255,
    0, 0, 255, 255,
  ]);
  const source = await sharp(sourcePixels, {
    raw: { width: 2, height: 1, channels: 4 },
  }).png().toBuffer();
  const sourceBefore = Buffer.from(source);
  const surface: EditableSurface = {
    id: "front",
    label: "Front",
    meshName: "front",
    editorWidth: 100,
    editorHeight: 100,
    physicalWidthCm: 2.54,
    physicalHeightCm: 2.54,
  };
  const output = await renderSurfaceArtworkPng({
    design: {
      background: "#ffffff",
      elements: [
        {
          ...image,
          sourcePixelWidth: 2,
          sourcePixelHeight: 1,
          width: 100,
          height: 100,
          crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
        },
      ],
    },
    surface,
    pixelWidth: 10,
    pixelHeight: 10,
    maximumRasterPixels: 1_000,
    resolveImage: async () => ({ bytes: source, mimeType: "image/png" }),
  });
  const rendered = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  const center = (5 * rendered.info.width + 5) * rendered.info.channels;
  assert.ok(rendered.data[center] < 20, "red half is excluded");
  assert.ok(rendered.data[center + 2] > 235, "blue half fills the frame");
  assert.deepEqual(source, sourceBefore, "rendering does not rewrite the uploaded asset");
});
