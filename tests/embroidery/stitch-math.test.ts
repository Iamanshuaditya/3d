import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceInside, maxFilter } from "@/lib/embroidery/edt";
import { buildStitchField } from "@/lib/embroidery/stitch-field";
import { planStitches } from "@/lib/embroidery/stitch-plan";
import { quantize, TRANSPARENT_INDEX } from "@/lib/embroidery/quantize";

// --------------------------------------------------------------- primitives

test("the distance transform reports true distance to the shape edge", () => {
  const width = 41;
  const height = 41;
  const mask = new Uint8Array(width * height);
  for (let y = 5; y < 36; y += 1) for (let x = 5; x < 36; x += 1) mask[y * width + x] = 1;

  const distance = distanceInside(mask, width, height);
  // Centre of a 31x31 square: 15 pixels to the nearest edge, +1 because the
  // first empty pixel is one step beyond the last filled one.
  assert.equal(Math.round(distance[20 * width + 20]), 16);
  assert.equal(distance[0], 0, "outside the shape the distance is zero");
  assert.equal(Math.round(distance[20 * width + 5]), 1, "edge pixels sit one step in");
});

test("the O(n) running max filter matches a naive window scan", () => {
  const width = 37;
  const height = 29;
  const source = new Float32Array(width * height);
  for (let i = 0; i < source.length; i += 1) source[i] = Math.abs(Math.sin(i * 1.7)) * 10;

  const radius = 6;
  const fast = maxFilter(source, width, height, radius);

  const naive = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let best = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          best = Math.max(best, source[ny * width + nx]);
        }
      }
      naive[y * width + x] = best;
    }
  }
  for (let i = 0; i < naive.length; i += 1) {
    assert.ok(Math.abs(fast[i] - naive[i]) < 1e-4, `mismatch at ${i}`);
  }
});

// ------------------------------------------------------------- stitch field

test("narrow strokes get satin stitches laid across the stroke", () => {
  // A vertical bar 8px wide: threads must run horizontally, across it.
  const width = 60;
  const height = 60;
  const mask = new Uint8Array(width * height);
  for (let y = 6; y < 54; y += 1) for (let x = 26; x < 34; x += 1) mask[y * width + x] = 1;

  const field = buildStitchField(mask, width, height, {
    satinMaxWidthPx: 14,
    fillAngleRad: Math.PI / 4,
  });
  const angle = field.angle[30 * width + 28];
  // Horizontal is 0 or pi; allow either sense of the same axis.
  const acrossness = Math.abs(Math.cos(angle));
  assert.ok(acrossness > 0.9, `stitches should run across the bar (got ${angle})`);
});

test("broad areas fall back to the house fill angle", () => {
  const width = 90;
  const height = 90;
  const mask = new Uint8Array(width * height);
  for (let y = 5; y < 85; y += 1) for (let x = 5; x < 85; x += 1) mask[y * width + x] = 1;

  const fillAngle = Math.PI / 4;
  const field = buildStitchField(mask, width, height, {
    satinMaxWidthPx: 8,
    fillAngleRad: fillAngle,
  });
  const angle = field.angle[45 * width + 45];
  assert.ok(Math.abs(Math.cos(angle - fillAngle)) > 0.98, `expected fill angle, got ${angle}`);
});

// ----------------------------------------------------------------- planning

function discMask(width: number, height: number, radius: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 < radius * radius;
      const i = (y * width + x) * 4;
      rgba[i] = 20;
      rgba[i + 1] = 30;
      rgba[i + 2] = 40;
      rgba[i + 3] = inside ? 255 : 0;
    }
  }
  return rgba;
}

test("no stitch lands outside the artwork's alpha", () => {
  const width = 120;
  const height = 120;
  const { palette, indices } = quantize(discMask(width, height, 46), width, height, 4);
  const plan = planStitches(indices, palette, width, height, {
    densityPx: 3.6,
    stitchLengthPx: 18,
    satinMaxWidthPx: 40,
    fillAngleRad: Math.PI / 4,
    maxStitches: 500_000,
  });

  assert.ok(plan.stitchCount > 100, "the disc should be filled with stitches");
  for (const run of plan.runs) {
    for (let i = 0; i < run.segments.length; i += 2) {
      const x = Math.round(run.segments[i]);
      const y = Math.round(run.segments[i + 1]);
      assert.ok(
        x >= 0 && y >= 0 && x < width && y < height &&
          indices[y * width + x] !== TRANSPARENT_INDEX,
        `stitch endpoint (${x}, ${y}) is outside the artwork`,
      );
    }
  }
});

test("stitch scale follows physical size, not raster resolution", () => {
  // The same 30mm disc rasterised at two very different resolutions must
  // produce the same stitch length and the same stitch count in millimetres.
  const diameterMm = 30;
  const measure = (pxPerMm: number) => {
    const size = Math.round(diameterMm * pxPerMm);
    const rgba = discMask(size, size, (size / 2) * 0.94);
    const { palette, indices } = quantize(rgba, size, size, 4);
    const plan = planStitches(indices, palette, size, size, {
      densityPx: 0.45 * pxPerMm,
      stitchLengthPx: 2.6 * pxPerMm,
      satinMaxWidthPx: 6 * pxPerMm,
      fillAngleRad: Math.PI / 4,
      maxStitches: 5_000_000,
    });
    let total = 0;
    let count = 0;
    for (const run of plan.runs) {
      for (let i = 0; i < run.segments.length; i += 4) {
        total += Math.hypot(
          run.segments[i + 2] - run.segments[i],
          run.segments[i + 3] - run.segments[i + 1],
        ) / pxPerMm;
        count += 1;
      }
    }
    return { count, meanLengthMm: total / count };
  };

  const coarse = measure(4);
  const fine = measure(12);
  const countRatio = fine.count / coarse.count;
  assert.ok(
    countRatio > 0.9 && countRatio < 1.1,
    `stitch count should be resolution independent (ratio ${countRatio.toFixed(3)})`,
  );
  assert.ok(
    Math.abs(fine.meanLengthMm - coarse.meanLengthMm) < 0.25,
    `mean stitch length drifted: ${coarse.meanLengthMm.toFixed(2)}mm vs ${fine.meanLengthMm.toFixed(2)}mm`,
  );
  assert.ok(
    fine.meanLengthMm > 1.4 && fine.meanLengthMm < 2.7,
    `mean stitch length ${fine.meanLengthMm.toFixed(2)}mm should sit near the 2.6mm request`,
  );
});

test("the planner thins uniformly instead of exceeding its stitch ceiling", () => {
  const size = 260;
  const rgba = discMask(size, size, 125);
  const { palette, indices } = quantize(rgba, size, size, 4);
  const plan = planStitches(indices, palette, size, size, {
    densityPx: 2,
    stitchLengthPx: 8,
    satinMaxWidthPx: 30,
    fillAngleRad: Math.PI / 4,
    maxStitches: 2_000,
  });
  assert.ok(plan.effectiveDensityPx > 2, "density should have been relaxed");
  assert.ok(plan.stitchCount < 6_000, `expected thinning, got ${plan.stitchCount} stitches`);
});

// --------------------------------------------------------------- quantizing

test("colour reduction respects the thread budget and keeps transparency", () => {
  const width = 40;
  const height = 40;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const colours = [
    [200, 20, 40], [20, 120, 200], [240, 200, 20], [30, 160, 90],
    [140, 60, 200], [250, 120, 30], [10, 10, 10], [250, 250, 250],
  ];
  for (let i = 0; i < width * height; i += 1) {
    const c = colours[i % colours.length];
    rgba[i * 4] = c[0];
    rgba[i * 4 + 1] = c[1];
    rgba[i * 4 + 2] = c[2];
    rgba[i * 4 + 3] = i < 200 ? 0 : 255;
  }
  const { palette, indices, assessment } = quantize(rgba, width, height, 3);
  assert.ok(palette.length <= 3, `expected at most 3 threads, got ${palette.length}`);
  assert.equal(indices[0], TRANSPARENT_INDEX);
  assert.ok(assessment.distinctColours >= 8);
  for (let i = 200; i < width * height; i += 1) {
    assert.notEqual(indices[i], TRANSPARENT_INDEX);
  }
});
