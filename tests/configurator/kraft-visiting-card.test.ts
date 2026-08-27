import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import * as THREE from "three";
import {
  artworkMmToCardUv,
  cardUvToArtworkUv,
  deriveFlatSheetGeometry,
  editorPxToMm,
  mmToEditorPx,
} from "@/lib/configurator/flat-sheet";
import {
  artworkMmToCardPosition,
  configureFlatSheetPreviewTexture,
  createFlatSheetFrontGeometry,
  flatSheetSceneDimensions,
} from "@/lib/configurator/flat-sheet-mesh";
import {
  KRAFT_VISITING_CARD_ID,
  KRAFT_VISITING_CARD_SPEC,
  kraftVisitingCardProduct,
} from "@/lib/configurator/kraft-visiting-card-spec";
import { PRODUCTS } from "@/lib/configurator/product-config";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import { createEmptyDocument } from "@/lib/configurator/design-state";
import { generateProductionPdf, productionPageBoxesMm } from "@/lib/print/generate-production-pdf";
import { normalizePrintJob } from "@/lib/print/normalize-job";
import { pixelsForMm } from "@/lib/print/physical-resolution";
import { validateResolvedProductContract } from "@/server/products/product-contract-validator";

const spec = KRAFT_VISITING_CARD_SPEC;
const geometry = deriveFlatSheetGeometry(spec);
const surface = kraftVisitingCardProduct.editableSurfaces[0];

test("visiting-card physical geometry is derived from trim, bleed, and safe inset", () => {
  assert.equal(geometry.fullWidthMm, spec.trimWidthMm + 2 * spec.bleedMm);
  assert.equal(geometry.fullHeightMm, spec.trimHeightMm + 2 * spec.bleedMm);
  assert.equal(geometry.fullWidthMm, 94.9);
  assert.equal(geometry.fullHeightMm, 56.8);
  assert.deepEqual(geometry.trimBoxMm, { x: 3, y: 3, width: 88.9, height: 50.8 });
  assert.deepEqual(geometry.safeAreaBoxMm, { x: 6, y: 6, width: 82.9, height: 44.8 });
  assert.equal(geometry.safeAreaBoxMm.x - geometry.trimBoxMm.x, 3);
  assert.equal(geometry.safeAreaBoxMm.y - geometry.trimBoxMm.y, 3);
  assert.equal(
    geometry.trimBoxMm.x + geometry.trimBoxMm.width -
      (geometry.safeAreaBoxMm.x + geometry.safeAreaBoxMm.width),
    3,
  );
  assert.equal(
    geometry.trimBoxMm.y + geometry.trimBoxMm.height -
      (geometry.safeAreaBoxMm.y + geometry.safeAreaBoxMm.height),
    3,
  );
});

test("the registered product and editor retain one physical coordinate scale", () => {
  assert.equal(PRODUCTS[KRAFT_VISITING_CARD_ID], kraftVisitingCardProduct);
  assert.equal(kraftVisitingCardProduct.family, "flat-sheet");
  assert.equal(kraftVisitingCardProduct.flatSheetSpec, spec);
  assert.equal(surface.editorWidth, 949);
  assert.equal(surface.editorHeight, 568);
  assert.equal(surface.physicalWidthCm * 10, 94.9);
  assert.equal(surface.physicalHeightCm * 10, 56.8);
  assert.equal(editorPxToMm(mmToEditorPx(37.25, spec.editorPxPerMm), spec.editorPxPerMm), 37.25);
  assert.deepEqual(validateResolvedProductContract(kraftVisitingCardProduct, "2d-3d-split"), []);
});

test("3D card proportions and explicit front UVs match the physical trim without mirroring", () => {
  const dimensions = flatSheetSceneDimensions(spec);
  assert.equal(dimensions.width / dimensions.height, spec.trimWidthMm / spec.trimHeightMm);
  assert.equal(dimensions.thickness, spec.previewThicknessMm * 0.01);

  const front = createFlatSheetFrontGeometry(spec);
  const uv = Array.from(front.getAttribute("uv").array);
  const position = Array.from(front.getAttribute("position").array);
  assert.deepEqual(uv.slice(0, 6), [0, 1, 0, 0, 1, 0]);
  assert.deepEqual(uv.slice(-6), [0, 1, 1, 0, 1, 1]);
  assert.ok(Math.abs(position[0] + dimensions.width / 2) < 1e-7);
  assert.ok(Math.abs(position[1] - dimensions.height / 2) < 1e-7);
  assert.ok(Math.abs(position[position.length - 3] - dimensions.width / 2) < 1e-7);
  assert.ok(Math.abs(position[position.length - 2] - dimensions.height / 2) < 1e-7);
  front.dispose();
});

test("editor centre and trim corners map to the same 3D card locations", () => {
  const centreMm = {
    x: spec.bleedMm + spec.trimWidthMm / 2,
    y: spec.bleedMm + spec.trimHeightMm / 2,
  };
  assert.deepEqual(artworkMmToCardUv(spec, centreMm), { u: 0.5, v: 0.5 });
  assert.deepEqual(artworkMmToCardPosition(spec, centreMm), { x: 0, y: 0 });

  const topLeft = { x: spec.bleedMm, y: spec.bleedMm };
  const bottomRight = {
    x: spec.bleedMm + spec.trimWidthMm,
    y: spec.bleedMm + spec.trimHeightMm,
  };
  assert.deepEqual(artworkMmToCardUv(spec, topLeft), { u: 0, v: 1 });
  assert.deepEqual(artworkMmToCardUv(spec, bottomRight), { u: 1, v: 0 });
  const dimensions = flatSheetSceneDimensions(spec);
  assert.deepEqual(artworkMmToCardPosition(spec, topLeft), {
    x: -dimensions.width / 2,
    y: dimensions.height / 2,
  });
  assert.deepEqual(artworkMmToCardPosition(spec, bottomRight), {
    x: dimensions.width / 2,
    y: -dimensions.height / 2,
  });
});

test("3D preview samples only the trim window, excluding bleed-only artwork", () => {
  const texture = new THREE.CanvasTexture({} as HTMLCanvasElement);
  configureFlatSheetPreviewTexture(texture, spec);
  assert.equal(texture.offset.x, 3 / 94.9);
  assert.equal(texture.offset.y, 3 / 56.8);
  assert.equal(texture.repeat.x, 88.9 / 94.9);
  assert.equal(texture.repeat.y, 50.8 / 56.8);

  const topLeft = cardUvToArtworkUv(spec, { u: 0, v: 1 });
  const bottomRight = cardUvToArtworkUv(spec, { u: 1, v: 0 });
  assert.equal(topLeft.u, 3 / 94.9);
  assert.ok(Math.abs(topLeft.v - 53.8 / 56.8) < 1e-12);
  assert.ok(Math.abs(bottomRight.u - 91.9 / 94.9) < 1e-12);
  assert.equal(bottomRight.v, 3 / 56.8);
  assert.ok(artworkMmToCardUv(spec, { x: 1, y: 20 }).u < 0);
  assert.ok(artworkMmToCardUv(spec, { x: 93, y: 20 }).u > 1);
  texture.dispose();
});

test("dieline and print export retain full bleed while declaring the exact trim box", () => {
  const dieline = resolveSurfaceDieline(kraftVisitingCardProduct, surface);
  assert.deepEqual(dieline.cuts[0].points, [30, 30, 919, 30, 919, 538, 30, 538]);
  const job = normalizePrintJob(
    kraftVisitingCardProduct,
    createEmptyDocument(kraftVisitingCardProduct),
  );
  assert.equal(job.surfaces[0].surface.physicalWidthCm * 10, 94.9);
  assert.equal(job.surfaces[0].surface.physicalHeightCm * 10, 56.8);
  assert.deepEqual(productionPageBoxesMm(surface), {
    media: { x: 0, y: 0, width: 94.9, height: 56.8 },
    bleed: { x: 0, y: 0, width: 94.9, height: 56.8 },
    trim: { x: 3, y: 3, width: 88.9, height: 50.8 },
    art: { x: 3, y: 3, width: 88.9, height: 50.8 },
  });
  assert.equal(pixelsForMm(94.9, 300), 1121);
  assert.equal(pixelsForMm(56.8, 300), 671);
  assert.equal(pixelsForMm(88.9, 300), 1050);
  assert.equal(pixelsForMm(50.8, 300), 600);
});

test("generated PDF uses the bleed page and inset physical trim box", async () => {
  const job = normalizePrintJob(
    kraftVisitingCardProduct,
    createEmptyDocument(kraftVisitingCardProduct),
  );
  const png = Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XxO1WQAAAABJRU5ErkJggg==",
    "base64",
  ));
  const result = await generateProductionPdf(job, {
    renderArtwork: async () => ({ pngBytes: png, pixelWidth: 1121, pixelHeight: 671 }),
  });
  const pdf = await PDFDocument.load(result.bytes);
  const page = pdf.getPage(0);
  const pointsPerMm = 72 / 25.4;
  const media = page.getMediaBox();
  const trim = page.getTrimBox();
  assert.ok(Math.abs(media.width / pointsPerMm - 94.9) < 0.001);
  assert.ok(Math.abs(media.height / pointsPerMm - 56.8) < 0.001);
  assert.ok(Math.abs(trim.x / pointsPerMm - 3) < 0.001);
  assert.ok(Math.abs(trim.y / pointsPerMm - 3) < 0.001);
  assert.ok(Math.abs(trim.width / pointsPerMm - 88.9) < 0.001);
  assert.ok(Math.abs(trim.height / pointsPerMm - 50.8) < 0.001);
});
