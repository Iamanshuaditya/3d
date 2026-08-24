import assert from "node:assert/strict";
import { test } from "node:test";
import { importVectorPdfOperatorPage } from "@/lib/structure";

const rules = [
  { operation: "cut" as const, colorSpace: "rgb" as const, components: [0, 0, 0] },
  { operation: "crease" as const, colorSpace: "rgb" as const, components: [1, 0, 0] },
];

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
    rules,
  });

  assert.ok(Math.abs(dieline.widthMm - 25.4) < 1e-9);
  assert.ok(Math.abs(dieline.heightMm - 25.4) < 1e-9);
  assert.equal(dieline.entities.length, 2);
  assert.equal(dieline.entities[0].operation, "cut");
  assert.equal(dieline.entities[0].path.closed, true);
  assert.equal(dieline.entities[0].provenance.objectIndex, 0);
  assert.equal(dieline.entities[1].operation, "crease");
  assert.equal(dieline.entities[1].provenance.objectIndex, 1);
  const crease = dieline.entities[1].path.segments[0];
  assert.equal(crease.kind, "line");
  if (crease.kind !== "line") throw new Error("expected line");
  assert.ok(Math.abs(crease.start.x - 12.7) < 1e-9);
  assert.ok(Math.abs(crease.start.y - 25.4) < 1e-9);
  assert.ok(Math.abs(crease.end.y) < 1e-9);
});

test("vector PDF import honors non-zero page origins instead of shifting structural authority", () => {
  const dieline = importVectorPdfOperatorPage(
    {
      widthPt: 72,
      heightPt: 72,
      originXPt: 100,
      originYPt: 200,
      operators: [
        { name: "setStrokeRGBColor", args: [0, 0, 0] },
        {
          name: "constructPath",
          args: [["moveTo", "lineTo"], [100, 200, 172, 272]],
        },
        { name: "stroke", args: [] },
      ],
    },
    { id: "offset-page", rules },
  );
  const segment = dieline.entities[0].path.segments[0];
  assert.equal(segment.kind, "line");
  if (segment.kind !== "line") throw new Error("expected line");
  assert.ok(Math.abs(segment.start.x) < 1e-9);
  assert.ok(Math.abs(segment.start.y - 25.4) < 1e-9);
  assert.ok(Math.abs(segment.end.x - 25.4) < 1e-9);
  assert.ok(Math.abs(segment.end.y) < 1e-9);
});

test("vector PDF import composes graphics transforms before physical normalization", () => {
  const dieline = importVectorPdfOperatorPage(
    {
      widthPt: 144,
      heightPt: 144,
      operators: [
        { name: "save", args: [] },
        { name: "transform", args: [2, 0, 0, 2, 10, 20] },
        { name: "setStrokeRGBColor", args: [0, 0, 0] },
        { name: "constructPath", args: [["moveTo", "lineTo"], [0, 0, 10, 0]] },
        { name: "stroke", args: [] },
        { name: "restore", args: [] },
      ],
    },
    { id: "transform-page", rules },
  );
  const segment = dieline.entities[0].path.segments[0];
  assert.equal(segment.kind, "line");
  if (segment.kind !== "line") throw new Error("expected line");
  const ptToMm = 25.4 / 72;
  assert.ok(Math.abs(segment.start.x - 10 * ptToMm) < 1e-9);
  assert.ok(Math.abs(segment.end.x - 30 * ptToMm) < 1e-9);
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
          rules,
        },
      ),
    /Rotated PDF pages/,
  );
});
