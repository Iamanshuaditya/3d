import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
  classifyLockBottomGoldenHinges,
  type GoldenGeometryRoleReport,
  type GoldenPanelGeometryRole,
  type StructuralConstructionInventory,
  type StructuralHingeCandidate,
} from "@/lib/structure";

function role(
  panelId: string,
  sheetRegion: GoldenPanelGeometryRole["sheetRegion"],
  xOrder: number,
  bodyRole?: GoldenPanelGeometryRole["bodyRole"],
  holeCount = 0,
): GoldenPanelGeometryRole {
  return {
    panelId,
    sheetRegion,
    xOrder,
    bodyRole,
    widthMm: bodyRole === "seam-candidate" ? 13 : bodyRole?.startsWith("broad") ? 200 : 150,
    heightMm: sheetRegion === "body-band" ? 300 : 85,
    holeCount,
  };
}

function geometry(): GoldenGeometryRoleReport {
  const body = [
    role("seam", "body-band", 0, "seam-candidate"),
    role("broad", "body-band", 1, "broad-plain"),
    role("narrow-a", "body-band", 2, "narrow"),
    role("window", "body-band", 3, "broad-window", 1),
    role("narrow-b", "body-band", 4, "narrow"),
  ];
  const north = Array.from({ length: 6 }, (_, index) => role(`north-${index + 1}`, "north-flap", index));
  const south = Array.from({ length: 6 }, (_, index) => role(`south-${index + 1}`, "south-flap", index));
  return {
    sourceSha256: LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS.sourceSha256,
    bodyBand: { minY: 100, maxY: 400, heightMm: 300 },
    roles: [...north, ...body, ...south],
    bodyPanelsLeftToRight: body,
    northFlapsLeftToRight: north,
    southFlapsLeftToRight: south,
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

let candidateIndex = 0;
function candidate(
  a: string,
  b: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): StructuralHingeCandidate {
  candidateIndex += 1;
  return {
    id: `candidate-${candidateIndex}-${a}-${b}`,
    panelAId: a,
    panelBId: b,
    edgeIds: [`edge-${candidateIndex}`],
    source: [{ entityId: `crease-${candidateIndex}`, pathId: `crease-${candidateIndex}-path`, flattenedSegmentIndexes: [0] }],
    start,
    end,
    lengthMm: Math.hypot(end.x - start.x, end.y - start.y),
  };
}

function inventory(): StructuralConstructionInventory {
  candidateIndex = 0;
  const candidates: StructuralHingeCandidate[] = [
    candidate("seam", "broad", { x: 28, y: 100 }, { x: 28, y: 400 }),
    candidate("broad", "narrow-a", { x: 228, y: 100 }, { x: 228, y: 400 }),
    candidate("narrow-a", "window", { x: 378, y: 100 }, { x: 378, y: 400 }),
    candidate("window", "narrow-b", { x: 578, y: 100 }, { x: 578, y: 400 }),
    candidate("broad", "north-1", { x: 28.3, y: 100 }, { x: 227.7, y: 100 }),
    candidate("narrow-a", "north-2", { x: 228.3, y: 100 }, { x: 377.7, y: 100 }),
    candidate("window", "north-3", { x: 378.3, y: 100 }, { x: 577.7, y: 100 }),
    candidate("narrow-b", "north-4", { x: 578.3, y: 100 }, { x: 727.4, y: 100 }),
    candidate("broad", "south-1", { x: 28.3, y: 400 }, { x: 227.7, y: 400 }),
    candidate("narrow-a", "south-2", { x: 228.3, y: 400 }, { x: 377.7, y: 400 }),
    candidate("window", "south-3", { x: 378.3, y: 400 }, { x: 577.7, y: 400 }),
    candidate("narrow-b", "south-4", { x: 578.3, y: 400 }, { x: 727.4, y: 400 }),
    candidate("north-1", "north-5", { x: 153, y: 25 }, { x: 222.18, y: 94.18 }),
    candidate("north-3", "north-6", { x: 503, y: 25 }, { x: 572.18, y: 94.18 }),
    candidate("south-1", "south-5", { x: 153, y: 475 }, { x: 222.18, y: 405.82 }),
    candidate("south-3", "south-6", { x: 503, y: 475 }, { x: 572.18, y: 405.82 }),
  ];
  return {
    panelCount: 17,
    hingeCandidateCount: candidates.length,
    formsTree: true,
    panels: [],
    hingeCandidates: candidates,
    unresolvedCreases: [],
  };
}

test("golden hinge roles assign all 16 physical crease chains exactly once", () => {
  const report = classifyLockBottomGoldenHinges(geometry(), inventory());
  assert.equal(report.passed, true);
  assert.equal(report.roles.length, 16);
  assert.equal(report.bodyChainLeftToRight.length, 4);
  assert.equal(report.northBaseLeftToRight.length, 4);
  assert.equal(report.southBaseLeftToRight.length, 4);
  assert.deepEqual(report.northDiagonalsLeftToRight.map((item) => item.id), ["north-diagonal-left", "north-diagonal-right"]);
  assert.deepEqual(report.southDiagonalsLeftToRight.map((item) => item.id), ["south-diagonal-left", "south-diagonal-right"]);
  assert.match(report.bodyChainLeftToRight[0].id, /seam-candidate-to-broad-plain/);
  assert.match(report.bodyChainLeftToRight[2].id, /narrow-to-broad-window/);
  assert.equal(new Set(report.roles.map((item) => item.candidateId)).size, 16);
  assert.equal(new Set(report.roles.map((item) => item.id)).size, 16);
});

test("golden hinge roles fail closed if the reviewed body crease stops being vertical", () => {
  const changed = inventory();
  const first = changed.hingeCandidates[0];
  const bad = { ...first, end: { x: first.end.x + 2, y: first.end.y } };
  const candidates = [bad, ...changed.hingeCandidates.slice(1)];
  assert.throws(
    () => classifyLockBottomGoldenHinges(geometry(), { ...changed, hingeCandidates: candidates }),
    /body-chain crease geometry changed/,
  );
});

test("golden hinge roles refuse an incomplete adjacency tree", () => {
  const changed = inventory();
  assert.throws(
    () => classifyLockBottomGoldenHinges(geometry(), {
      ...changed,
      formsTree: false,
      unresolvedCreases: [{
        edgeId: "bad-edge",
        owners: ["broad"],
        entityId: "bad",
        pathId: "bad-path",
        flattenedSegmentIndex: 0,
        reason: "not-shared-by-exactly-two-panels",
      }],
    }),
    /complete tree-shaped construction inventory/,
  );
});
