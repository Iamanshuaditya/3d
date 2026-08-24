import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
  classifyLockBottomGoldenGeometry,
  type CanonicalDieline,
  type StructuralPanel,
} from "@/lib/structure";

function panel(
  id: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  holeCount = 0,
): StructuralPanel {
  const outerBoundary = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const holes = Array.from({ length: holeCount }, () => [
    { x: minX + 20, y: minY + 20 },
    { x: minX + 40, y: minY + 20 },
    { x: minX + 40, y: minY + 40 },
    { x: minX + 20, y: minY + 40 },
  ]);
  return {
    id,
    faceId: `${id}-face`,
    outerBoundary,
    holes,
    creaseEdgeIds: [],
    bounds: { minX, minY, maxX, maxY },
  };
}

function dieline(sha256 = LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS.sourceSha256): CanonicalDieline {
  return {
    schemaVersion: 2,
    id: "cloudlab-lock-bottom-window-300x150x200",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 742.4,
    heightMm: 500,
    source: {
      id: "golden-role-fixture",
      format: "pdf",
      sourceUnits: "pt",
      sha256,
    },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities: [],
  };
}

function goldenLikePanels(): StructuralPanel[] {
  return [
    // sheet north: six physical flap regions after the diagonal crease splits
    panel("north-1", 503, 15, 576, 94.19),
    panel("north-2", 153, 15, 226, 94.19),
    panel("north-3", 28.3, 15, 227.7, 100),
    panel("north-4", 378.3, 15, 577.7, 100),
    panel("north-5", 228.3, 25, 377.7, 100),
    panel("north-6", 578.3, 25, 727.4, 100),
    // body strip left-to-right: seam, broad, narrow, broad-with-window, narrow
    panel("seam", 15, 100, 28, 399.4),
    panel("broad-plain", 28, 100, 228, 400),
    panel("narrow-a", 228, 100, 378, 400),
    panel("broad-window", 378, 100, 578, 400, 1),
    panel("narrow-b", 578, 100, 727.4, 400),
    // sheet south: six flap regions
    panel("south-1", 578.3, 400, 727.4, 475),
    panel("south-2", 228.3, 400, 377.7, 475),
    panel("south-3", 378.3, 400, 577.7, 485),
    panel("south-4", 28.3, 400, 227.7, 485),
    panel("south-5", 153, 405.81, 226, 485),
    panel("south-6", 503, 405.81, 576, 485),
  ];
}

test("golden geometry roles recover the stable five-panel body strip and two flap regions", () => {
  const report = classifyLockBottomGoldenGeometry(dieline(), goldenLikePanels());
  assert.equal(report.passed, true);
  assert.deepEqual(
    report.bodyPanelsLeftToRight.map((role) => role.bodyRole),
    ["seam-candidate", "broad-plain", "narrow", "broad-window", "narrow"],
  );
  assert.deepEqual(
    report.bodyPanelsLeftToRight.map((role) => role.panelId),
    ["seam", "broad-plain", "narrow-a", "broad-window", "narrow-b"],
  );
  assert.equal(report.northFlapsLeftToRight.length, 6);
  assert.equal(report.southFlapsLeftToRight.length, 6);
  assert.equal(report.bodyBand.heightMm, 300);
  assert.equal(report.bodyPanelsLeftToRight.find((role) => role.bodyRole === "broad-window")!.holeCount, 1);
});

test("golden geometry roles refuse a geometrically similar but unauthorised source", () => {
  assert.throws(
    () => classifyLockBottomGoldenGeometry(dieline("0".repeat(64)), goldenLikePanels()),
    /hash-locked authorized source/,
  );
});

test("golden geometry roles fail closed when the reviewed 17-panel decomposition changes", () => {
  const changed = goldenLikePanels().slice(0, -1);
  assert.throws(
    () => classifyLockBottomGoldenGeometry(dieline(), changed),
    /left panels unassigned|expected 5 body-band panels/,
  );
});
