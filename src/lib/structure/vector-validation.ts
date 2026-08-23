import {
  CORE_STRUCTURAL_OPERATIONS,
  DEFAULT_STRUCTURAL_TOLERANCES,
  FINISHING_OPERATIONS,
  type AffineMatrix,
  type CanonicalDieline,
  type CanonicalDielineSource,
  type SourceProvenance,
  type StructuralOperation,
  type StructuralTolerances,
  type Vec2,
  type VectorSegment,
} from "./vector-domain";
import {
  affineConditionNumber,
  applyAffine,
  evaluateVectorSegment,
  flattenVectorPath,
  vectorPathSignedAreaExact,
} from "./vector-math";

const TAU = Math.PI * 2;
const SHA_256 = /^[a-f0-9]{64}$/;
const CUSTOM_OPERATION = /^custom:[a-z0-9][a-z0-9._/-]*$/i;
const MAX_AFFINE_CONDITION_NUMBER = 1e12;

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

function segmentRepresentativePoints(segment: VectorSegment): readonly Vec2[] {
  switch (segment.kind) {
    case "line":
      return [segment.start, segment.end];
    case "quadratic":
      return [segment.p0, segment.p1, segment.p2, evaluateVectorSegment(segment, 0.5)];
    case "cubic":
      return [
        segment.p0,
        segment.p1,
        segment.p2,
        segment.p3,
        evaluateVectorSegment(segment, 0.25),
        evaluateVectorSegment(segment, 0.5),
        evaluateVectorSegment(segment, 0.75),
      ];
    case "arc":
    case "elliptical-arc":
      return [
        segment.center,
        evaluateVectorSegment(segment, 0),
        evaluateVectorSegment(segment, 0.25),
        evaluateVectorSegment(segment, 0.5),
        evaluateVectorSegment(segment, 0.75),
        evaluateVectorSegment(segment, 1),
      ];
  }
}

function transformedRepresentativePoints(
  segment: VectorSegment,
  transform: AffineMatrix,
): readonly Vec2[] {
  return segmentRepresentativePoints(segment).map((point) => applyAffine(transform, point));
}

function segmentHasFiniteTransformedGeometry(
  segment: VectorSegment,
  transform: AffineMatrix,
): boolean {
  if (!transformedRepresentativePoints(segment, transform).every(isFiniteVec2)) return false;
  if (segment.kind !== "arc" && segment.kind !== "elliptical-arc") return true;
  const cosine = segment.kind === "arc" ? 1 : Math.cos(segment.rotationRad);
  const sine = segment.kind === "arc" ? 0 : Math.sin(segment.rotationRad);
  const radiusX = segment.kind === "arc" ? segment.radius : segment.radiusX;
  const radiusY = segment.kind === "arc" ? segment.radius : segment.radiusY;
  const cosineBasis = { x: radiusX * cosine, y: radiusX * sine };
  const sineBasis = { x: -radiusY * sine, y: radiusY * cosine };
  const center = applyAffine(transform, segment.center);
  const transformedCosineBasis = {
    x: transform.a * cosineBasis.x + transform.c * cosineBasis.y,
    y: transform.b * cosineBasis.x + transform.d * cosineBasis.y,
  };
  const transformedSineBasis = {
    x: transform.a * sineBasis.x + transform.c * sineBasis.y,
    y: transform.b * sineBasis.x + transform.d * sineBasis.y,
  };
  const xEnvelope =
    Math.abs(center.x) + Math.hypot(transformedCosineBasis.x, transformedSineBasis.x);
  const yEnvelope =
    Math.abs(center.y) + Math.hypot(transformedCosineBasis.y, transformedSineBasis.y);
  return Number.isFinite(xEnvelope) && Number.isFinite(yEnvelope);
}

function segmentHasExtent(
  segment: VectorSegment,
  transform: AffineMatrix,
  epsilonMm: number,
): boolean {
  const transformed = transformedRepresentativePoints(segment, transform);
  for (let first = 0; first < transformed.length; first += 1) {
    for (let second = first + 1; second < transformed.length; second += 1) {
      if (pointDistance(transformed[first], transformed[second]) > epsilonMm) return true;
    }
  }
  return false;
}

function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: Vec2, start: Vec2, end: Vec2, epsilonMm: number): boolean {
  const length = Math.max(pointDistance(start, end), 1);
  return (
    Math.abs(cross(start, end, point)) <= epsilonMm * length &&
    point.x >= Math.min(start.x, end.x) - epsilonMm &&
    point.x <= Math.max(start.x, end.x) + epsilonMm &&
    point.y >= Math.min(start.y, end.y) - epsilonMm &&
    point.y <= Math.max(start.y, end.y) + epsilonMm
  );
}

function segmentsIntersect(
  firstStart: Vec2,
  firstEnd: Vec2,
  secondStart: Vec2,
  secondEnd: Vec2,
  epsilonMm: number,
): boolean {
  const c1 = cross(firstStart, firstEnd, secondStart);
  const c2 = cross(firstStart, firstEnd, secondEnd);
  const c3 = cross(secondStart, secondEnd, firstStart);
  const c4 = cross(secondStart, secondEnd, firstEnd);
  const firstLength = Math.max(pointDistance(firstStart, firstEnd), 1);
  const secondLength = Math.max(pointDistance(secondStart, secondEnd), 1);
  const firstTolerance = epsilonMm * firstLength;
  const secondTolerance = epsilonMm * secondLength;
  if (
    ((c1 > firstTolerance && c2 < -firstTolerance) ||
      (c1 < -firstTolerance && c2 > firstTolerance)) &&
    ((c3 > secondTolerance && c4 < -secondTolerance) ||
      (c3 < -secondTolerance && c4 > secondTolerance))
  ) {
    return true;
  }
  return (
    (Math.abs(c1) <= firstTolerance && pointOnSegment(secondStart, firstStart, firstEnd, epsilonMm)) ||
    (Math.abs(c2) <= firstTolerance && pointOnSegment(secondEnd, firstStart, firstEnd, epsilonMm)) ||
    (Math.abs(c3) <= secondTolerance && pointOnSegment(firstStart, secondStart, secondEnd, epsilonMm)) ||
    (Math.abs(c4) <= secondTolerance && pointOnSegment(firstEnd, secondStart, secondEnd, epsilonMm))
  );
}

function polylineSelfIntersects(points: readonly Vec2[], closed: boolean, epsilonMm: number): boolean {
  const segmentCount = points.length - 1 + (closed ? 1 : 0);
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      const adjacent = second === first + 1 || (closed && first === 0 && second === segmentCount - 1);
      if (adjacent) continue;
      if (
        segmentsIntersect(
          points[first],
          points[(first + 1) % points.length],
          points[second],
          points[(second + 1) % points.length],
          epsilonMm,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function uniquePointCount(points: readonly Vec2[], epsilonMm: number): number {
  const unique: Vec2[] = [];
  for (const point of points) {
    if (!unique.some((candidate) => pointDistance(candidate, point) <= epsilonMm)) unique.push(point);
  }
  return unique.length;
}

function provenanceIssues(
  provenance: SourceProvenance,
  source: CanonicalDielineSource,
  label: string,
): string[] {
  const issues: string[] = [];
  if (provenance.sourceId !== source.id) {
    issues.push(`${label} sourceId ${provenance.sourceId} does not match dieline source ${source.id}`);
  }
  if (provenance.format !== source.format) {
    issues.push(`${label} format ${provenance.format} does not match dieline source ${source.format}`);
  }
  if (provenance.sourceUnits !== undefined && provenance.sourceUnits !== source.sourceUnits) {
    issues.push(
      `${label} sourceUnits ${provenance.sourceUnits} does not match dieline source ${source.sourceUnits}`,
    );
  }
  if (provenance.sourceTransform !== undefined && !isFiniteMatrix(provenance.sourceTransform)) {
    issues.push(`${label} sourceTransform must contain finite values`);
  }
  return issues;
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
  const metricCertificateBudgetMm =
    tolerances.topologySnapMm * 2 + tolerances.metricSampleSpacingMm / 2;
  if (metricCertificateBudgetMm > tolerances.boundaryComparisonMm) {
    issues.push(
      "2 * topologySnapMm + metricSampleSpacingMm / 2 must not exceed boundaryComparisonMm",
    );
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

    for (const message of provenanceIssues(entity.provenance, dieline.source, "entity provenance")) {
      issues.push({ code: "provenance-mismatch", message, entityId: entity.id });
    }

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
    for (const message of provenanceIssues(path.provenance, dieline.source, "path provenance")) {
      issues.push({
        code: "provenance-mismatch",
        message,
        entityId: entity.id,
        pathId: path.id,
      });
    }
    if (!isFiniteMatrix(path.transform)) {
      issues.push({
        code: "path-transform",
        message: "path transform must contain finite values",
        entityId: entity.id,
        pathId: path.id,
      });
    } else if (!Number.isFinite(affineConditionNumber(path.transform))) {
      issues.push({
        code: "singular-path-transform",
        message: "path transform must not collapse structural geometry",
        entityId: entity.id,
        pathId: path.id,
      });
    } else if (affineConditionNumber(path.transform) > MAX_AFFINE_CONDITION_NUMBER) {
      issues.push({
        code: "ill-conditioned-path-transform",
        message: `path transform condition number exceeds ${MAX_AFFINE_CONDITION_NUMBER}`,
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

    let hasContinuityIssue = false;
    let hasInvalidTransformedGeometry = false;
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
      if (segment.provenance) {
        for (const message of provenanceIssues(
          segment.provenance.source,
          dieline.source,
          "segment provenance",
        )) {
          issues.push({
            code: "provenance-mismatch",
            message,
            entityId: entity.id,
            pathId: path.id,
            segmentIndex,
          });
        }
        const sourceSegmentIndex = segment.provenance.sourceSegmentIndex;
        if (
          sourceSegmentIndex !== undefined &&
          (!Number.isInteger(sourceSegmentIndex) || sourceSegmentIndex < 0)
        ) {
          issues.push({
            code: "invalid-segment-provenance",
            message: "sourceSegmentIndex must be a non-negative integer",
            entityId: entity.id,
            pathId: path.id,
            segmentIndex,
          });
        }
        const parameterRange = segment.provenance.sourceParameterRange;
        if (
          parameterRange &&
          (!parameterRange.every(Number.isFinite) ||
            parameterRange[0] < 0 ||
            parameterRange[1] > 1 ||
            parameterRange[0] >= parameterRange[1])
        ) {
          issues.push({
            code: "invalid-segment-provenance",
            message: "sourceParameterRange must be an increasing finite interval within 0..1",
            entityId: entity.id,
            pathId: path.id,
            segmentIndex,
          });
        }
      }
      const transformedGeometryIsFinite =
        isFiniteMatrix(path.transform) && segmentHasFiniteTransformedGeometry(segment, path.transform);
      if (isFiniteMatrix(path.transform)) {
        if (!transformedGeometryIsFinite) {
          hasInvalidTransformedGeometry = true;
          issues.push({
            code: "non-finite-transformed-geometry",
            message: "segment produces non-finite canonical millimetre coordinates",
            entityId: entity.id,
            pathId: path.id,
            segmentIndex,
          });
        }
      }
      if (
        isFiniteMatrix(path.transform) &&
        transformedGeometryIsFinite &&
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
        if (gap > dieline.tolerances.coordinateEpsilonMm) {
          hasContinuityIssue = true;
          issues.push({
            code: gap <= dieline.tolerances.topologySnapMm ? "unsnapped-path-gap" : "path-gap",
            message:
              gap <= dieline.tolerances.topologySnapMm
                ? `segment gap ${gap.toFixed(9)} mm requires an explicit topology repair`
                : `segment gap ${gap.toFixed(9)} mm exceeds topologySnapMm`,
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
      if (gap > dieline.tolerances.coordinateEpsilonMm) {
        hasContinuityIssue = true;
        issues.push({
          code:
            gap <= dieline.tolerances.topologySnapMm
              ? "unsnapped-closed-path-gap"
              : "open-closed-path",
          message:
            gap <= dieline.tolerances.topologySnapMm
              ? `closed path endpoint gap ${gap.toFixed(9)} mm requires an explicit topology repair`
              : `closed path endpoint gap ${gap.toFixed(9)} mm exceeds topologySnapMm`,
          entityId: entity.id,
          pathId: path.id,
          segmentIndex: path.segments.length - 1,
        });
      }
    }

    if (path.closed && !hasContinuityIssue && !hasInvalidTransformedGeometry) {
      try {
        const flattened = flattenVectorPath(
          path,
          Math.min(dieline.tolerances.curveFlatteningMm, dieline.tolerances.topologySnapMm / 4),
          dieline.tolerances.maxSubdivisionDepth,
          dieline.tolerances.coordinateEpsilonMm,
        );
        if (uniquePointCount(flattened.points, dieline.tolerances.coordinateEpsilonMm) < 3) {
          issues.push({
            code: "degenerate-closed-path",
            message: "closed path must contain at least three distinct physical points",
            entityId: entity.id,
            pathId: path.id,
          });
        }
        const exactArea = vectorPathSignedAreaExact(path);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const point of flattened.points) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
        const diagonalMm = Math.hypot(maxX - minX, maxY - minY);
        let perimeterMm = 0;
        for (let index = 0; index < flattened.points.length; index += 1) {
          perimeterMm += pointDistance(
            flattened.points[index],
            flattened.points[(index + 1) % flattened.points.length],
          );
        }
        const areaEpsilonMm2 = Math.max(
          dieline.tolerances.coordinateEpsilonMm ** 2,
          dieline.tolerances.coordinateEpsilonMm * Math.max(1, perimeterMm),
          64 * Number.EPSILON * Math.max(1, diagonalMm ** 2) * path.segments.length,
        );
        if (!Number.isFinite(exactArea) || Math.abs(exactArea) <= areaEpsilonMm2) {
          issues.push({
            code: entity.operation === "window-cut" ? "zero-area-window-cut" : "zero-area-closed-path",
            message: "closed structural contour must enclose finite non-zero physical area",
            entityId: entity.id,
            pathId: path.id,
          });
        }
        if (
          flattened.points.length >= 3 &&
          polylineSelfIntersects(
            flattened.points,
            true,
            dieline.tolerances.coordinateEpsilonMm,
          )
        ) {
          issues.push({
            code: "self-intersecting-closed-path",
            message: "adaptively tessellated closed contour self-intersects; exact source review required",
            entityId: entity.id,
            pathId: path.id,
          });
        }
      } catch (error) {
        issues.push({
          code: "invalid-closed-path",
          message: error instanceof Error ? error.message : String(error),
          entityId: entity.id,
          pathId: path.id,
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
