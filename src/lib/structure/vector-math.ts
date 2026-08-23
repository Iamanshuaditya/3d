import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  type AffineMatrix,
  type Bounds2D,
  type Vec2,
  type VectorPath,
  type VectorSegment,
} from "./vector-domain";

const TAU = Math.PI * 2;
const PARAMETER_EPSILON = 1e-12;

export type FlattenedVectorPath = Readonly<{
  id: string;
  points: readonly Vec2[];
  /** Closure is implicit; the first point is not repeated at the end. */
  closed: boolean;
}>;

export type PointInPolygonClassification = "inside" | "outside" | "boundary";

export class CurveSubdivisionLimitError extends Error {
  constructor(
    readonly segmentKind: VectorSegment["kind"],
    readonly toleranceMm: number,
    readonly maxDepth: number,
  ) {
    super(
      `Could not flatten ${segmentKind} within ${toleranceMm} mm after ${maxDepth} subdivisions`,
    );
    this.name = "CurveSubdivisionLimitError";
  }
}

export class DiscontinuousVectorPathError extends Error {
  constructor(
    readonly pathId: string,
    readonly gapMm: number,
    readonly segmentIndex: number,
  ) {
    super(
      `Vector path ${pathId} has a ${gapMm.toFixed(9)} mm gap before segment ${segmentIndex}`,
    );
    this.name = "DiscontinuousVectorPathError";
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive`);
  }
}

function assertUnitParameter(parameter: number): void {
  if (!Number.isFinite(parameter) || parameter < 0 || parameter > 1) {
    throw new RangeError("parameter must be a finite value from 0 through 1");
  }
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function addVec2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtractVec2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scaleVec2(point: Vec2, scalar: number): Vec2 {
  return { x: point.x * scalar, y: point.y * scalar };
}

export function lerpVec2(a: Vec2, b: Vec2, parameter: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * parameter,
    y: a.y + (b.y - a.y) * parameter,
  };
}

export function dotVec2(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function distanceBetweenPoints(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function affineTranslation(xMm: number, yMm: number): AffineMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: xMm, f: yMm };
}

export function affineScale(xScale: number, yScale = xScale): AffineMatrix {
  return { a: xScale, b: 0, c: 0, d: yScale, e: 0, f: 0 };
}

export function affineRotation(angleRad: number): AffineMatrix {
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  return { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 };
}

/** Returns `left ∘ right`: `right` is applied to a point first. */
export function multiplyAffine(left: AffineMatrix, right: AffineMatrix): AffineMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

/** Composes transforms in application order: first argument is applied first. */
export function composeAffine(...transforms: readonly AffineMatrix[]): AffineMatrix {
  return transforms.reduce(
    (composed, transform) => multiplyAffine(transform, composed),
    IDENTITY_AFFINE_MATRIX,
  );
}

export function affineDeterminant(matrix: AffineMatrix): number {
  return matrix.a * matrix.d - matrix.b * matrix.c;
}

/** 2-norm condition number of the linear 2x2 portion of an affine matrix. */
export function affineConditionNumber(matrix: AffineMatrix): number {
  const scale = Math.max(
    Math.abs(matrix.a),
    Math.abs(matrix.b),
    Math.abs(matrix.c),
    Math.abs(matrix.d),
  );
  if (!Number.isFinite(scale) || scale === 0) return Infinity;
  const a = matrix.a / scale;
  const b = matrix.b / scale;
  const c = matrix.c / scale;
  const d = matrix.d / scale;
  const aa = a * a + b * b;
  const bb = c * c + d * d;
  const ab = a * c + b * d;
  const trace = aa + bb;
  const discriminant = Math.sqrt(Math.max(0, (aa - bb) * (aa - bb) + 4 * ab * ab));
  const largestEigenvalue = (trace + discriminant) / 2;
  const determinantMagnitude = Math.abs(a * d - b * c);
  if (!Number.isFinite(largestEigenvalue) || largestEigenvalue <= 0) return Infinity;
  if (!Number.isFinite(determinantMagnitude) || determinantMagnitude === 0) return Infinity;
  // sigmaMax / sigmaMin == sigmaMax^2 / |det(A)|. This form avoids the
  // catastrophic cancellation in trace - discriminant for thin transforms.
  return largestEigenvalue / determinantMagnitude;
}

export function invertAffine(matrix: AffineMatrix): AffineMatrix {
  const conditionNumber = affineConditionNumber(matrix);
  const scale = Math.max(
    Math.abs(matrix.a),
    Math.abs(matrix.b),
    Math.abs(matrix.c),
    Math.abs(matrix.d),
  );
  if (!Number.isFinite(conditionNumber) || conditionNumber > 1e12 || scale === 0) {
    throw new RangeError("affine matrix is singular or numerically ill-conditioned");
  }
  const a = matrix.a / scale;
  const b = matrix.b / scale;
  const c = matrix.c / scale;
  const d = matrix.d / scale;
  const determinant = a * d - b * c;
  const denominator = scale * determinant;
  const inverse = {
    a: d / denominator,
    b: -b / denominator,
    c: -c / denominator,
    d: a / denominator,
    e: (c * matrix.f - d * matrix.e) / denominator,
    f: (b * matrix.e - a * matrix.f) / denominator,
  };
  if (Object.values(inverse).some((value) => !Number.isFinite(value))) {
    throw new RangeError("affine matrix inverse is not finite");
  }
  return inverse;
}

export function applyAffine(matrix: AffineMatrix, point: Vec2): Vec2 {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

export function applyAffineVector(matrix: AffineMatrix, vector: Vec2): Vec2 {
  return {
    x: matrix.a * vector.x + matrix.c * vector.y,
    y: matrix.b * vector.x + matrix.d * vector.y,
  };
}

function arcBasis(segment: Extract<VectorSegment, { kind: "arc" | "elliptical-arc" }>): {
  center: Vec2;
  cosineBasis: Vec2;
  sineBasis: Vec2;
} {
  if (segment.kind === "arc") {
    return {
      center: segment.center,
      cosineBasis: { x: segment.radius, y: 0 },
      sineBasis: { x: 0, y: segment.radius },
    };
  }
  const cosine = Math.cos(segment.rotationRad);
  const sine = Math.sin(segment.rotationRad);
  return {
    center: segment.center,
    cosineBasis: { x: segment.radiusX * cosine, y: segment.radiusX * sine },
    sineBasis: { x: -segment.radiusY * sine, y: segment.radiusY * cosine },
  };
}

function evaluateArcBasis(
  center: Vec2,
  cosineBasis: Vec2,
  sineBasis: Vec2,
  angleRad: number,
): Vec2 {
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  return {
    x: center.x + cosineBasis.x * cosine + sineBasis.x * sine,
    y: center.y + cosineBasis.y * cosine + sineBasis.y * sine,
  };
}

export function evaluateVectorSegment(segment: VectorSegment, parameter: number): Vec2 {
  assertUnitParameter(parameter);
  switch (segment.kind) {
    case "line":
      return lerpVec2(segment.start, segment.end, parameter);
    case "quadratic": {
      const inverse = 1 - parameter;
      return {
        x:
          inverse * inverse * segment.p0.x +
          2 * inverse * parameter * segment.p1.x +
          parameter * parameter * segment.p2.x,
        y:
          inverse * inverse * segment.p0.y +
          2 * inverse * parameter * segment.p1.y +
          parameter * parameter * segment.p2.y,
      };
    }
    case "cubic": {
      const inverse = 1 - parameter;
      return {
        x:
          inverse * inverse * inverse * segment.p0.x +
          3 * inverse * inverse * parameter * segment.p1.x +
          3 * inverse * parameter * parameter * segment.p2.x +
          parameter * parameter * parameter * segment.p3.x,
        y:
          inverse * inverse * inverse * segment.p0.y +
          3 * inverse * inverse * parameter * segment.p1.y +
          3 * inverse * parameter * parameter * segment.p2.y +
          parameter * parameter * parameter * segment.p3.y,
      };
    }
    case "arc":
    case "elliptical-arc": {
      const basis = arcBasis(segment);
      const angle = segment.startAngleRad + segment.sweepAngleRad * parameter;
      return evaluateArcBasis(basis.center, basis.cosineBasis, basis.sineBasis, angle);
    }
  }
}

export function segmentStart(segment: VectorSegment): Vec2 {
  return evaluateVectorSegment(segment, 0);
}

export function segmentEnd(segment: VectorSegment): Vec2 {
  return evaluateVectorSegment(segment, 1);
}

/** Global parameter is distributed uniformly across source segments. */
export function evaluateVectorPath(path: VectorPath, parameter: number): Vec2 {
  assertUnitParameter(parameter);
  if (path.segments.length === 0) throw new RangeError("cannot evaluate an empty vector path");
  const scaled = parameter * path.segments.length;
  const segmentIndex = Math.min(Math.floor(scaled), path.segments.length - 1);
  const localParameter = parameter === 1 ? 1 : scaled - segmentIndex;
  return applyAffine(
    path.transform,
    evaluateVectorSegment(path.segments[segmentIndex], localParameter),
  );
}

type MutableBounds = { minX: number; minY: number; maxX: number; maxY: number };

function emptyBounds(): MutableBounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function includePoint(bounds: MutableBounds, point: Vec2): void {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function includeParameter(
  bounds: MutableBounds,
  segment: VectorSegment,
  parameter: number,
  transform: AffineMatrix,
): void {
  if (parameter > 0 && parameter < 1) {
    includePoint(bounds, applyAffine(transform, evaluateVectorSegment(segment, parameter)));
  }
}

function quadraticExtremum(p0: number, p1: number, p2: number): number | undefined {
  const denominator = p0 - 2 * p1 + p2;
  if (Math.abs(denominator) <= Number.EPSILON) return undefined;
  return (p0 - p1) / denominator;
}

function quadraticRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) <= Number.EPSILON) {
    if (Math.abs(b) <= Number.EPSILON) return [];
    return [-c / b];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  if (discriminant === 0) return [-b / (2 * a)];
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const cubic = -p0 + 3 * p1 - 3 * p2 + p3;
  const quadratic = 3 * p0 - 6 * p1 + 3 * p2;
  const linear = -3 * p0 + 3 * p1;
  return quadraticRoots(3 * cubic, 2 * quadratic, linear);
}

function normalizePositiveAngle(angle: number): number {
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function angleOnSweep(angle: number, start: number, sweep: number): boolean {
  if (Math.abs(sweep) >= TAU - PARAMETER_EPSILON) return true;
  const distance =
    sweep >= 0
      ? normalizePositiveAngle(angle - start)
      : normalizePositiveAngle(start - angle);
  return distance <= Math.abs(sweep) + PARAMETER_EPSILON;
}

function transformedArcBasis(
  segment: Extract<VectorSegment, { kind: "arc" | "elliptical-arc" }>,
  transform: AffineMatrix,
) {
  const basis = arcBasis(segment);
  return {
    center: applyAffine(transform, basis.center),
    cosineBasis: applyAffineVector(transform, basis.cosineBasis),
    sineBasis: applyAffineVector(transform, basis.sineBasis),
  };
}

export function segmentBounds(
  segment: VectorSegment,
  transform: AffineMatrix = IDENTITY_AFFINE_MATRIX,
): Bounds2D {
  const bounds = emptyBounds();
  includePoint(bounds, applyAffine(transform, segmentStart(segment)));
  includePoint(bounds, applyAffine(transform, segmentEnd(segment)));

  if (segment.kind === "quadratic" || segment.kind === "cubic") {
    const points =
      segment.kind === "quadratic"
        ? [segment.p0, segment.p1, segment.p2].map((point) => applyAffine(transform, point))
        : [segment.p0, segment.p1, segment.p2, segment.p3].map((point) =>
            applyAffine(transform, point),
          );
    if (segment.kind === "quadratic") {
      const x = quadraticExtremum(points[0].x, points[1].x, points[2].x);
      const y = quadraticExtremum(points[0].y, points[1].y, points[2].y);
      if (x !== undefined) includeParameter(bounds, segment, x, transform);
      if (y !== undefined) includeParameter(bounds, segment, y, transform);
    } else {
      for (const parameter of cubicExtrema(points[0].x, points[1].x, points[2].x, points[3].x)) {
        includeParameter(bounds, segment, parameter, transform);
      }
      for (const parameter of cubicExtrema(points[0].y, points[1].y, points[2].y, points[3].y)) {
        includeParameter(bounds, segment, parameter, transform);
      }
    }
  } else if (segment.kind === "arc" || segment.kind === "elliptical-arc") {
    const basis = transformedArcBasis(segment, transform);
    const candidateAngles = [
      Math.atan2(basis.sineBasis.x, basis.cosineBasis.x),
      Math.atan2(basis.sineBasis.x, basis.cosineBasis.x) + Math.PI,
      Math.atan2(basis.sineBasis.y, basis.cosineBasis.y),
      Math.atan2(basis.sineBasis.y, basis.cosineBasis.y) + Math.PI,
    ];
    for (const angle of candidateAngles) {
      if (angleOnSweep(angle, segment.startAngleRad, segment.sweepAngleRad)) {
        includePoint(
          bounds,
          evaluateArcBasis(basis.center, basis.cosineBasis, basis.sineBasis, angle),
        );
      }
    }
  }
  return bounds;
}

export function vectorPathBounds(path: VectorPath): Bounds2D {
  if (path.segments.length === 0) throw new RangeError("cannot bound an empty vector path");
  const bounds = emptyBounds();
  for (const segment of path.segments) {
    const child = segmentBounds(segment, path.transform);
    includePoint(bounds, { x: child.minX, y: child.minY });
    includePoint(bounds, { x: child.maxX, y: child.maxY });
  }
  return bounds;
}

function pointToSegmentDistanceSquared(point: Vec2, start: Vec2, end: Vec2): number {
  const delta = subtractVec2(end, start);
  const lengthSquared = dotVec2(delta, delta);
  if (lengthSquared <= Number.EPSILON) {
    const x = point.x - start.x;
    const y = point.y - start.y;
    return x * x + y * y;
  }
  const projection = Math.max(
    0,
    Math.min(1, dotVec2(subtractVec2(point, start), delta) / lengthSquared),
  );
  const closest = addVec2(start, scaleVec2(delta, projection));
  const x = point.x - closest.x;
  const y = point.y - closest.y;
  return x * x + y * y;
}

export function pointToSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  return Math.sqrt(pointToSegmentDistanceSquared(point, start, end));
}

function bezierFlatness(controlPoints: readonly Vec2[]): number {
  const start = controlPoints[0];
  const end = controlPoints[controlPoints.length - 1];
  let maximum = 0;
  for (const point of controlPoints.slice(1, -1)) {
    maximum = Math.max(maximum, pointToSegmentDistance(point, start, end));
  }
  return maximum;
}

function splitQuadratic(points: readonly [Vec2, Vec2, Vec2]) {
  const p01 = lerpVec2(points[0], points[1], 0.5);
  const p12 = lerpVec2(points[1], points[2], 0.5);
  const midpoint = lerpVec2(p01, p12, 0.5);
  return [
    [points[0], p01, midpoint],
    [midpoint, p12, points[2]],
  ] as const;
}

function splitCubic(points: readonly [Vec2, Vec2, Vec2, Vec2]) {
  const p01 = lerpVec2(points[0], points[1], 0.5);
  const p12 = lerpVec2(points[1], points[2], 0.5);
  const p23 = lerpVec2(points[2], points[3], 0.5);
  const p012 = lerpVec2(p01, p12, 0.5);
  const p123 = lerpVec2(p12, p23, 0.5);
  const midpoint = lerpVec2(p012, p123, 0.5);
  return [
    [points[0], p01, p012, midpoint],
    [midpoint, p123, p23, points[3]],
  ] as const;
}

function flattenBezierRecursive(
  kind: "quadratic" | "cubic",
  controlPoints: readonly Vec2[],
  toleranceMm: number,
  maxDepth: number,
  depth: number,
  output: Vec2[],
): void {
  if (bezierFlatness(controlPoints) <= toleranceMm) {
    output.push(controlPoints[controlPoints.length - 1]);
    return;
  }
  if (depth >= maxDepth) {
    throw new CurveSubdivisionLimitError(kind, toleranceMm, maxDepth);
  }
  const children =
    kind === "quadratic"
      ? splitQuadratic(controlPoints as readonly [Vec2, Vec2, Vec2])
      : splitCubic(controlPoints as readonly [Vec2, Vec2, Vec2, Vec2]);
  flattenBezierRecursive(kind, children[0], toleranceMm, maxDepth, depth + 1, output);
  flattenBezierRecursive(kind, children[1], toleranceMm, maxDepth, depth + 1, output);
}

/** Largest possible magnitude of U*cos(theta) + V*sin(theta). */
function arcBasisSpectralNorm(cosineBasis: Vec2, sineBasis: Vec2): number {
  const uu = dotVec2(cosineBasis, cosineBasis);
  const vv = dotVec2(sineBasis, sineBasis);
  const uv = dotVec2(cosineBasis, sineBasis);
  const largestEigenvalue =
    (uu + vv + Math.sqrt((uu - vv) * (uu - vv) + 4 * uv * uv)) / 2;
  return Math.sqrt(Math.max(0, largestEigenvalue));
}

function flattenArcRecursive(
  kind: "arc" | "elliptical-arc",
  center: Vec2,
  cosineBasis: Vec2,
  sineBasis: Vec2,
  startAngle: number,
  sweepAngle: number,
  toleranceMm: number,
  maxDepth: number,
  depth: number,
  output: Vec2[],
): void {
  // Linear-interpolation error is bounded by max|C''| * delta^2 / 8.
  const deviationBound =
    (arcBasisSpectralNorm(cosineBasis, sineBasis) * sweepAngle * sweepAngle) / 8;
  if (deviationBound <= toleranceMm) {
    output.push(
      evaluateArcBasis(center, cosineBasis, sineBasis, startAngle + sweepAngle),
    );
    return;
  }
  if (depth >= maxDepth) {
    throw new CurveSubdivisionLimitError(kind, toleranceMm, maxDepth);
  }
  const halfSweep = sweepAngle / 2;
  flattenArcRecursive(
    kind,
    center,
    cosineBasis,
    sineBasis,
    startAngle,
    halfSweep,
    toleranceMm,
    maxDepth,
    depth + 1,
    output,
  );
  flattenArcRecursive(
    kind,
    center,
    cosineBasis,
    sineBasis,
    startAngle + halfSweep,
    halfSweep,
    toleranceMm,
    maxDepth,
    depth + 1,
    output,
  );
}

export function flattenVectorSegment(
  segment: VectorSegment,
  toleranceMm = DEFAULT_STRUCTURAL_TOLERANCES.curveFlatteningMm,
  transform: AffineMatrix = IDENTITY_AFFINE_MATRIX,
  maxDepth = DEFAULT_STRUCTURAL_TOLERANCES.maxSubdivisionDepth,
): readonly Vec2[] {
  assertPositiveFinite(toleranceMm, "curve flattening tolerance");
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError("maxDepth must be a positive integer");
  }
  const start = applyAffine(transform, segmentStart(segment));
  if (segment.kind === "line") {
    return [start, applyAffine(transform, segment.end)];
  }

  const output: Vec2[] = [start];
  if (segment.kind === "quadratic") {
    flattenBezierRecursive(
      "quadratic",
      [segment.p0, segment.p1, segment.p2].map((point) => applyAffine(transform, point)),
      toleranceMm,
      maxDepth,
      0,
      output,
    );
  } else if (segment.kind === "cubic") {
    flattenBezierRecursive(
      "cubic",
      [segment.p0, segment.p1, segment.p2, segment.p3].map((point) =>
        applyAffine(transform, point),
      ),
      toleranceMm,
      maxDepth,
      0,
      output,
    );
  } else {
    const basis = transformedArcBasis(segment, transform);
    flattenArcRecursive(
      segment.kind,
      basis.center,
      basis.cosineBasis,
      basis.sineBasis,
      segment.startAngleRad,
      segment.sweepAngleRad,
      toleranceMm,
      maxDepth,
      0,
      output,
    );
  }
  return output;
}

export function flattenVectorPath(
  path: VectorPath,
  toleranceMm = DEFAULT_STRUCTURAL_TOLERANCES.curveFlatteningMm,
  maxDepth = DEFAULT_STRUCTURAL_TOLERANCES.maxSubdivisionDepth,
  continuityEpsilonMm = DEFAULT_STRUCTURAL_TOLERANCES.coordinateEpsilonMm,
): FlattenedVectorPath {
  if (!Number.isFinite(continuityEpsilonMm) || continuityEpsilonMm < 0) {
    throw new RangeError("continuityEpsilonMm must be finite and non-negative");
  }
  if (path.segments.length === 0) return { id: path.id, points: [], closed: path.closed };
  const points: Vec2[] = [];
  let previousAnalyticEnd: Vec2 | null = null;
  for (let segmentIndex = 0; segmentIndex < path.segments.length; segmentIndex += 1) {
    const segment = path.segments[segmentIndex];
    const analyticStart = applyAffine(path.transform, segmentStart(segment));
    const analyticEnd = applyAffine(path.transform, segmentEnd(segment));
    const flattened = [...flattenVectorSegment(segment, toleranceMm, path.transform, maxDepth)];
    // Curve subdivision and analytic endpoint evaluation can take different
    // floating-point paths. Pin tessellation endpoints to the canonical
    // analytic contract before checking continuity or joining polylines.
    flattened[0] = analyticStart;
    flattened[flattened.length - 1] = analyticEnd;
    if (
      previousAnalyticEnd &&
      distanceBetweenPoints(previousAnalyticEnd, analyticStart) > continuityEpsilonMm
    ) {
      throw new DiscontinuousVectorPathError(
        path.id,
        distanceBetweenPoints(previousAnalyticEnd, analyticStart),
        segmentIndex,
      );
    }
    for (let index = 0; index < flattened.length; index += 1) {
      const point = flattened[index];
      const priorPoint = points[points.length - 1];
      if (
        index === 0 &&
        priorPoint &&
        distanceBetweenPoints(priorPoint, point) <= continuityEpsilonMm
      ) {
        continue;
      }
      points.push(point);
    }
    previousAnalyticEnd = analyticEnd;
  }
  if (path.closed && points.length > 1) {
    const analyticStart = applyAffine(path.transform, segmentStart(path.segments[0]));
    const analyticEnd = applyAffine(
      path.transform,
      segmentEnd(path.segments[path.segments.length - 1]),
    );
    const closureGap = distanceBetweenPoints(analyticStart, analyticEnd);
    if (closureGap > continuityEpsilonMm) {
      throw new DiscontinuousVectorPathError(path.id, closureGap, path.segments.length);
    }
    points.pop();
  }
  return { id: path.id, points, closed: path.closed };
}

export function polylineLength(points: readonly Vec2[], closed = false): number {
  if (points.length < 2) return 0;
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distanceBetweenPoints(points[index - 1], points[index]);
  }
  if (closed) length += distanceBetweenPoints(points[points.length - 1], points[0]);
  return length;
}

export function vectorPathLength(
  path: VectorPath,
  toleranceMm = DEFAULT_STRUCTURAL_TOLERANCES.curveFlatteningMm,
): number {
  const flattened = flattenVectorPath(path, toleranceMm);
  return polylineLength(flattened.points, flattened.closed);
}

export function evaluateVectorPathByLength(
  path: VectorPath,
  distanceMm: number,
  toleranceMm = DEFAULT_STRUCTURAL_TOLERANCES.curveFlatteningMm,
): Vec2 {
  if (!Number.isFinite(distanceMm) || distanceMm < 0) {
    throw new RangeError("distanceMm must be finite and non-negative");
  }
  const flattened = flattenVectorPath(path, toleranceMm);
  const points = flattened.points;
  if (points.length === 0) throw new RangeError("cannot evaluate an empty vector path");
  if (points.length === 1) return points[0];
  const totalLength = polylineLength(points, flattened.closed);
  if (distanceMm > totalLength + PARAMETER_EPSILON) {
    throw new RangeError("distanceMm exceeds vector path length");
  }
  let remaining = Math.min(distanceMm, totalLength);
  const segmentCount = points.length - 1 + (flattened.closed ? 1 : 0);
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = distanceBetweenPoints(start, end);
    if (remaining <= length || index === segmentCount - 1) {
      return length <= Number.EPSILON ? end : lerpVec2(start, end, remaining / length);
    }
    remaining -= length;
  }
  return points[points.length - 1];
}

export function signedPolygonArea(points: readonly Vec2[]): number {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += point.x * next.y - next.x * point.y;
  }
  return twiceArea / 2;
}

export function vectorPathSignedArea(
  path: VectorPath,
  toleranceMm = DEFAULT_STRUCTURAL_TOLERANCES.curveFlatteningMm,
): number {
  if (!path.closed) throw new RangeError("signed area is only defined for a closed path");
  return signedPolygonArea(flattenVectorPath(path, toleranceMm).points);
}

function crossVec2(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function subtractAnchor(point: Vec2, anchor: Vec2): Vec2 {
  return { x: point.x - anchor.x, y: point.y - anchor.y };
}

function polynomialSegmentArea(
  coefficients: readonly Vec2[],
): number {
  let integral = 0;
  let compensation = 0;
  for (let firstPower = 0; firstPower < coefficients.length; firstPower += 1) {
    for (let derivativePower = 1; derivativePower < coefficients.length; derivativePower += 1) {
      const term =
        (derivativePower * crossVec2(coefficients[firstPower], coefficients[derivativePower])) /
        (firstPower + derivativePower);
      const corrected = term - compensation;
      const next = integral + corrected;
      compensation = next - integral - corrected;
      integral = next;
    }
  }
  return integral / 2;
}

/**
 * Exact Green-integral signed area for lines, Béziers, and affine-transformed
 * circular/elliptical arcs.
 *
 * The integral is evaluated in the path's local coordinate system after
 * subtracting a local anchor, then multiplied by the determinant of the
 * affine transform's linear part. This is not merely an optimization:
 * applying a very large affine translation before subtracting the anchor can
 * quantize small structural coordinates and make a zero-area contour appear
 * to have area. Closed-curve area is translation invariant and scales by
 * det(A), so the local-first formulation is the numerically faithful one.
 */
export function vectorPathSignedAreaExact(path: VectorPath): number {
  if (!path.closed) throw new RangeError("signed area is only defined for a closed path");
  if (path.segments.length === 0) throw new RangeError("cannot measure an empty vector path");
  const anchor = segmentStart(path.segments[0]);
  const contributions: number[] = [];
  for (const segment of path.segments) {
    if (segment.kind === "line") {
      const start = subtractAnchor(segment.start, anchor);
      const end = subtractAnchor(segment.end, anchor);
      contributions.push(crossVec2(start, end) / 2);
      continue;
    }
    if (segment.kind === "quadratic" || segment.kind === "cubic") {
      const points = (segment.kind === "quadratic"
        ? [segment.p0, segment.p1, segment.p2]
        : [segment.p0, segment.p1, segment.p2, segment.p3]
      ).map((point) => subtractAnchor(point, anchor));
      const coefficients = segment.kind === "quadratic"
        ? [
            points[0],
            scaleVec2(subtractVec2(points[1], points[0]), 2),
            addVec2(subtractVec2(points[0], scaleVec2(points[1], 2)), points[2]),
          ]
        : [
            points[0],
            scaleVec2(subtractVec2(points[1], points[0]), 3),
            scaleVec2(addVec2(subtractVec2(points[0], scaleVec2(points[1], 2)), points[2]), 3),
            addVec2(
              addVec2(scaleVec2(points[1], 3), scaleVec2(points[2], -3)),
              addVec2(scaleVec2(points[0], -1), points[3]),
            ),
          ];
      contributions.push(polynomialSegmentArea(coefficients));
      continue;
    }
    const basis = arcBasis(segment);
    const center = subtractAnchor(basis.center, anchor);
    const cosineBasis = basis.cosineBasis;
    const sineBasis = basis.sineBasis;
    const start = subtractAnchor(segmentStart(segment), anchor);
    const end = subtractAnchor(segmentEnd(segment), anchor);
    contributions.push(
      (crossVec2(center, subtractVec2(end, start)) +
        crossVec2(cosineBasis, sineBasis) * segment.sweepAngleRad) /
        2,
    );
  }
  let area = 0;
  let compensation = 0;
  for (const contribution of contributions) {
    const corrected = contribution - compensation;
    const next = area + corrected;
    compensation = next - area - corrected;
    area = next;
  }
  return area * affineDeterminant(path.transform);
}

/** In canonical y-down sheet coordinates, positive area is visually clockwise. */
export function polygonWinding(
  points: readonly Vec2[],
  epsilonMm2 = DEFAULT_STRUCTURAL_TOLERANCES.coordinateEpsilonMm,
): "clockwise" | "counter-clockwise" | "degenerate" {
  const area = signedPolygonArea(points);
  if (Math.abs(area) <= epsilonMm2) return "degenerate";
  return area > 0 ? "clockwise" : "counter-clockwise";
}

export function pointToPolylineDistance(
  point: Vec2,
  points: readonly Vec2[],
  closed = false,
): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return distanceBetweenPoints(point, points[0]);
  let minimumSquared = Infinity;
  const segmentCount = points.length - 1 + (closed ? 1 : 0);
  for (let index = 0; index < segmentCount; index += 1) {
    minimumSquared = Math.min(
      minimumSquared,
      pointToSegmentDistanceSquared(point, points[index], points[(index + 1) % points.length]),
    );
  }
  return Math.sqrt(minimumSquared);
}

export function classifyPointInPolygon(
  point: Vec2,
  polygon: readonly Vec2[],
  boundaryToleranceMm = DEFAULT_STRUCTURAL_TOLERANCES.coordinateEpsilonMm,
): PointInPolygonClassification {
  if (!Number.isFinite(boundaryToleranceMm) || boundaryToleranceMm < 0) {
    throw new RangeError("boundary tolerance must be finite and non-negative");
  }
  if (polygon.length < 3) return "outside";
  if (pointToPolylineDistance(point, polygon, true) <= boundaryToleranceMm) return "boundary";

  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index++) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) +
          current.x;
    if (crosses) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

export function pointInPolygon(
  point: Vec2,
  polygon: readonly Vec2[],
  boundaryToleranceMm = DEFAULT_STRUCTURAL_TOLERANCES.coordinateEpsilonMm,
): boolean {
  return classifyPointInPolygon(point, polygon, boundaryToleranceMm) !== "outside";
}

export function pointInVectorPath(
  point: Vec2,
  path: VectorPath,
  curveFlatteningToleranceMm = DEFAULT_STRUCTURAL_TOLERANCES.curveFlatteningMm,
  boundaryToleranceMm = DEFAULT_STRUCTURAL_TOLERANCES.coordinateEpsilonMm,
): boolean {
  if (!path.closed) throw new RangeError("point-in-path is only defined for a closed path");
  const flattened = flattenVectorPath(path, curveFlatteningToleranceMm);
  return pointInPolygon(point, flattened.points, boundaryToleranceMm);
}

export function resamplePolyline(
  points: readonly Vec2[],
  closed: boolean,
  maximumSpacingMm = DEFAULT_STRUCTURAL_TOLERANCES.metricSampleSpacingMm,
): readonly Vec2[] {
  assertPositiveFinite(maximumSpacingMm, "maximum sample spacing");
  if (points.length < 2) return [...points];
  const result: Vec2[] = [points[0]];
  const segmentCount = points.length - 1 + (closed ? 1 : 0);
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = distanceBetweenPoints(start, end);
    const subdivisions = Math.max(1, Math.ceil(length / maximumSpacingMm));
    for (let step = 1; step <= subdivisions; step += 1) {
      if (closed && index === segmentCount - 1 && step === subdivisions) continue;
      result.push(lerpVec2(start, end, step / subdivisions));
    }
  }
  return result;
}
