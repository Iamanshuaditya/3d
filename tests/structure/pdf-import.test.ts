import assert from "node:assert/strict";
import { test } from "node:test";
import { importVectorPdfOperatorPage } from "@/lib/structure";

const page = {
  widthPt: 72,
  heightPt: 72,
  userUnit: 1,
  rotate: 0,
  operators: [
    { name: "setStrokeRGBColor", args: [0, 0, 0] },
    {
      name: "constructPath",
      args: [
        ["moveTo", "lineTo", "lineTo", "lineTo", "closePath"],
        [0, 0, 72, 0, 72, 72, 0, 72],
      ],
    },
    { name: "stroke", args: [] },
    { name: "setStrokeRGBColor", args: [1, 0, 0] },
    {
      name: "constructPath",
      args: [["moveTo", "lineTo"], [36, 0, 36, 72]],
    },
    { name: "stroke", args: [] },
  ],
} as const;

test("vector PDF operator import preserves physical points and explicit line semantics", () => {
  const dieline = importVectorPdfOperatorPage(page, {
    id: "pdf-fixture",
    sourceName: "fixture.pdf",
    rules: [
      { operation: "cut", colorSpace: "rgb", components: [0, 0, 0] },
      { operation: "crease", colorSpace: "rgb", components: [1, 0, 0] },
    ],
  });

  assert.ok(Math.abs(dieline.widthMm - 25.4) < 1e-9);
  assert.ok(Math.abs(dieline.heightMm - 25.4) < 1e-9);
  assert.equal(dieline.entities.length, 2);
  assert.equal(dieline.entities[0].operation, "cut");
  assert.equal(dieline.entities[0].path.closed, true);
  assert.equal(dieline.entities[1].operation, "crease");
  const crease = dieline.entities[1].path.segments[0];
  assert.equal(crease.kind, "line");
  if (crease.kind !== "line") throw new Error("expected line");
  assert.ok(Math.abs(crease.start.x - 12.7) < 1e-9);
  assert.ok(Math.abs(crease.start.y - 25.4) < 1e-9);
  assert.ok(Math.abs(crease.end.y) < 1e-9);
});

test("vector PDF import fails closed when structural stroke semantics are ambiguous", () => {
  assert.throws(
    () =>
      importVectorPdfOperatorPage(page, {
        id: "pdf-fixture",
        rules: [{ operation: "cut", colorSpace: "rgb", components: [0, 0, 0] }],
      }),
    /no explicit structural classification/,
  );
});

test("vector PDF import rejects rotated pages instead of silently changing authority", () => {
  assert.throws(
    () =>
      importVectorPdfOperatorPage(
        { ...page, rotate: 90 },
        {
          id: "rotated",
          rules: [
            { operation: "cut", colorSpace: "rgb", components: [0, 0, 0] },
            { operation: "crease", colorSpace: "rgb", components: [1, 0, 0] },
          ],
        },
      ),
    /Rotated PDF pages/,
  );
});
