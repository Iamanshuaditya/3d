import type { GoldenGeometryRoleReport, GoldenPanelGeometryRole } from "./golden-geometry-roles";
import type { GoldenHingeRole, GoldenHingeRoleReport } from "./golden-hinge-roles";

export type GoldenBodyHandedness = "negative-depth" | "positive-depth";

export type GoldenBodyHingeDefinition = Readonly<{
  roleId: string;
  parentPanelId: string;
  childPanelId: string;
  assembledAngleDeg: number;
  source: GoldenHingeRole["source"];
  evidence: "CANONICAL_RECTANGULAR_TUBE_RECONSTRUCTION_UP_TO_GLOBAL_MIRROR";
}>;

export type GoldenBodyTubeCertificate = Readonly<{
  handedness: GoldenBodyHandedness;
  rootPanelId: string;
  hinges: readonly GoldenBodyHingeDefinition[];
  dimensionsMm: Readonly<{
    height: number;
    frontWidth: number;
    backWidth: number;
    leftDepth: number;
    rightDepth: number;
    seamOverlap: number;
  }>;
  closureGapMm: number;
  seamLineErrorMm: number;
  orthogonalityError: number;
  corners: Readonly<{
    frontLeft: Readonly<{ x: number; depth: number }>;
    frontRight: Readonly<{ x: number; depth: number }>;
    backLeft: Readonly<{ x: number; depth: number }>;
    backRightFromBackPanel: Readonly<{ x: number; depth: number }>;
    backRightFromSidePanel: Readonly<{ x: number; depth: number }>;
    seamInner: Readonly<{ x: number; depth: number }>;
  }>;
  gates: Readonly<{
    reviewedBodyRoleOrder: boolean;
    nominalHeight: boolean;
    oppositeBroadWalls: boolean;
    oppositeNarrowWalls: boolean;
    rectangularClosure: boolean;
    orthogonalWalls: boolean;
    seamOverlapInsideSideWall: boolean;
  }>;
  passed: boolean;
}>;

type Point2 = { x: number; depth: number };
type Affine2 = { a: number; b: number; c: number; d: number; tx: number; ty: number };

const DIMENSION_TOLERANCE_MM = 1;
const CLOSURE_TOLERANCE_MM = 1;
const LINE_TOLERANCE_MM = 0.05;
const ORTHOGONAL_DOT_TOLERANCE = 1e-9;
const EXPECTED_HEIGHT_MM = 300;
const EXPECTED_BROAD_MM = 200;
const EXPECTED_NARROW_MM = 150;

const identity = (): Affine2 => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

function compose(parent: Affine2, local: Affine2): Affine2 {
  return {
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    tx: parent.a * local.tx + parent.c * local.ty + parent.tx,
    ty: parent.b * local.tx + parent.d * local.ty + parent.ty,
  };
}

function rotateAboutSheetX(pivotX: number, angleDeg: number): Affine2 {
  const radians = angleDeg * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    tx: pivotX - cos * pivotX,
    ty: -sin * pivotX,
  };
}

function apply(matrix: Affine2, point: Point2): Point2 {
  return {
    x: matrix.a * point.x + matrix.c * point.depth + matrix.tx,
    depth: matrix.b * point.x + matrix.d * point.depth + matrix.ty,
  };
}

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.depth - b.depth);
}

function dot(a: Point2, b: Point2): number {
  return a.x * b.x + a.depth * b.depth;
}

function vector(from: Point2, to: Point2): Point2 {
  return { x: to.x - from.x, depth: to.depth - from.depth };
}

function pointLineDistance(point: Point2, lineA: Point2, lineB: Point2): number {
  const axis = vector(lineA, lineB);
  const length = Math.hypot(axis.x, axis.depth);
  if (length <= Number.EPSILON) return Number.POSITIVE_INFINITY;
  return Math.abs(axis.x * (lineA.depth - point.depth) - (lineA.x - point.x) * axis.depth) / length;
}

function projectionFraction(point: Point2, lineA: Point2, lineB: Point2): number {
  const axis = vector(lineA, lineB);
  const denominator = dot(axis, axis);
  if (denominator <= Number.EPSILON) return Number.NaN;
  return dot(vector(lineA, point), axis) / denominator;
}

function bodyPanels(geometry: GoldenGeometryRoleReport): readonly GoldenPanelGeometryRole[] {
  const panels = geometry.bodyPanelsLeftToRight;
  const expected = ["seam-candidate", "broad-plain", "narrow", "broad-window", "narrow"] as const;
  if (panels.length !== expected.length || panels.some((panel, index) => panel.bodyRole !== expected[index])) {
    throw new Error("Golden body-tube reconstruction requires the reviewed seam/broad/narrow/window/narrow body order.");
  }
  return panels;
}

function bodyHinges(hinges: GoldenHingeRoleReport): readonly GoldenHingeRole[] {
  const body = hinges.bodyChainLeftToRight;
  if (body.length !== 4 || body.some((hinge, index) => hinge.bodyXOrder !== index)) {
    throw new Error("Golden body-tube reconstruction requires four ordered body-chain hinges.");
  }
  return body;
}

/**
 * Certifies a canonical rectangular 200 x 150 mm body reconstruction from the
 * exact reviewed flat geometry. The recording/PDF does not recover the original
 * implementation's global mountain/valley sign, so both handedness choices are
 * valid mirror conventions. No closure-flap semantics are inferred here.
 */
export function certifyLockBottomGoldenBodyTube(
  geometry: GoldenGeometryRoleReport,
  hingeRoles: GoldenHingeRoleReport,
  handedness: GoldenBodyHandedness = "negative-depth",
): GoldenBodyTubeCertificate {
  if (!geometry.passed || !hingeRoles.passed) {
    throw new Error("Golden body-tube reconstruction requires passed geometry and hinge-role reports.");
  }
  if (geometry.sourceSha256.toLowerCase() !== hingeRoles.sourceSha256.toLowerCase()) {
    throw new Error("Golden body geometry and hinge roles do not describe the same source hash.");
  }

  const panels = bodyPanels(geometry);
  const hinges = bodyHinges(hingeRoles);
  const [seam, broad, narrowLeft, window, narrowRight] = panels;
  const sign = handedness === "negative-depth" ? 1 : -1;

  const rootPanelId = window.panelId;
  const directed: GoldenBodyHingeDefinition[] = [
    {
      roleId: hinges[2].id,
      parentPanelId: rootPanelId,
      childPanelId: narrowLeft.panelId,
      assembledAngleDeg: 90 * sign,
      source: hinges[2].source,
      evidence: "CANONICAL_RECTANGULAR_TUBE_RECONSTRUCTION_UP_TO_GLOBAL_MIRROR",
    },
    {
      roleId: hinges[1].id,
      parentPanelId: narrowLeft.panelId,
      childPanelId: broad.panelId,
      assembledAngleDeg: 90 * sign,
      source: hinges[1].source,
      evidence: "CANONICAL_RECTANGULAR_TUBE_RECONSTRUCTION_UP_TO_GLOBAL_MIRROR",
    },
    {
      roleId: hinges[0].id,
      parentPanelId: broad.panelId,
      childPanelId: seam.panelId,
      assembledAngleDeg: 90 * sign,
      source: hinges[0].source,
      evidence: "CANONICAL_RECTANGULAR_TUBE_RECONSTRUCTION_UP_TO_GLOBAL_MIRROR",
    },
    {
      roleId: hinges[3].id,
      parentPanelId: rootPanelId,
      childPanelId: narrowRight.panelId,
      assembledAngleDeg: -90 * sign,
      source: hinges[3].source,
      evidence: "CANONICAL_RECTANGULAR_TUBE_RECONSTRUCTION_UP_TO_GLOBAL_MIRROR",
    },
  ];

  const wSeam = seam.widthMm;
  const wBack = broad.widthMm;
  const wLeft = narrowLeft.widthMm;
  const wFront = window.widthMm;
  const wRight = narrowRight.widthMm;

  // Canonical sheet x positions relative to the window wall's left crease.
  const xWindowLeft = 0;
  const xWindowRight = wFront;
  const xNarrowLeftFar = -wLeft;
  const xBroadFar = -(wLeft + wBack);
  const xSeamFar = -(wLeft + wBack + wSeam);
  const xNarrowRightFar = wFront + wRight;

  const root = identity();
  const narrowLeftTransform = compose(root, rotateAboutSheetX(xWindowLeft, 90 * sign));
  const broadTransform = compose(narrowLeftTransform, rotateAboutSheetX(xNarrowLeftFar, 90 * sign));
  const seamTransform = compose(broadTransform, rotateAboutSheetX(xBroadFar, 90 * sign));
  const narrowRightTransform = compose(root, rotateAboutSheetX(xWindowRight, -90 * sign));

  const frontLeft = apply(root, { x: xWindowLeft, depth: 0 });
  const frontRight = apply(root, { x: xWindowRight, depth: 0 });
  const backLeft = apply(narrowLeftTransform, { x: xNarrowLeftFar, depth: 0 });
  const backRightFromBackPanel = apply(broadTransform, { x: xBroadFar, depth: 0 });
  const backRightFromSidePanel = apply(narrowRightTransform, { x: xNarrowRightFar, depth: 0 });
  const seamInner = apply(seamTransform, { x: xSeamFar, depth: 0 });

  const closureGapMm = distance(backRightFromBackPanel, backRightFromSidePanel);
  const seamLineErrorMm = pointLineDistance(seamInner, backRightFromSidePanel, frontRight);
  const seamFraction = projectionFraction(seamInner, backRightFromSidePanel, frontRight);
  const frontAxis = vector(frontLeft, frontRight);
  const sideAxis = vector(frontLeft, backLeft);
  const orthogonalityError = Math.abs(dot(frontAxis, sideAxis)) /
    Math.max(Number.EPSILON, Math.hypot(frontAxis.x, frontAxis.depth) * Math.hypot(sideAxis.x, sideAxis.depth));

  const gates = {
    reviewedBodyRoleOrder: true,
    nominalHeight: Math.abs(geometry.bodyBand.heightMm - EXPECTED_HEIGHT_MM) <= DIMENSION_TOLERANCE_MM,
    oppositeBroadWalls:
      Math.abs(wFront - EXPECTED_BROAD_MM) <= DIMENSION_TOLERANCE_MM &&
      Math.abs(wBack - EXPECTED_BROAD_MM) <= DIMENSION_TOLERANCE_MM &&
      Math.abs(wFront - wBack) <= DIMENSION_TOLERANCE_MM,
    oppositeNarrowWalls:
      Math.abs(wLeft - EXPECTED_NARROW_MM) <= DIMENSION_TOLERANCE_MM &&
      Math.abs(wRight - EXPECTED_NARROW_MM) <= DIMENSION_TOLERANCE_MM &&
      Math.abs(wLeft - wRight) <= CLOSURE_TOLERANCE_MM,
    rectangularClosure: closureGapMm <= CLOSURE_TOLERANCE_MM,
    orthogonalWalls: orthogonalityError <= ORTHOGONAL_DOT_TOLERANCE,
    seamOverlapInsideSideWall:
      wSeam > 0 && wSeam < wRight && seamLineErrorMm <= LINE_TOLERANCE_MM && seamFraction >= -1e-9 && seamFraction <= 1 + 1e-9,
  };

  return {
    handedness,
    rootPanelId,
    hinges: directed,
    dimensionsMm: {
      height: geometry.bodyBand.heightMm,
      frontWidth: wFront,
      backWidth: wBack,
      leftDepth: wLeft,
      rightDepth: wRight,
      seamOverlap: wSeam,
    },
    closureGapMm,
    seamLineErrorMm,
    orthogonalityError,
    corners: {
      frontLeft,
      frontRight,
      backLeft,
      backRightFromBackPanel,
      backRightFromSidePanel,
      seamInner,
    },
    gates,
    passed: Object.values(gates).every(Boolean),
  };
}
