import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
  certifyLockBottomGoldenBodyTube,
  type GoldenGeometryRoleReport,
  type GoldenHingeRole,
  type GoldenHingeRoleReport,
  type GoldenPanelGeometryRole,
} from "@/lib/structure";

function bodyRole(
  panelId: string,
  xOrder: number,
  role: GoldenPanelGeometryRole["bodyRole"],
  widthMm: number,
  holeCount = 0,
): GoldenPanelGeometryRole {
  return {
    panelId,
    sheetRegion: "body-band",
    bodyRole: role,
    xOrder,
    widthMm,
    heightMm: 300,
    holeCount,
  };
}

function geometry(): GoldenGeometryRoleReport {
  const body = [
    bodyRole("seam", 0, "seam-candidate", 13),
    bodyRole("back", 1, "broad-plain", 200),
    bodyRole("left", 2, "narrow", 150),
    bodyRole("front-window", 3, "broad-window", 200, 1),
    bodyRole("right", 4, "narrow", 149.4),
  ];
  return {
    sourceSha256: LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS.sourceSha256,
    bodyBand: { minY: 100, maxY: 400, heightMm: 300 },
    roles: body,
    bodyPanelsLeftToRight: body,
    northFlapsLeftToRight: [],
    southFlapsLeftToRight: [],
    gates: {
      sourceLock: true,
      totalPanelCount: true,
      bodyPanelCount: true,
      northFlapCount: true,
      southFlapCount: true,
      seamCandidateCount: true,
      broadPanelCount: true,
      narrowPanelCount: true,
      singleWindowBodyPanel: true,
      bodyBandHeight: true,
    },
    passed: true,
  };
}

function hinge(index: number, a: string, b: string): GoldenHingeRole {
  return {
    id: `body-${index}`,
    kind: "body-chain",
    candidateId: `candidate-${index}`,
    panelAId: a,
    panelBId: b,
    source: [{ entityId: `crease-${index}`, pathId: `crease-${index}`, flattenedSegmentIndexes: [0] }],
    start: { x: index * 100, y: 100 },
    end: { x: index * 100, y: 400 },
    lengthMm: 300,
    bodyXOrder: index,
    confidence: "geometry-proven",
  };
}

function hinges(sourceSha256 = LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS.sourceSha256): GoldenHingeRoleReport {
  const body = [
    hinge(0, "seam", "back"),
    hinge(1, "back", "left"),
    hinge(2, "left", "front-window"),
    hinge(3, "front-window", "right"),
  ];
  return {
    sourceSha256,
    roles: body,
    bodyChainLeftToRight: body,
    northBaseLeftToRight: [],
    southBaseLeftToRight: [],
    northDiagonalsLeftToRight: [],
    southDiagonalsLeftToRight: [],
    gates: {
      inventoryFormsTree: true,
      totalHingeCount: true,
      bodyChainCount: true,
      northBaseCount: true,
      southBaseCount: true,
      northDiagonalCount: true,
      southDiagonalCount: true,
      bodyChainGeometry: true,
      flapBaseGeometry: true,
      diagonalGeometry: true,
      everyCandidateAssigned: true,
    },
    passed: true,
  };
}

test("canonical golden body tube closes to 200 x 150 mm with the seam overlapping the side wall", () => {
  const report = certifyLockBottomGoldenBodyTube(geometry(), hinges(), "negative-depth");
  assert.equal(report.passed, true);
  assert.equal(report.rootPanelId, "front-window");
  assert.equal(report.hinges.length, 4);
  assert.deepEqual(report.hinges.map((item) => item.assembledAngleDeg), [90, 90, 90, -90]);
  assert.ok(report.closureGapMm <= 0.61);
  assert.ok(report.seamLineErrorMm <= 1e-9);
  assert.ok(Math.abs(report.corners.backLeft.depth + 150) <= 1e-9);
  assert.ok(Math.abs(report.corners.backRightFromBackPanel.x - 200) <= 1e-9);
  assert.ok(report.corners.seamInner.depth > report.corners.backRightFromBackPanel.depth);
});

test("the opposite handedness is the exact global mirror, not a different construction", () => {
  const negative = certifyLockBottomGoldenBodyTube(geometry(), hinges(), "negative-depth");
  const positive = certifyLockBottomGoldenBodyTube(geometry(), hinges(), "positive-depth");
  assert.equal(positive.passed, true);
  assert.deepEqual(positive.hinges.map((item) => item.assembledAngleDeg), [-90, -90, -90, 90]);
  assert.ok(Math.abs(negative.corners.backLeft.depth + positive.corners.backLeft.depth) <= 1e-9);
  assert.ok(Math.abs(negative.corners.backRightFromBackPanel.x - positive.corners.backRightFromBackPanel.x) <= 1e-9);
});

test("body-tube certificate reports dimensional drift instead of normalizing it away", () => {
  const changed = geometry();
  const body = changed.bodyPanelsLeftToRight.map((panel) =>
    panel.panelId === "right" ? { ...panel, widthMm: 142 } : panel,
  );
  const report = certifyLockBottomGoldenBodyTube(
    { ...changed, roles: body, bodyPanelsLeftToRight: body },
    hinges(),
  );
  assert.equal(report.passed, false);
  assert.equal(report.gates.oppositeNarrowWalls, false);
  assert.equal(report.gates.rectangularClosure, false);
});

test("body-tube reconstruction refuses geometry and hinge evidence from different source bytes", () => {
  assert.throws(
    () => certifyLockBottomGoldenBodyTube(geometry(), hinges("0".repeat(64))),
    /same source hash/,
  );
});
