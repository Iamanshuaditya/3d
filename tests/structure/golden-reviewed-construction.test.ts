import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
  compileLockBottomGoldenConstruction,
  type GoldenGeometryRoleReport,
  type GoldenHingeRole,
  type GoldenHingeRoleReport,
  type GoldenPanelGeometryRole,
  type GoldenReviewedConstructionInput,
} from "@/lib/structure";

const SHA = LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS.sourceSha256;

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

function flapRole(
  panelId: string,
  sheetRegion: "north-flap" | "south-flap",
  xOrder: number,
): GoldenPanelGeometryRole {
  return {
    panelId,
    sheetRegion,
    xOrder,
    widthMm: 100,
    heightMm: 80,
    holeCount: 0,
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
  const north = [
    flapRole("north-back", "north-flap", 0),
    flapRole("north-left", "north-flap", 1),
    flapRole("north-front", "north-flap", 2),
    flapRole("north-right", "north-flap", 3),
    flapRole("north-sub-back", "north-flap", 4),
    flapRole("north-sub-front", "north-flap", 5),
  ];
  const south = [
    flapRole("south-back", "south-flap", 0),
    flapRole("south-left", "south-flap", 1),
    flapRole("south-front", "south-flap", 2),
    flapRole("south-right", "south-flap", 3),
    flapRole("south-sub-back", "south-flap", 4),
    flapRole("south-sub-front", "south-flap", 5),
  ];
  return {
    sourceSha256: SHA,
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

function hingeRole(
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
    end: { x: bodyXOrder ?? 1, y: 400 },
    lengthMm: kind === "body-chain" ? 300 : 100,
    ...(bodyXOrder !== undefined ? { bodyXOrder } : {}),
    confidence: "geometry-proven",
  };
}

function hingeRoles(): GoldenHingeRoleReport {
  const body = [
    hingeRole("body-0", "body-chain", "seam", "back", 0),
    hingeRole("body-1", "body-chain", "back", "left", 1),
    hingeRole("body-2", "body-chain", "left", "front-window", 2),
    hingeRole("body-3", "body-chain", "front-window", "right", 3),
  ];
  const northBase = [
    hingeRole("north-base-back", "north-base", "back", "north-back", 1),
    hingeRole("north-base-left", "north-base", "left", "north-left", 2),
    hingeRole("north-base-front", "north-base", "front-window", "north-front", 3),
    hingeRole("north-base-right", "north-base", "right", "north-right", 4),
  ];
  const southBase = [
    hingeRole("south-base-back", "south-base", "back", "south-back", 1),
    hingeRole("south-base-left", "south-base", "left", "south-left", 2),
    hingeRole("south-base-front", "south-base", "front-window", "south-front", 3),
    hingeRole("south-base-right", "south-base", "right", "south-right", 4),
  ];
  const northDiagonals = [
    hingeRole("north-diagonal-left", "north-diagonal", "north-back", "north-sub-back"),
    hingeRole("north-diagonal-right", "north-diagonal", "north-front", "north-sub-front"),
  ];
  const southDiagonals = [
    hingeRole("south-diagonal-left", "south-diagonal", "south-back", "south-sub-back"),
    hingeRole("south-diagonal-right", "south-diagonal", "south-front", "south-sub-front"),
  ];
  return {
    sourceSha256: SHA,
    roles: [...body, ...northBase, ...southBase, ...northDiagonals, ...southDiagonals],
    bodyChainLeftToRight: body,
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

const NON_BODY = [
  ["north-base-back", "back", "north-back"],
  ["north-base-left", "left", "north-left"],
  ["north-base-front", "front-window", "north-front"],
  ["north-base-right", "right", "north-right"],
  ["south-base-back", "back", "south-back"],
  ["south-base-left", "left", "south-left"],
  ["south-base-front", "front-window", "south-front"],
  ["south-base-right", "right", "south-right"],
  ["north-diagonal-left", "north-back", "north-sub-back"],
  ["north-diagonal-right", "north-front", "north-sub-front"],
  ["south-diagonal-left", "south-back", "south-sub-back"],
  ["south-diagonal-right", "south-front", "south-sub-front"],
] as const;

function reviewed(): GoldenReviewedConstructionInput {
  return {
    schemaVersion: 1,
    sourceSha256: SHA,
    boardThicknessMm: 0.6,
    bodyHandedness: "negative-depth",
    physicalTop: "north",
    evidence: {
      boardThickness: "reviewed stock specification",
      bodyHandedness: "reviewed against printed-side reference",
      physicalTop: "reviewed against assembled reference orientation",
      flapConstruction: "reviewed fold/lock construction metadata",
    },
    flapHinges: NON_BODY.map(([roleId, parentPanelId, childPanelId]) => ({
      roleId,
      parentPanelId,
      childPanelId,
      assembledAngleDeg: roleId.includes("diagonal") ? -45 : 90,
      evidence: `reviewed ${roleId}`,
    })),
    phases: [
      {
        phase: "final-closure",
        hingeRoleIds: ["north-diagonal-right"],
        motion: { durationMs: 575, staggerMs: 90, easing: "easeInOutCubic" },
      },
      {
        phase: "major-closure",
        hingeRoleIds: [
          "north-base-back",
          "north-base-front",
          "north-diagonal-left",
        ],
      },
      {
        phase: "secondary-flaps",
        hingeRoleIds: [
          "north-base-left",
          "north-base-right",
          "south-base-back",
          "south-base-left",
          "south-base-front",
          "south-base-right",
          "south-diagonal-left",
          "south-diagonal-right",
        ],
      },
      { phase: "body", hingeRoleIds: ["body-0", "body-1", "body-2", "body-3"] },
    ],
  };
}

test("reviewed golden construction compiles all 17 panels and 16 exact hinge roles", () => {
  const compiled = compileLockBottomGoldenConstruction(
    "cloudlab-lock-bottom-window-300x150x200",
    geometry(),
    hingeRoles(),
    reviewed(),
  );
  assert.equal(compiled.construction.rootPanelId, "back");
  assert.equal(compiled.construction.boardThicknessMm, 0.6);
  assert.equal(compiled.construction.hinges.length, 16);
  assert.deepEqual(compiled.modelRotationRad, [0, 0, 0]);
  assert.deepEqual(compiled.unfold.steps.map((step) => step.id), [
    "final-closure",
    "major-closure",
    "secondary-flaps",
    "body",
  ]);
  const body = new Map(compiled.construction.hinges.map((hinge) => [hinge.id, hinge]));
  assert.equal(body.get("body-1")?.parentPanelId, "back");
  assert.equal(body.get("body-1")?.childPanelId, "left");
  assert.equal(body.get("body-1")?.assembledAngleDeg, 90);
  assert.equal(body.get("body-2")?.parentPanelId, "left");
  assert.equal(body.get("body-2")?.childPanelId, "front-window");
  assert.equal(body.get("body-2")?.assembledAngleDeg, 90);
  assert.equal(body.get("body-3")?.parentPanelId, "front-window");
  assert.equal(body.get("body-3")?.childPanelId, "right");
  assert.equal(body.get("body-3")?.assembledAngleDeg, 90);
  assert.equal(body.get("body-0")?.parentPanelId, "back");
  assert.equal(body.get("body-0")?.childPanelId, "seam");
  assert.equal(body.get("body-0")?.assembledAngleDeg, -90);
});

test("reviewed golden construction refuses missing or duplicate non-body hinge facts", () => {
  const base = reviewed();
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, flapHinges: base.flapHinges.slice(0, -1) },
    ),
    /requires 12 non-body hinges/,
  );
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, flapHinges: [...base.flapHinges.slice(0, -1), base.flapHinges[0]] },
    ),
    /duplicated/,
  );
});

test("reviewed golden construction refuses parent-child semantics that contradict exact adjacency", () => {
  const base = reviewed();
  const changed = base.flapHinges.map((hinge, index) =>
    index === 0 ? { ...hinge, parentPanelId: "front-window" } : hinge,
  );
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, flapHinges: changed },
    ),
    /do not match its exact geometry adjacency/,
  );
});

test("reviewed golden construction refuses cycles even when every local adjacency is valid", () => {
  const base = reviewed();
  const changed = base.flapHinges.map((hinge) => {
    if (hinge.roleId === "north-base-back") {
      return { ...hinge, parentPanelId: "north-back", childPanelId: "back" };
    }
    return hinge;
  });
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, flapHinges: changed },
    ),
    /(root panel|more than one reviewed parent|no reviewed parent|cycle)/,
  );
});

test("reviewed golden construction enforces benchmark phase order and complete hinge coverage", () => {
  const base = reviewed();
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, phases: [base.phases[1], base.phases[0], base.phases[2], base.phases[3]] },
    ),
    /must be final-closure/,
  );
  const incomplete = base.phases.map((phase) =>
    phase.phase === "secondary-flaps"
      ? { ...phase, hingeRoleIds: phase.hingeRoleIds.slice(1) }
      : phase,
  );
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, phases: incomplete },
    ),
    /assign every physical hinge role exactly once/,
  );
});

test("reviewed golden construction will not move a body hinge in a closure phase", () => {
  const base = reviewed();
  const changed = base.phases.map((phase) => {
    if (phase.phase === "major-closure") {
      return { ...phase, hingeRoleIds: [...phase.hingeRoleIds, "body-0"] };
    }
    if (phase.phase === "body") {
      return { ...phase, hingeRoleIds: phase.hingeRoleIds.filter((id) => id !== "body-0") };
    }
    return phase;
  });
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, phases: changed },
    ),
    /(body phase must contain exactly|cannot flatten a body-tube hinge)/,
  );
});

test("reviewed golden motion must remain inside the measured reference envelope", () => {
  const base = reviewed();
  const changed = base.phases.map((phase) =>
    phase.phase === "major-closure"
      ? { ...phase, motion: { durationMs: 900, staggerMs: 90, easing: "easeInOutCubic" as const } }
      : phase,
  );
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, phases: changed },
    ),
    /outside the reviewed 450-700 ms envelope/,
  );
});

test("reviewed golden construction requires evidence for every hidden physical input", () => {
  const base = reviewed();
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, evidence: { ...base.evidence, boardThickness: "" } },
    ),
    /board thickness evidence cannot be empty/i,
  );
  const changed = base.flapHinges.map((hinge, index) =>
    index === 3 ? { ...hinge, evidence: "" } : hinge,
  );
  assert.throws(
    () => compileLockBottomGoldenConstruction(
      "cloudlab-lock-bottom-window-300x150x200",
      geometry(),
      hingeRoles(),
      { ...base, flapHinges: changed },
    ),
    /evidence cannot be empty/,
  );
});
