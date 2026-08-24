import type { GoldenGeometryRoleReport, GoldenPanelGeometryRole } from "./golden-geometry-roles";
import type {
  StructuralConstructionInventory,
  StructuralHingeCandidate,
} from "./structural-authoring";

export type GoldenHingeRoleKind =
  | "body-chain"
  | "north-base"
  | "south-base"
  | "north-diagonal"
  | "south-diagonal";

export type GoldenHingeRole = Readonly<{
  id: string;
  kind: GoldenHingeRoleKind;
  candidateId: string;
  panelAId: string;
  panelBId: string;
  source: StructuralHingeCandidate["source"];
  start: StructuralHingeCandidate["start"];
  end: StructuralHingeCandidate["end"];
  lengthMm: number;
  bodyXOrder?: number;
  bodyRole?: GoldenPanelGeometryRole["bodyRole"];
  confidence: "geometry-proven";
}>;

export type GoldenHingeRoleReport = Readonly<{
  sourceSha256: string;
  roles: readonly GoldenHingeRole[];
  bodyChainLeftToRight: readonly GoldenHingeRole[];
  northBaseLeftToRight: readonly GoldenHingeRole[];
  southBaseLeftToRight: readonly GoldenHingeRole[];
  northDiagonalsLeftToRight: readonly GoldenHingeRole[];
  southDiagonalsLeftToRight: readonly GoldenHingeRole[];
  gates: Readonly<{
    inventoryFormsTree: true;
    totalHingeCount: true;
    bodyChainCount: true;
    northBaseCount: true;
    southBaseCount: true;
    northDiagonalCount: true;
    southDiagonalCount: true;
    bodyChainGeometry: true;
    flapBaseGeometry: true;
    diagonalGeometry: true;
    everyCandidateAssigned: true;
  }>;
  passed: true;
}>;

const EXPECTED_TOTAL = 16;
const EXPECTED_BODY_CHAIN = 4;
const EXPECTED_BASE_PER_SIDE = 4;
const EXPECTED_DIAGONAL_PER_SIDE = 2;
const AXIS_TOLERANCE_MM = 0.05;
const BODY_LENGTH_TOLERANCE_MM = 1;
const BODY_MIN_LENGTH_MM = 290;

function roleMap(geometry: GoldenGeometryRoleReport): Map<string, GoldenPanelGeometryRole> {
  return new Map(geometry.roles.map((role) => [role.panelId, role]));
}

function midpointX(candidate: StructuralHingeCandidate): number {
  return (candidate.start.x + candidate.end.x) / 2;
}

function span(candidate: StructuralHingeCandidate): { dx: number; dy: number } {
  return {
    dx: Math.abs(candidate.end.x - candidate.start.x),
    dy: Math.abs(candidate.end.y - candidate.start.y),
  };
}

function isVertical(candidate: StructuralHingeCandidate): boolean {
  return span(candidate).dx <= AXIS_TOLERANCE_MM;
}

function isHorizontal(candidate: StructuralHingeCandidate): boolean {
  return span(candidate).dy <= AXIS_TOLERANCE_MM;
}

function isDiagonal(candidate: StructuralHingeCandidate): boolean {
  const { dx, dy } = span(candidate);
  return dx > AXIS_TOLERANCE_MM && dy > AXIS_TOLERANCE_MM;
}

function requireCount(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`Golden hinge-role classifier expected ${expected} ${label}; found ${actual}.`);
  }
}

function bodyPairId(left: GoldenPanelGeometryRole, right: GoldenPanelGeometryRole): string {
  const pair = `${left.bodyRole ?? "unknown"}-to-${right.bodyRole ?? "unknown"}`;
  return `body-${left.xOrder}-${right.xOrder}-${pair}`;
}

function classifyCandidate(
  candidate: StructuralHingeCandidate,
  roles: ReadonlyMap<string, GoldenPanelGeometryRole>,
): GoldenHingeRole {
  const a = roles.get(candidate.panelAId);
  const b = roles.get(candidate.panelBId);
  if (!a || !b) {
    throw new Error(`Golden hinge ${candidate.id} references a panel without a geometry role.`);
  }

  if (a.sheetRegion === "body-band" && b.sheetRegion === "body-band") {
    const ordered = [a, b].sort((left, right) => left.xOrder - right.xOrder);
    if (ordered[1].xOrder - ordered[0].xOrder !== 1) {
      throw new Error(`Golden body hinge ${candidate.id} joins non-adjacent body panels.`);
    }
    return {
      id: bodyPairId(ordered[0], ordered[1]),
      kind: "body-chain",
      candidateId: candidate.id,
      panelAId: candidate.panelAId,
      panelBId: candidate.panelBId,
      source: candidate.source,
      start: candidate.start,
      end: candidate.end,
      lengthMm: candidate.lengthMm,
      bodyXOrder: ordered[0].xOrder,
      bodyRole: ordered[0].bodyRole,
      confidence: "geometry-proven",
    };
  }

  const body = a.sheetRegion === "body-band" ? a : b.sheetRegion === "body-band" ? b : null;
  const flap = body === a ? b : body === b ? a : null;
  if (body && flap && (flap.sheetRegion === "north-flap" || flap.sheetRegion === "south-flap")) {
    if (body.bodyRole === "seam-candidate") {
      throw new Error(`Golden flap-base hinge ${candidate.id} unexpectedly attaches to the seam candidate.`);
    }
    const side = flap.sheetRegion === "north-flap" ? "north" : "south";
    return {
      id: `${side}-base-body-${body.xOrder}-${body.bodyRole}`,
      kind: `${side}-base` as "north-base" | "south-base",
      candidateId: candidate.id,
      panelAId: candidate.panelAId,
      panelBId: candidate.panelBId,
      source: candidate.source,
      start: candidate.start,
      end: candidate.end,
      lengthMm: candidate.lengthMm,
      bodyXOrder: body.xOrder,
      bodyRole: body.bodyRole,
      confidence: "geometry-proven",
    };
  }

  if (a.sheetRegion === "north-flap" && b.sheetRegion === "north-flap") {
    return {
      id: "north-diagonal-pending",
      kind: "north-diagonal",
      candidateId: candidate.id,
      panelAId: candidate.panelAId,
      panelBId: candidate.panelBId,
      source: candidate.source,
      start: candidate.start,
      end: candidate.end,
      lengthMm: candidate.lengthMm,
      confidence: "geometry-proven",
    };
  }

  if (a.sheetRegion === "south-flap" && b.sheetRegion === "south-flap") {
    return {
      id: "south-diagonal-pending",
      kind: "south-diagonal",
      candidateId: candidate.id,
      panelAId: candidate.panelAId,
      panelBId: candidate.panelBId,
      source: candidate.source,
      start: candidate.start,
      end: candidate.end,
      lengthMm: candidate.lengthMm,
      confidence: "geometry-proven",
    };
  }

  throw new Error(
    `Golden hinge ${candidate.id} has unsupported geometry-role adjacency ${a.sheetRegion}/${b.sheetRegion}.`,
  );
}

function nameDiagonals(
  roles: readonly GoldenHingeRole[],
  side: "north" | "south",
): GoldenHingeRole[] {
  return [...roles]
    .sort((left, right) => {
      const leftCandidate = { start: left.start, end: left.end } as StructuralHingeCandidate;
      const rightCandidate = { start: right.start, end: right.end } as StructuralHingeCandidate;
      return midpointX(leftCandidate) - midpointX(rightCandidate);
    })
    .map((role, index) => ({ ...role, id: `${side}-diagonal-${index === 0 ? "left" : "right"}` }));
}

/**
 * Gives every one of the reviewed golden carton's 16 physical crease chains a
 * stable, source-specific geometry role without guessing a mountain/valley
 * sign, target angle, root direction, glue role, or closure order.
 */
export function classifyLockBottomGoldenHinges(
  geometry: GoldenGeometryRoleReport,
  inventory: StructuralConstructionInventory,
): GoldenHingeRoleReport {
  if (!geometry.passed) throw new Error("Golden hinge roles require a passed geometry-role report.");
  if (!inventory.formsTree || inventory.unresolvedCreases.length > 0) {
    throw new Error("Golden hinge roles require a complete tree-shaped construction inventory.");
  }
  requireCount(inventory.panelCount, 17, "panels");
  requireCount(inventory.hingeCandidateCount, EXPECTED_TOTAL, "physical hinge candidates");

  const byPanel = roleMap(geometry);
  const classified = inventory.hingeCandidates.map((candidate) => classifyCandidate(candidate, byPanel));
  const body = classified.filter((role) => role.kind === "body-chain").sort((a, b) => (a.bodyXOrder ?? 0) - (b.bodyXOrder ?? 0));
  const northBase = classified.filter((role) => role.kind === "north-base").sort((a, b) => (a.bodyXOrder ?? 0) - (b.bodyXOrder ?? 0));
  const southBase = classified.filter((role) => role.kind === "south-base").sort((a, b) => (a.bodyXOrder ?? 0) - (b.bodyXOrder ?? 0));
  const northDiagonal = nameDiagonals(classified.filter((role) => role.kind === "north-diagonal"), "north");
  const southDiagonal = nameDiagonals(classified.filter((role) => role.kind === "south-diagonal"), "south");

  requireCount(body.length, EXPECTED_BODY_CHAIN, "body-chain hinges");
  requireCount(northBase.length, EXPECTED_BASE_PER_SIDE, "sheet-north flap-base hinges");
  requireCount(southBase.length, EXPECTED_BASE_PER_SIDE, "sheet-south flap-base hinges");
  requireCount(northDiagonal.length, EXPECTED_DIAGONAL_PER_SIDE, "sheet-north diagonal hinges");
  requireCount(southDiagonal.length, EXPECTED_DIAGONAL_PER_SIDE, "sheet-south diagonal hinges");

  if (body.some((role) => {
    const candidate = inventory.hingeCandidates.find((item) => item.id === role.candidateId)!;
    return !isVertical(candidate) || Math.abs(candidate.lengthMm - geometry.bodyBand.heightMm) > BODY_LENGTH_TOLERANCE_MM || candidate.lengthMm < BODY_MIN_LENGTH_MM;
  })) {
    throw new Error("Golden body-chain crease geometry changed from the reviewed near-300 mm vertical hinges.");
  }

  const baseRoles = [...northBase, ...southBase];
  if (baseRoles.some((role) => {
    const candidate = inventory.hingeCandidates.find((item) => item.id === role.candidateId)!;
    const expectedY = role.kind === "north-base" ? geometry.bodyBand.minY : geometry.bodyBand.maxY;
    return !isHorizontal(candidate) || Math.abs(candidate.start.y - expectedY) > AXIS_TOLERANCE_MM || Math.abs(candidate.end.y - expectedY) > AXIS_TOLERANCE_MM;
  })) {
    throw new Error("Golden flap-base crease geometry changed from the reviewed body-band boundaries.");
  }

  const diagonalRoles = [...northDiagonal, ...southDiagonal];
  if (diagonalRoles.some((role) => {
    const candidate = inventory.hingeCandidates.find((item) => item.id === role.candidateId)!;
    return !isDiagonal(candidate);
  })) {
    throw new Error("Golden diagonal sub-flap crease geometry is no longer diagonal.");
  }

  const roles = [...body, ...northBase, ...southBase, ...northDiagonal, ...southDiagonal];
  if (new Set(roles.map((role) => role.candidateId)).size !== inventory.hingeCandidates.length) {
    throw new Error("Golden hinge-role classifier did not assign every physical hinge exactly once.");
  }
  if (new Set(roles.map((role) => role.id)).size !== roles.length) {
    throw new Error("Golden hinge-role classifier generated duplicate stable role ids.");
  }

  return {
    sourceSha256: geometry.sourceSha256,
    roles,
    bodyChainLeftToRight: body,
    northBaseLeftToRight: northBase,
    southBaseLeftToRight: southBase,
    northDiagonalsLeftToRight: northDiagonal,
    southDiagonalsLeftToRight: southDiagonal,
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
