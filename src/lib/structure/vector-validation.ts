import {
  CORE_STRUCTURAL_OPERATIONS,
  DEFAULT_STRUCTURAL_TOLERANCES,
  FINISHING_OPERATIONS,
  type AffineMatrix,
  type CanonicalDieline,
  type StructuralOperation,
  type StructuralTolerances,
  type Vec2,
  type VectorSegment,
} from "./vector-domain";

const TAU = Math.PI * 2;
const SHA_256 = /^[a-f0-9]{64}$/;
const CUSTOM_OPERATION = /^custom:[a-z0-9][a-z0-9._/-]*$/i;

export type DielineValidationIssue = Readonly<{
  code: string;
  message: string;
  entityId?: string;
  pathId?: string;
  segmentIndex?: number;
}>;

export class InvalidCanonicalDielineError extends Error {
  readonly issues: readonly DielineValidationIssue[];

  constructor(issues: readonly DielineValidationIssue[]) {
    super(`Invalid canonical dieline (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
    this.name = "InvalidCanonicalDielineError";
    this.issues = issues;
  }
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isFiniteVec2(point: Vec2): boolean {
  return isFiniteNumber(point.x) && isFiniteNumber(point.y);
}

function isFiniteMatrix(matrix: AffineMatrix): boolean {
  return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(isFiniteNumber);
}

function applyMatrix(matrix: AffineMatrix, point: Vec2): Vec2 {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function pointDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segmentHasExtent(
  segment: VectorSegment,
  transform: AffineMatrix,
  epsilonMm: number,
): boolean {
  let representativePoints: readonly Vec2[];
  switch (segment.kind) {
    case "line":
      representativePoints = [segment.start, segment.end];
      break;
    case "quadratic":
      representativePoints = [segment.p0, segment.p1, segment.p2];
      break;
    case "cubic":
      representativePoints = [segment.p0, segment.p1, segment.p2, segment.p3];
      break;
    case "arc":
    case "elliptical-arc":
      // Positive radii, non-zero sweep, and a non-singular transform guarantee extent.
      return true;
  }
  const transformed = representativePoints.map((point) => applyMatrix(transform, point));
  for (let first = 0; first < transformed.length; first += 1) {
    for (let second = first + 1; second < transformed.length; second += 1) {
      if (pointDistance(transformed[first], transformed[second]) > epsilonMm) return true;
    }
  }
  return false;
}

function segmentEndpoint(segment: VectorSegment, atEnd: boolean): Vec2 {
  switch (segment.kind) {
    case "line":
      return atEnd ? segment.end : segment.start;
    case "quadratic":
      return atEnd ? segment.p2 : segment.p0;
    case "cubic":
      return atEnd ? segment.p3 : segment.p0;
    case "arc": {
      const angle = segment.startAngleRad + (atEnd ? segment.sweepAngleRad : 0);
      return {
        x: segment.center.x + segment.radius * Math.cos(angle),
        y: segment.center.y + segment.radius * Math.sin(angle),
      };
    }
    case "elliptical-arc": {
      const angle = segment.startAngleRad + (atEnd ? segment.sweepAngleRad : 0);
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);
      const cosRotation = Math.cos(segment.rotationRad);
      const sinRotation = Math.sin(segment.rotationRad);
      return {
        x:
          segment.center.x +
          segment.radiusX * cosAngle * cosRotation -
          segment.radiusY * sinAngle * sinRotation,
        y:
          segment.center.y +
          segment.radiusX * cosAngle * sinRotation +
          segment.radiusY * sinAngle * cosRotation,
      };
    }
  }
}

export function isStructuralOperation(value: string): value is StructuralOperation {
  return (
    (CORE_STRUCTURAL_OPERATIONS as readonly string[]).includes(value) ||
    (FINISHING_OPERATIONS as readonly string[]).includes(value) ||
    CUSTOM_OPERATION.test(value)
  );
}

export function validateStructuralTolerances(
  tolerances: StructuralTolerances,
): readonly string[] {
  const issues: string[] = [];
  const distanceFields: readonly (keyof Omit<StructuralTolerances, "maxSubdivisionDepth">)[] = [
    "coordinateEpsilonMm",
    "topologySnapMm",
    "curveFlatteningMm",
    "boundaryComparisonMm",
    "metricSampleSpacingMm",
  ];

  for (const field of distanceFields) {
    const value = tolerances[field];
    if (!Number.isFinite(value) || value <= 0) {
      issues.push(`${field} must be a finite positive millimetre value`);
    }
  }
  if (
    !Number.isInteger(tolerances.maxSubdivisionDepth) ||
    tolerances.maxSubdivisionDepth < 1 ||
    tolerances.maxSubdivisionDepth > 64
  ) {
    issues.push("maxSubdivisionDepth must be an integer from 1 through 64");
  }
  if (tolerances.coordinateEpsilonMm > tolerances.topologySnapMm) {
    issues.push("coordinateEpsilonMm must not exceed topologySnapMm");
  }
  if (tolerances.curveFlatteningMm > tolerances.boundaryComparisonMm) {
    issues.push("curveFlatteningMm must not exceed boundaryComparisonMm");
  }
  return issues;
}

export function createStructuralTolerances(
  overrides: Partial<StructuralTolerances> = {},
): StructuralTolerances {
  const tolerances = Object.freeze({ ...DEFAULT_STRUCTURAL_TOLERANCES, ...overrides });
  const issues = validateStructuralTolerances(tolerances);
  if (issues.length > 0) {
    throw new RangeError(`Invalid structural tolerances: ${issues.join("; ")}`);
  }
  return tolerances;
}

function validateSegment(segment: VectorSegment): string[] {
  const issues: string[] = [];
  switch (segment.kind) {
    case "line":
      if (!isFiniteVec2(segment.start) || !isFiniteVec2(segment.end)) {
        issues.push("line endpoints must be finite");
      }
      break;
    case "quadratic":
      if (![segment.p0, segment.p1, segment.p2].every(isFiniteVec2)) {
        issues.push("quadratic control points must be finite");
      }
      break;
    case "cubic":
      if (![segment.p0, segment.p1, segment.p2, segment.p3].every(isFiniteVec2)) {
        issues.push("cubic control points must be finite");
      }
      break;
    case "arc":
      if (!isFiniteVec2(segment.center)) issues.push("arc center must be finite");
      if (!isFiniteNumber(segment.radius) || segment.radius <= 0) {
        issues.push("arc radius must be finite and positive");
      }
      if (!isFiniteNumber(segment.startAngleRad) || !isFiniteNumber(segment.sweepAngleRad)) {
        issues.push("arc angles must be finite");
      } else if (Math.abs(segment.sweepAngleRad) <= Number.EPSILON) {
        issues.push("arc sweep must be non-zero");
      } else if (Math.abs(segment.sweepAngleRad) > TAU + Number.EPSILON * 16) {
        issues.push("arc sweep must not exceed one complete revolution");
      }
      break;
    case "elliptical-arc":
      if (!isFiniteVec2(segment.center)) issues.push("elliptical arc center must be finite");
      if (!isFiniteNumber(segment.radiusX) || segment.radiusX <= 0) {
        issues.push("elliptical arc radiusX must be finite and positive");
      }
      if (!isFiniteNumber(segment.radiusY) || segment.radiusY <= 0) {
        issues.push("elliptical arc radiusY must be finite and positive");
      }
      if (
        !isFiniteNumber(segment.rotationRad) ||
        !isFiniteNumber(segment.startAngleRad) ||
        !isFiniteNumber(segment.sweepAngleRad)
      ) {
        issues.push("elliptical arc angles must be finite");
      } else if (Math.abs(segment.sweepAngleRad) <= Number.EPSILON) {
        issues.push("elliptical arc sweep must be non-zero");
      } else if (Math.abs(segment.sweepAngleRad) > TAU + Number.EPSILON * 16) {
        issues.push("elliptical arc sweep must not exceed one complete revolution");
      }
      break;
  }
  return issues;
}

export function validateCanonicalDieline(
  dieline: CanonicalDieline,
): readonly DielineValidationIssue[] {
  const issues: DielineValidationIssue[] = [];
  if (dieline.schemaVersion !== 2) {
    issues.push({ code: "schema-version", message: "schemaVersion must be 2" });
  }
  if (dieline.units !== "mm") {
    issues.push({ code: "units", message: "canonical dieline units must be mm" });
  }
  if (dieline.coordinateSystem !== "x-right-y-down") {
    issues.push({
      code: "coordinate-system",
      message: "canonical dieline coordinates must be x-right-y-down",
    });
  }
  if (!dieline.id.trim()) {
    issues.push({ code: "dieline-id", message: "dieline id must not be empty" });
  }
  if (!Number.isFinite(dieline.widthMm) || dieline.widthMm <= 0) {
    issues.push({ code: "width", message: "widthMm must be finite and positive" });
  }
  if (!Number.isFinite(dieline.heightMm) || dieline.heightMm <= 0) {
    issues.push({ code: "height", message: "heightMm must be finite and positive" });
  }
  for (const message of validateStructuralTolerances(dieline.tolerances)) {
    issues.push({ code: "tolerance", message });
  }
  if (!dieline.source.id.trim()) {
    issues.push({ code: "source-id", message: "source id must not be empty" });
  }
  if (dieline.source.sha256 && !SHA_256.test(dieline.source.sha256)) {
    issues.push({ code: "source-hash", message: "source sha256 must be lower-case hexadecimal" });
  }

  const entityIds = new Set<string>();
  const pathIds = new Set<string>();
  for (const entity of dieline.entities) {
    if (!entity.id.trim()) {
      issues.push({ code: "entity-id", message: "entity id must not be empty" });
    } else if (entityIds.has(entity.id)) {
      issues.push({ code: "duplicate-entity-id", message: `duplicate entity id ${entity.id}` });
    }
    entityIds.add(entity.id);

    if (!isStructuralOperation(entity.operation)) {
      issues.push({
        code: "operation",
        message: `unsupported structural operation ${entity.operation}`,
        entityId: entity.id,
      });
    }
    if (
      entity.classification.confidence !== undefined &&
      (!Number.isFinite(entity.classification.confidence) ||
        entity.classification.confidence < 0 ||
        entity.classification.confidence > 1)
    ) {
      issues.push({
        code: "classification-confidence",
        message: "classification confidence must be between 0 and 1",
        entityId: entity.id,
      });
    }
    if (
      entity.classification.method === "inferred" &&
      entity.classification.confidence === undefined
    ) {
      issues.push({
        code: "missing-inference-confidence",
        message: "inferred operation classification must include confidence",
        entityId: entity.id,
      });
    }

    const path = entity.path;
    if (!path.id.trim()) {
      issues.push({ code: "path-id", message: "path id must not be empty", entityId: entity.id });
    } else if (pathIds.has(path.id)) {
      issues.push({
        code: "duplicate-path-id",
        message: `duplicate path id ${path.id}`,
        entityId: entity.id,
        pathId: path.id,
      });
    }
    pathIds.add(path.id);
    if (!isFiniteMatrix(path.transform)) {
      issues.push({
        code: "path-transform",
        message: "path transform must contain finite values",
        entityId: entity.id,
        pathId: path.id,
      });
    } else if (
      Math.abs(path.transform.a * path.transform.d - path.transform.b * path.transform.c) <=
      Number.EPSILON
    ) {
      issues.push({
        code: "singular-path-transform",
        message: "path transform must not collapse structural geometry",
        entityId: entity.id,
        pathId: path.id,
      });
    }
    if (path.segments.length === 0) {
      issues.push({
        code: "empty-path",
        message: "vector path must contain at least one segment",
        entityId: entity.id,
        pathId: path.id,
      });
      continue;
    }
    if (entity.operation === "window-cut" && !path.closed) {
      issues.push({
        code: "open-window-cut",
        message: "window-cut operation must be a closed contour",
        entityId: entity.id,
        pathId: path.id,
      });
    }

    path.segments.forEach((segment, segmentIndex) => {
      for (const message of validateSegment(segment)) {
        issues.push({
          code: "invalid-segment",
          message,
          entityId: entity.id,
          pathId: path.id,
          segmentIndex,
        });
      }
      if (
        isFiniteMatrix(path.transform) &&
        !segmentHasExtent(segment, path.transform, dieline.tolerances.coordinateEpsilonMm)
      ) {
        issues.push({
          code: "zero-length-segment",
          message: "segment has no physical extent",
          entityId: entity.id,
          pathId: path.id,
          segmentIndex,
        });
      }
      if (segmentIndex > 0) {
        const previous = path.segments[segmentIndex - 1];
        const gap = pointDistance(
          applyMatrix(path.transform, segmentEndpoint(previous, true)),
          applyMatrix(path.transform, segmentEndpoint(segment, false)),
        );
        if (gap > dieline.tolerances.topologySnapMm) {
          issues.push({
            code: "path-gap",
            message: `segment gap ${gap.toFixed(6)} mm exceeds topologySnapMm`,
            entityId: entity.id,
            pathId: path.id,
            segmentIndex,
          });
        }
      }
    });

    if (path.closed) {
      const gap = pointDistance(
        applyMatrix(path.transform, segmentEndpoint(path.segments[path.segments.length - 1], true)),
        applyMatrix(path.transform, segmentEndpoint(path.segments[0], false)),
      );
      if (gap > dieline.tolerances.topologySnapMm) {
        issues.push({
          code: "open-closed-path",
          message: `closed path endpoint gap ${gap.toFixed(6)} mm exceeds topologySnapMm`,
          entityId: entity.id,
          pathId: path.id,
          segmentIndex: path.segments.length - 1,
        });
      }
    }
  }
  return issues;
}

export function assertCanonicalDieline(dieline: CanonicalDieline): void {
  const issues = validateCanonicalDieline(dieline);
  if (issues.length > 0) throw new InvalidCanonicalDielineError(issues);
}
