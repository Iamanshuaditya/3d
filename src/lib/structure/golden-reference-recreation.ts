import type { GoldenGeometryRoleReport, GoldenPanelGeometryRole } from "./golden-geometry-roles";
import type { GoldenHingeRole, GoldenHingeRoleReport } from "./golden-hinge-roles";
import type {
  GoldenReviewedConstructionInput,
  GoldenReviewedFlapHinge,
  GoldenReviewedPhase,
} from "./golden-reviewed-construction";

export type GoldenReferenceClosureVariant = "plain-final" | "window-final";
export type GoldenReferenceTopSide = "north" | "south";

export type GoldenReferenceRecreationOptions = Readonly<{
  physicalTop?: GoldenReferenceTopSide;
  closureVariant?: GoldenReferenceClosureVariant;
  boardThicknessMm?: number;
}>;

export type GoldenReferenceRecreationCandidate = Readonly<{
  id: string;
  confidence: "reference-recreation-only";
  input: GoldenReviewedConstructionInput;
  assumptions: readonly string[];
}>;

const DEFAULT_BOARD_THICKNESS_MM = 0.6;

function oppositeSide(side: GoldenReferenceTopSide): GoldenReferenceTopSide {
  return side === "north" ? "south" : "north";
}

function baseRolesForSide(
  hinges: GoldenHingeRoleReport,
  side: GoldenReferenceTopSide,
): readonly GoldenHingeRole[] {
  return side === "north" ? hinges.northBaseLeftToRight : hinges.southBaseLeftToRight;
}

function diagonalRolesForSide(
  hinges: GoldenHingeRoleReport,
  side: GoldenReferenceTopSide,
): readonly GoldenHingeRole[] {
  return side === "north" ? hinges.northDiagonalsLeftToRight : hinges.southDiagonalsLeftToRight;
}

function roleByPanel(geometry: GoldenGeometryRoleReport): Map<string, GoldenPanelGeometryRole> {
  return new Map(geometry.roles.map((role) => [role.panelId, role]));
}

function bodyAndFlap(
  role: GoldenHingeRole,
  roles: ReadonlyMap<string, GoldenPanelGeometryRole>,
): { body: GoldenPanelGeometryRole; flap: GoldenPanelGeometryRole } {
  const a = roles.get(role.panelAId);
  const b = roles.get(role.panelBId);
  if (!a || !b) throw new Error(`Golden reference role ${role.id} references an unknown panel.`);
  if (a.sheetRegion === "body-band" && b.sheetRegion !== "body-band") return { body: a, flap: b };
  if (b.sheetRegion === "body-band" && a.sheetRegion !== "body-band") return { body: b, flap: a };
  throw new Error(`Golden reference base role ${role.id} does not join one body panel to one flap.`);
}

function inwardBaseAngle(side: GoldenReferenceTopSide): number {
  // Measured against the certified positive-depth body: with these signs the
  // assembled bounding box closes to exactly 200 x 150 x 300 mm, so every base
  // flap folds into the tube rather than splaying outward. Negating them opens
  // the assembly back out to 350 x 320 mm.
  return side === "north" ? -90 : 90;
}

function directFlapByPanel(
  baseRoles: readonly GoldenHingeRole[],
  roles: ReadonlyMap<string, GoldenPanelGeometryRole>,
): Map<string, { hinge: GoldenHingeRole; body: GoldenPanelGeometryRole }> {
  const result = new Map<string, { hinge: GoldenHingeRole; body: GoldenPanelGeometryRole }>();
  for (const hinge of baseRoles) {
    const { body, flap } = bodyAndFlap(hinge, roles);
    result.set(flap.panelId, { hinge, body });
  }
  return result;
}

function diagonalDefinition(
  hinge: GoldenHingeRole,
  baseByFlap: ReadonlyMap<string, { hinge: GoldenHingeRole; body: GoldenPanelGeometryRole }>,
): GoldenReviewedFlapHinge {
  const aDirect = baseByFlap.has(hinge.panelAId);
  const bDirect = baseByFlap.has(hinge.panelBId);
  if (aDirect === bDirect) {
    throw new Error(
      `Golden diagonal ${hinge.id} must join exactly one body-attached flap to one sub-flap.`,
    );
  }
  const parentPanelId = aDirect ? hinge.panelAId : hinge.panelBId;
  const childPanelId = aDirect ? hinge.panelBId : hinge.panelAId;
  return {
    roleId: hinge.id,
    parentPanelId,
    childPanelId,
    assembledAngleDeg: 0,
    evidence:
      "REFERENCE_RECREATION_ONLY: no independent diagonal-lock rotation is recoverable from the supplied camera; keep the sub-flap coplanar until converter-reviewed lock data exists.",
  };
}

function baseDefinition(
  hinge: GoldenHingeRole,
  side: GoldenReferenceTopSide,
  roles: ReadonlyMap<string, GoldenPanelGeometryRole>,
): GoldenReviewedFlapHinge {
  const { body, flap } = bodyAndFlap(hinge, roles);
  return {
    roleId: hinge.id,
    parentPanelId: body.panelId,
    childPanelId: flap.panelId,
    assembledAngleDeg: inwardBaseAngle(side),
    evidence:
      `REFERENCE_RECREATION_ONLY: ${side} body-to-flap hinge is folded inward by a quarter turn from the exact source crease; sign follows the certified positive-depth exterior-print convention.`,
  };
}

function bodyRoleForBase(
  hinge: GoldenHingeRole,
  roles: ReadonlyMap<string, GoldenPanelGeometryRole>,
): GoldenPanelGeometryRole["bodyRole"] {
  return bodyAndFlap(hinge, roles).body.bodyRole;
}

function diagonalPhaseRole(
  diagonal: GoldenHingeRole,
  baseByFlap: ReadonlyMap<string, { hinge: GoldenHingeRole; body: GoldenPanelGeometryRole }>,
): GoldenPanelGeometryRole["bodyRole"] {
  const direct = baseByFlap.get(diagonal.panelAId) ?? baseByFlap.get(diagonal.panelBId);
  if (!direct) throw new Error(`Golden diagonal ${diagonal.id} has no body-attached parent flap.`);
  return direct.body.bodyRole;
}

function motion(hingeRoleIds: readonly string[], durationMs = 575): GoldenReviewedPhase["motion"] {
  return {
    delayMs: 0,
    durationMs,
    staggerMs: 90,
    easing: "easeInOutCubic",
    hingeOrder: [...hingeRoleIds],
  };
}

/**
 * Creates an executable visual-reference reconstruction of the golden carton.
 *
 * This is deliberately NOT manufacturing truth. It fills only the facts needed
 * to make the supplied reference reproducible in the runtime, and every value
 * that is not proven by the PDF is labelled REFERENCE_RECREATION_ONLY.
 * Converter-reviewed construction should continue to use
 * `compileLockBottomGoldenConstruction` with its own evidence file.
 */
export function createGoldenReferenceRecreationCandidate(
  geometry: GoldenGeometryRoleReport,
  hinges: GoldenHingeRoleReport,
  options: GoldenReferenceRecreationOptions = {},
): GoldenReferenceRecreationCandidate {
  if (!geometry.passed || !hinges.passed) {
    throw new Error("Golden reference recreation requires passed geometry and hinge-role evidence.");
  }
  if (geometry.sourceSha256.toLowerCase() !== hinges.sourceSha256.toLowerCase()) {
    throw new Error("Golden reference recreation geometry and hinges must share the source hash.");
  }

  const physicalTop = options.physicalTop ?? "north";
  const physicalBottom = oppositeSide(physicalTop);
  const closureVariant = options.closureVariant ?? "plain-final";
  const boardThicknessMm = options.boardThicknessMm ?? DEFAULT_BOARD_THICKNESS_MM;
  if (!Number.isFinite(boardThicknessMm) || boardThicknessMm <= 0 || boardThicknessMm > 10) {
    throw new RangeError("Golden reference recreation boardThicknessMm must be finite in (0, 10].");
  }

  const roles = roleByPanel(geometry);
  const topBases = baseRolesForSide(hinges, physicalTop);
  const bottomBases = baseRolesForSide(hinges, physicalBottom);
  const topDiagonals = diagonalRolesForSide(hinges, physicalTop);
  const bottomDiagonals = diagonalRolesForSide(hinges, physicalBottom);
  const topBaseByFlap = directFlapByPanel(topBases, roles);
  const bottomBaseByFlap = directFlapByPanel(bottomBases, roles);

  const topNarrow = topBases.filter((hinge) => bodyRoleForBase(hinge, roles) === "narrow");
  const topPlain = topBases.filter((hinge) => bodyRoleForBase(hinge, roles) === "broad-plain");
  const topWindow = topBases.filter((hinge) => bodyRoleForBase(hinge, roles) === "broad-window");
  if (topNarrow.length !== 2 || topPlain.length !== 1 || topWindow.length !== 1) {
    throw new Error("Golden reference recreation expected two top dust bases and one base on each broad wall.");
  }

  const finalBodyRole = closureVariant === "plain-final" ? "broad-plain" : "broad-window";
  const majorBodyRole = closureVariant === "plain-final" ? "broad-window" : "broad-plain";
  const finalBase = finalBodyRole === "broad-plain" ? topPlain[0] : topWindow[0];
  const majorBase = majorBodyRole === "broad-plain" ? topPlain[0] : topWindow[0];
  const finalDiagonals = topDiagonals.filter(
    (hinge) => diagonalPhaseRole(hinge, topBaseByFlap) === finalBodyRole,
  );
  const majorDiagonals = topDiagonals.filter(
    (hinge) => diagonalPhaseRole(hinge, topBaseByFlap) === majorBodyRole,
  );

  const flapHinges: GoldenReviewedFlapHinge[] = [
    ...topBases.map((hinge) => baseDefinition(hinge, physicalTop, roles)),
    ...bottomBases.map((hinge) => baseDefinition(hinge, physicalBottom, roles)),
    ...topDiagonals.map((hinge) => diagonalDefinition(hinge, topBaseByFlap)),
    ...bottomDiagonals.map((hinge) => diagonalDefinition(hinge, bottomBaseByFlap)),
  ];

  const finalIds = [finalBase.id, ...finalDiagonals.map((hinge) => hinge.id)];
  const majorIds = [majorBase.id, ...majorDiagonals.map((hinge) => hinge.id)];
  const secondaryIds = [
    ...topNarrow.map((hinge) => hinge.id),
    ...bottomBases.map((hinge) => hinge.id),
    ...bottomDiagonals.map((hinge) => hinge.id),
  ];
  const bodyIds = hinges.bodyChainLeftToRight.map((hinge) => hinge.id);

  const phases: readonly GoldenReviewedPhase[] = [
    { phase: "final-closure", hingeRoleIds: finalIds, motion: motion(finalIds, 575) },
    { phase: "major-closure", hingeRoleIds: majorIds, motion: motion(majorIds, 575) },
    { phase: "secondary-flaps", hingeRoleIds: secondaryIds, motion: motion(secondaryIds, 550) },
    { phase: "body", hingeRoleIds: bodyIds, motion: motion(bodyIds, 650) },
  ];

  const input: GoldenReviewedConstructionInput = {
    schemaVersion: 1,
    sourceSha256: geometry.sourceSha256,
    boardThicknessMm,
    bodyHandedness: "positive-depth",
    physicalTop,
    evidence: {
      boardThickness:
        `REFERENCE_RECREATION_ONLY: supplied motion analysis estimates visible stock below 1% of carton width (roughly 0.2-0.8%); ${boardThicknessMm.toFixed(3)} mm is a visual preview value, not converter caliper.`,
      bodyHandedness:
        "ENGINE_GEOMETRY: positive-depth is the only certified handedness that keeps the structural mesh's printed +Y face exterior. Measured on the assembled rig it puts the printed face outward on all 17 panels and closes the body to exactly 200 x 150 x 300 mm; negative-depth inverts the printed face on every body wall and splays the flaps to 350 x 320 mm.",
      physicalTop:
        `REFERENCE_RECREATION_ONLY: sheet-${physicalTop} is used as physical top for the visual candidate. The source is vertically symmetric enough that converter metadata is still required for manufacturing certification.`,
      flapConstruction:
        `REFERENCE_RECREATION_ONLY: visible sequence is body -> dust/secondary flaps -> major closure -> final closure. Sheet-${physicalBottom} lock folds are occluded in the recording and are bundled into the secondary phase; diagonal sub-folds remain 0deg until reviewed lock data exists.`,
    },
    flapHinges,
    phases,
  };

  const allPhaseIds = phases.flatMap((phase) => phase.hingeRoleIds);
  if (new Set(allPhaseIds).size !== hinges.roles.length || allPhaseIds.length !== hinges.roles.length) {
    throw new Error("Golden reference recreation did not assign every physical hinge exactly once.");
  }

  return {
    id: `${physicalTop}-${closureVariant}-${boardThicknessMm.toFixed(3)}mm`,
    confidence: "reference-recreation-only",
    input,
    assumptions: [
      "Negative-depth is selected from the engine's printed-face exterior convention.",
      `Sheet-${physicalTop} is treated as physical top for this visual candidate.`,
      `${closureVariant === "plain-final" ? "Plain broad wall" : "Window broad wall"} supplies the final visible top closure candidate.`,
      `Sheet-${physicalBottom} lock closure is not separately visible and is grouped with the secondary-flap stage.`,
      "Diagonal lock creases stay coplanar (0deg) because the recording does not recover their independent signed angle.",
      `${boardThicknessMm.toFixed(3)} mm is a visual stock estimate only.`,
    ],
  };
}

/** Candidate matrix for fixed-camera comparison against the supplied reference. */
export function listGoldenReferenceRecreationCandidates(
  geometry: GoldenGeometryRoleReport,
  hinges: GoldenHingeRoleReport,
  boardThicknessMm = DEFAULT_BOARD_THICKNESS_MM,
): readonly GoldenReferenceRecreationCandidate[] {
  return (["north", "south"] as const).flatMap((physicalTop) =>
    (["plain-final", "window-final"] as const).map((closureVariant) =>
      createGoldenReferenceRecreationCandidate(geometry, hinges, {
        physicalTop,
        closureVariant,
        boardThicknessMm,
      }),
    ),
  );
}
