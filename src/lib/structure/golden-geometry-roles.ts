import type { CanonicalDieline } from "./vector-domain";
import type { StructuralPanel } from "./topology";
import { LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS } from "./structural-acceptance";

export type GoldenBodyRole =
  | "seam-candidate"
  | "broad-plain"
  | "narrow"
  | "broad-window";

export type GoldenPanelGeometryRole = Readonly<{
  panelId: string;
  sheetRegion: "north-flap" | "body-band" | "south-flap";
  bodyRole?: GoldenBodyRole;
  xOrder: number;
  widthMm: number;
  heightMm: number;
  holeCount: number;
}>;

export type GoldenGeometryRoleReport = Readonly<{
  sourceSha256: string;
  bodyBand: Readonly<{ minY: number; maxY: number; heightMm: number }>;
  roles: readonly GoldenPanelGeometryRole[];
  bodyPanelsLeftToRight: readonly GoldenPanelGeometryRole[];
  northFlapsLeftToRight: readonly GoldenPanelGeometryRole[];
  southFlapsLeftToRight: readonly GoldenPanelGeometryRole[];
  gates: Readonly<{
    sourceLock: boolean;
    totalPanelCount: boolean;
    bodyPanelCount: boolean;
    northFlapCount: boolean;
    southFlapCount: boolean;
    seamCandidateCount: boolean;
    broadPanelCount: boolean;
    narrowPanelCount: boolean;
    singleWindowBodyPanel: boolean;
    bodyBandHeight: boolean;
  }>;
  passed: boolean;
}>;

const EXPECTED_PANEL_COUNT = 17;
const EXPECTED_BODY_COUNT = 5;
const EXPECTED_FLAPS_PER_SIDE = 6;
const NOMINAL_BODY_HEIGHT_MM = 300;
const BODY_HEIGHT_TOLERANCE_MM = 1;
const BODY_BOUNDARY_TOLERANCE_MM = 0.1;

function width(panel: StructuralPanel): number {
  return panel.bounds.maxX - panel.bounds.minX;
}

function height(panel: StructuralPanel): number {
  return panel.bounds.maxY - panel.bounds.minY;
}

function centerX(panel: StructuralPanel): number {
  return (panel.bounds.minX + panel.bounds.maxX) / 2;
}

function bodyRole(panel: StructuralPanel): GoldenBodyRole {
  const panelWidth = width(panel);
  if (panelWidth < 30) return "seam-candidate";
  if (panelWidth >= 180) return panel.holes.length === 1 ? "broad-window" : "broad-plain";
  return "narrow";
}

function roleFor(
  panel: StructuralPanel,
  sheetRegion: GoldenPanelGeometryRole["sheetRegion"],
  xOrder: number,
): GoldenPanelGeometryRole {
  return {
    panelId: panel.id,
    sheetRegion,
    bodyRole: sheetRegion === "body-band" ? bodyRole(panel) : undefined,
    xOrder,
    widthMm: width(panel),
    heightMm: height(panel),
    holeCount: panel.holes.length,
  };
}

/**
 * Source-specific geometry-role classifier for the authorized golden carton.
 *
 * It deliberately names only facts visible in the exact flat geometry. Sheet
 * north/south are not called physical top/bottom, and the narrow side strip is
 * only a seam *candidate* because glue semantics are not encoded by the PDF.
 */
export function classifyLockBottomGoldenGeometry(
  dieline: CanonicalDieline,
  panels: readonly StructuralPanel[],
): GoldenGeometryRoleReport {
  const sourceSha256 = dieline.source.sha256 ?? "";
  const sourceLock =
    sourceSha256.toLowerCase() ===
    LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS.sourceSha256.toLowerCase();
  if (!sourceLock) {
    throw new Error("Golden geometry roles may only be derived from the hash-locked authorized source.");
  }

  const bodyPanels = panels
    .filter((panel) => Math.abs(height(panel) - NOMINAL_BODY_HEIGHT_MM) <= BODY_HEIGHT_TOLERANCE_MM)
    .sort((left, right) => centerX(left) - centerX(right));

  if (bodyPanels.length !== EXPECTED_BODY_COUNT) {
    throw new Error(`Golden geometry role classifier expected ${EXPECTED_BODY_COUNT} body-band panels; found ${bodyPanels.length}.`);
  }

  const bodyMinY = Math.min(...bodyPanels.map((panel) => panel.bounds.minY));
  const bodyMaxY = Math.max(...bodyPanels.map((panel) => panel.bounds.maxY));
  const bodyBandHeight = bodyMaxY - bodyMinY;

  const northPanels = panels
    .filter((panel) => panel.bounds.maxY <= bodyMinY + BODY_BOUNDARY_TOLERANCE_MM)
    .sort((left, right) => centerX(left) - centerX(right) || left.bounds.minY - right.bounds.minY);
  const southPanels = panels
    .filter((panel) => panel.bounds.minY >= bodyMaxY - BODY_BOUNDARY_TOLERANCE_MM)
    .sort((left, right) => centerX(left) - centerX(right) || left.bounds.minY - right.bounds.minY);

  const assigned = new Set([...bodyPanels, ...northPanels, ...southPanels].map((panel) => panel.id));
  if (assigned.size !== panels.length) {
    const unresolved = panels.filter((panel) => !assigned.has(panel.id)).map((panel) => panel.id);
    throw new Error(`Golden geometry role classifier left panels unassigned: ${unresolved.join(", ")}.`);
  }

  const bodyRoles = bodyPanels.map((panel, index) => roleFor(panel, "body-band", index));
  const northRoles = northPanels.map((panel, index) => roleFor(panel, "north-flap", index));
  const southRoles = southPanels.map((panel, index) => roleFor(panel, "south-flap", index));
  const seamCandidateCount = bodyRoles.filter((role) => role.bodyRole === "seam-candidate").length;
  const broadRoles = bodyRoles.filter(
    (role) => role.bodyRole === "broad-plain" || role.bodyRole === "broad-window",
  );
  const narrowRoles = bodyRoles.filter((role) => role.bodyRole === "narrow");
  const windowBodyRoles = bodyRoles.filter((role) => role.bodyRole === "broad-window");

  const gates = {
    sourceLock,
    totalPanelCount: panels.length === EXPECTED_PANEL_COUNT,
    bodyPanelCount: bodyRoles.length === EXPECTED_BODY_COUNT,
    northFlapCount: northRoles.length === EXPECTED_FLAPS_PER_SIDE,
    southFlapCount: southRoles.length === EXPECTED_FLAPS_PER_SIDE,
    seamCandidateCount: seamCandidateCount === 1,
    broadPanelCount: broadRoles.length === 2,
    narrowPanelCount: narrowRoles.length === 2,
    singleWindowBodyPanel: windowBodyRoles.length === 1 && windowBodyRoles[0].holeCount === 1,
    bodyBandHeight: Math.abs(bodyBandHeight - NOMINAL_BODY_HEIGHT_MM) <= BODY_HEIGHT_TOLERANCE_MM,
  } as const;

  return {
    sourceSha256,
    bodyBand: { minY: bodyMinY, maxY: bodyMaxY, heightMm: bodyBandHeight },
    roles: [...northRoles, ...bodyRoles, ...southRoles],
    bodyPanelsLeftToRight: bodyRoles,
    northFlapsLeftToRight: northRoles,
    southFlapsLeftToRight: southRoles,
    gates,
    passed: Object.values(gates).every(Boolean),
  };
}
