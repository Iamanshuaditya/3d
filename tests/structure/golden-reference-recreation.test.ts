import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
  compileLockBottomGoldenConstruction,
  createGoldenReferenceRecreationCandidate,
  listGoldenReferenceRecreationCandidates,
  type GoldenGeometryRoleReport,
  type GoldenHingeRole,
  type GoldenHingeRoleReport,
  type GoldenPanelGeometryRole,
} from "@/lib/structure";

const SHA = LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS.sourceSha256;

function body(
  panelId: string,
  xOrder: number,
  bodyRole: GoldenPanelGeometryRole["bodyRole"],
  widthMm: number,
  holeCount = 0,
): GoldenPanelGeometryRole {
  return {
    panelId,
    sheetRegion: "body-band",
    bodyRole,
    xOrder,
    widthMm,
    heightMm: 300,
    holeCount,
  };
}

function flap(
  panelId: string,
  side: "north-flap" | "south-flap",
  xOrder: number,
): GoldenPanelGeometryRole {
  return {
    panelId,
    sheetRegion: side,
    xOrder,
    widthMm: 100,
    heightMm: 80,
    holeCount: 0,
  };
}

function geometry(): GoldenGeometryRoleReport {
  const bodies = [
    body("seam", 0, "seam-candidate", 13),
    body("plain", 1, "broad-plain", 200),
    body("left", 2, "narrow", 150),
    body("window", 3, "broad-window", 200, 1),
    body("right", 4, "narrow", 149.4),
  ];
  const north = [
    flap("north-plain", "north-flap", 0),
    flap("north-left", "north-flap", 1),
    flap("north-window", "north-flap", 2),
    flap("north-right", "north-flap", 3),
    flap("north-plain-sub", "north-flap", 4),
    flap("north-window-sub", "north-flap", 5),
  ];
  const south = [
    flap("south-plain", "south-flap", 0),
    flap("south-left", "south-flap", 1),
    flap("south-window", "south-flap", 2),
    flap("south-right", "south-flap", 3),
    flap("south-plain-sub", "south-flap", 4),
    flap("south-window-sub", "south-flap", 5),
  ];
  return {
    sourceSha256: SHA,
    bodyBand: { minY: 100, maxY: 400, heightMm: 300 },
    roles: [...north, ...bodies, ...south],
    bodyPanelsLeftToRight: bodies,
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

function hinge(
  id: string,
  kind: GoldenHingeRole["kind"],
  panelAId: string,
  panelBId: string,
  bodyXOrder?: number,
): GoldenHingeRole {
  return {
    id,
    kind,
    candidateId: `candidate-${id}`,
    panelAId,
    panelBId,
    source: [{ entityId: `entity-${id}`, pathId: `path-${id}`, flattenedSegmentIndexes: [0] }],
    start: { x: bodyXOrder ?? 0, y: 100 },
    end: { x: (bodyXOrder ?? 0) + 1, y: kind === "body-chain" ? 400 : 100 },
    lengthMm: kind === "body-chain" ? 300 : 100,
    ...(bodyXOrder !== undefined ? { bodyXOrder } : {}),
    confidence: "geometry-proven",
  };
}

function hinges(): GoldenHingeRoleReport {
  const bodyChain = [
    hinge("body-0", "body-chain", "seam", "plain", 0),
    hinge("body-1", "body-chain", "plain", "left", 1),
    hinge("body-2", "body-chain", "left", "window", 2),
    hinge("body-3", "body-chain", "window", "right", 3),
  ];
  const northBase = [
    hinge("north-base-plain", "north-base", "plain", "north-plain", 1),
    hinge("north-base-left", "north-base", "left", "north-left", 2),
    hinge("north-base-window", "north-base", "window", "north-window", 3),
    hinge("north-base-right", "north-base", "right", "north-right", 4),
  ];
  const southBase = [
    hinge("south-base-plain", "south-base", "plain", "south-plain", 1),
    hinge("south-base-left", "south-base", "left", "south-left", 2),
    hinge("south-base-window", "south-base", "window", "south-window", 3),
    hinge("south-base-right", "south-base", "right", "south-right", 4),
  ];
  const northDiagonals = [
    hinge("north-diagonal-plain", "north-diagonal", "north-plain", "north-plain-sub"),
    hinge("north-diagonal-window", "north-diagonal", "north-window", "north-window-sub"),
  ];
  const southDiagonals = [
    hinge("south-diagonal-plain", "south-diagonal", "south-plain", "south-plain-sub"),
    hinge("south-diagonal-window", "south-diagonal", "south-window", "south-window-sub"),
  ];
  return {
    sourceSha256: SHA,
    roles: [...bodyChain, ...northBase, ...southBase, ...northDiagonals, ...southDiagonals],
    bodyChainLeftToRight: bodyChain,
    northBaseLeftToRight: northBase,
    southBaseLeftToRight: southBase,
    northDiagonalsLeftToRight: northDiagonals,
    southDiagonalsLeftToRight: southDiagonals,
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

test("reference recreation produces a complete evidence-labelled 16-hinge candidate", () => {
  const candidate = createGoldenReferenceRecreationCandidate(geometry(), hinges());
  assert.equal(candidate.confidence, "reference-recreation-only");
  assert.equal(candidate.input.bodyHandedness, "negative-depth");
  assert.equal(candidate.input.physicalTop, "north");
  assert.equal(candidate.input.boardThicknessMm, 0.6);
  assert.equal(candidate.input.flapHinges.length, 12);
  assert.equal(candidate.input.phases.length, 4);

  const assigned = candidate.input.phases.flatMap((phase) => phase.hingeRoleIds);
  assert.equal(assigned.length, 16);
  assert.equal(new Set(assigned).size, 16);
  assert.deepEqual(candidate.input.phases.map((phase) => phase.phase), [
    "final-closure",
    "major-closure",
    "secondary-flaps",
    "body",
  ]);
  assert.deepEqual(candidate.input.phases[3].hingeRoleIds, ["body-0", "body-1", "body-2", "body-3"]);

  const flapById = new Map(candidate.input.flapHinges.map((entry) => [entry.roleId, entry]));
  assert.equal(flapById.get("north-base-plain")?.assembledAngleDeg, -90);
  assert.equal(flapById.get("south-base-plain")?.assembledAngleDeg, 90);
  assert.equal(flapById.get("north-diagonal-plain")?.assembledAngleDeg, 0);
  assert.match(candidate.input.evidence.boardThickness, /REFERENCE_RECREATION_ONLY/);
  assert.match(candidate.input.evidence.bodyHandedness, /printed \+Y face exterior/);
});

test("reference recreation compiles through the strict reviewed-construction compiler", () => {
  const candidate = createGoldenReferenceRecreationCandidate(geometry(), hinges(), {
    physicalTop: "north",
    closureVariant: "plain-final",
  });
  const compiled = compileLockBottomGoldenConstruction(
    "cloudlab-lock-bottom-window-300x150x200",
    geometry(),
    hinges(),
    candidate.input,
  );
  assert.equal(compiled.construction.hinges.length, 16);
  assert.equal(compiled.construction.rootPanelId, "window");
  assert.equal(compiled.construction.boardThicknessMm, 0.6);
  assert.deepEqual(compiled.modelRotationRad, [Math.PI / 2, 0, 0]);
  assert.equal(compiled.unfold.steps.length, 4);
  assert.equal(compiled.unfold.steps.at(-1)?.id, "body");
});

test("plain-final and window-final candidates swap only the two broad top closure phases", () => {
  const plain = createGoldenReferenceRecreationCandidate(geometry(), hinges(), {
    closureVariant: "plain-final",
  });
  const window = createGoldenReferenceRecreationCandidate(geometry(), hinges(), {
    closureVariant: "window-final",
  });
  assert.ok(plain.input.phases[0].hingeRoleIds.includes("north-base-plain"));
  assert.ok(plain.input.phases[1].hingeRoleIds.includes("north-base-window"));
  assert.ok(window.input.phases[0].hingeRoleIds.includes("north-base-window"));
  assert.ok(window.input.phases[1].hingeRoleIds.includes("north-base-plain"));
  assert.deepEqual(plain.input.phases[2].hingeRoleIds, window.input.phases[2].hingeRoleIds);
  assert.deepEqual(plain.input.phases[3].hingeRoleIds, window.input.phases[3].hingeRoleIds);
});

test("candidate matrix covers both sheet-top conventions and both broad closure orders", () => {
  const candidates = listGoldenReferenceRecreationCandidates(geometry(), hinges());
  assert.equal(candidates.length, 4);
  assert.deepEqual(
    candidates.map((candidate) => candidate.id).sort(),
    [
      "north-plain-final-0.600mm",
      "north-window-final-0.600mm",
      "south-plain-final-0.600mm",
      "south-window-final-0.600mm",
    ],
  );
  const south = candidates.find((candidate) => candidate.id.startsWith("south-plain"))!;
  const byId = new Map(south.input.flapHinges.map((entry) => [entry.roleId, entry]));
  assert.equal(byId.get("south-base-plain")?.assembledAngleDeg, 90);
  assert.equal(byId.get("north-base-plain")?.assembledAngleDeg, -90);
  assert.equal(south.input.physicalTop, "south");
});

test("reference recreation refuses impossible visual board thickness", () => {
  assert.throws(
    () => createGoldenReferenceRecreationCandidate(geometry(), hinges(), { boardThicknessMm: 0 }),
    /boardThicknessMm/,
  );
});
