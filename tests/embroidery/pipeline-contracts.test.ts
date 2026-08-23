import { test } from "node:test";
import assert from "node:assert/strict";
import type { EditableSurface, ImageElement } from "@/types/configurator";
import { DEFAULT_EMBROIDERY } from "@/types/embroidery";
import { elementPhysicalSizeMm } from "@/lib/embroidery/compose-surface-maps";
import {
  clearEmbroideryCache,
  embroideryCacheKey,
  readEmbroideryCache,
  writeEmbroideryCache,
} from "@/lib/embroidery/cache";
import { quantize } from "@/lib/embroidery/quantize";
import { planStitches } from "@/lib/embroidery/stitch-plan";
import { PRODUCTS } from "@/lib/configurator/product-config";

const surface = (editorWidth: number, editorHeight: number): EditableSurface => ({
  id: "s",
  label: "s",
  meshName: "M",
  editorWidth,
  editorHeight,
  physicalWidthCm: 30,
  physicalHeightCm: 20,
});

const image = (patch: Partial<ImageElement>): ImageElement => ({
  id: "e",
  type: "image",
  src: "blob:x",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  ...patch,
});

// ------------------------------------------------------- physical placement

test("a logo's physical size is independent of the surface's pixel resolution", () => {
  // The same artwork covering the same fraction of the same physical panel,
  // authored on a 1024px canvas and on a 4096px canvas.
  const small = elementPhysicalSizeMm(
    surface(1024, 683),
    image({ width: 1024 / 6, height: 1024 / 6 }),
  );
  const large = elementPhysicalSizeMm(
    surface(4096, 2731),
    image({ width: 4096 / 6, height: 4096 / 6 }),
  );
  assert.ok(Math.abs(small.widthMm - large.widthMm) < 0.01, `${small.widthMm} vs ${large.widthMm}`);
  assert.equal(Math.round(small.widthMm), 50, "a sixth of a 30cm panel is 5cm");
});

test("scale handles feed straight into physical size", () => {
  const s = surface(1200, 800);
  const base = elementPhysicalSizeMm(s, image({ width: 300, height: 200 }));
  const scaled = elementPhysicalSizeMm(s, image({ width: 300, height: 200, scaleX: 2, scaleY: 2 }));
  assert.ok(Math.abs(scaled.widthMm - base.widthMm * 2) < 1e-6);
  // Mirroring an element must not produce negative millimetres.
  const flipped = elementPhysicalSizeMm(s, image({ width: 300, height: 200, scaleX: -1 }));
  assert.ok(flipped.widthMm > 0);
});

// -------------------------------------------------------------------- cache

test("moving or rotating a logo does not invalidate its stitching", () => {
  const key = (patch: Partial<{ w: number; h: number }>) =>
    embroideryCacheKey("blob:a", patch.w ?? 50, patch.h ?? 50, DEFAULT_EMBROIDERY, "full");
  // Position and rotation are not part of the key at all — that is the point.
  assert.equal(key({}), key({}));
  assert.notEqual(key({}), key({ w: 80 }));
  // Sub-quarter-millimetre nudges of a resize handle reuse the same entry.
  assert.equal(key({ w: 50 }), key({ w: 50.1 }));
  assert.notEqual(key({ w: 50 }), key({ w: 51 }));
});

test("changing any embroidery setting invalidates the cache", () => {
  const base = embroideryCacheKey("blob:a", 50, 50, DEFAULT_EMBROIDERY, "full");
  for (const patch of [
    { densityMm: 0.6 },
    { threadWidthMm: 0.5 },
    { stitchLengthMm: 3 },
    { maxColours: 4 },
    { sheen: 0.9 },
    { satinMaxWidthMm: 9 },
    { reliefMm: 1.2 },
  ]) {
    assert.notEqual(
      base,
      embroideryCacheKey("blob:a", 50, 50, { ...DEFAULT_EMBROIDERY, ...patch }, "full"),
      `${Object.keys(patch)[0]} did not change the key`,
    );
  }
  assert.notEqual(base, embroideryCacheKey("blob:a", 50, 50, DEFAULT_EMBROIDERY, "preview"));
  assert.notEqual(base, embroideryCacheKey("blob:b", 50, 50, DEFAULT_EMBROIDERY, "full"));
});

test("the cache evicts oldest-first and can be cleared", () => {
  clearEmbroideryCache();
  const fake = { stitchCount: 1 } as never;
  for (let i = 0; i < 40; i += 1) writeEmbroideryCache(`k${i}`, fake);
  assert.equal(readEmbroideryCache("k0"), undefined, "the oldest entry should be gone");
  assert.ok(readEmbroideryCache("k39"), "the newest entry should survive");
  clearEmbroideryCache();
  assert.equal(readEmbroideryCache("k39"), undefined);
});

// -------------------------------------------------------------- capability

test("only surfaces that declare it offer embroidery", () => {
  const garment = PRODUCTS["tshirt"].editableSurfaces[0];
  assert.deepEqual(garment.renderModes, ["print", "embroidery"]);
  for (const id of ["mailer-box-001", "pouch-001", "mug", "soda-can", "burger-box-001"]) {
    for (const s of PRODUCTS[id].editableSurfaces) {
      assert.ok(
        !s.renderModes || s.renderModes.length < 2,
        `${id}/${s.id} unexpectedly offers a reproduction choice`,
      );
    }
  }
});

// ------------------------------------------------------------- performance

test("a full-quality 10cm logo plans in a workable time", () => {
  // 10 cm at the full tier's 8 px/mm — the heaviest realistic single element.
  const pxPerMm = 8;
  const size = 100 * pxPerMm;
  const rgba = new Uint8ClampedArray(size * size * 4);
  const centre = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const inside = (x - centre) ** 2 + (y - centre) ** 2 < (centre * 0.92) ** 2;
      rgba[i] = x > centre ? 210 : 30;
      rgba[i + 1] = 40;
      rgba[i + 2] = y > centre ? 190 : 60;
      rgba[i + 3] = inside ? 255 : 0;
    }
  }

  const started = performance.now();
  const { palette, indices } = quantize(rgba, size, size, DEFAULT_EMBROIDERY.maxColours);
  const plan = planStitches(indices, palette, size, size, {
    densityPx: DEFAULT_EMBROIDERY.densityMm * pxPerMm,
    stitchLengthPx: DEFAULT_EMBROIDERY.stitchLengthMm * pxPerMm,
    satinMaxWidthPx: DEFAULT_EMBROIDERY.satinMaxWidthMm * pxPerMm,
    fillAngleRad: Math.PI / 4,
    maxStitches: 160_000,
  });
  const elapsed = performance.now() - started;

  console.log(
    `      full-quality plan: ${plan.stitchCount.toLocaleString()} stitches ` +
      `over ${palette.length} threads in ${elapsed.toFixed(0)}ms`,
  );
  assert.ok(plan.stitchCount > 5_000, "a 10cm disc should carry real coverage");
  // Generous ceiling: this runs off the interaction path, behind a debounce.
  assert.ok(elapsed < 8_000, `stitch planning took ${elapsed.toFixed(0)}ms`);
});
