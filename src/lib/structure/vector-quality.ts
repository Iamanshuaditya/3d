import { DEFAULT_STRUCTURAL_TOLERANCES, type Vec2, type VectorPath } from "./vector-domain";
import {
  distanceBetweenPoints,
  flattenVectorPath,
  pointToPolylineDistance,
  polylineLength,
  resamplePolyline,
  signedPolygonArea,
  type FlattenedVectorPath,
} from "./vector-math";

export class PathTopologyMismatchError extends Error {
  constructor(readonly sourceClosed: boolean, readonly derivedClosed: boolean) {
    super(
      `Cannot compare ${sourceClosed ? "closed" : "open"} source path with ${derivedClosed ? "closed" : "open"} derived path`,
    );
    this.name = "PathTopologyMismatchError";
  }
}

export type DirectedPathDistance = Readonly<{
  /** Largest distance actually witnessed at a sample; a rigorous lower bound. */
  lowerBoundMm: number;
  /** Rigorous continuous upper bound using the distance function's 1-Lipschitz property. */
  upperBoundMm: number;
  /** Difference between upper and lower bounds. */
  uncertaintyMm: number;
  /** Diagnostic RMS over samples only; it is not a continuous-curve certificate. */
  sampledRmsMm: number;
  sampleCount: number;
}>;

export type PathQualityMetrics = Readonly<{
  sourceToDerived: DirectedPathDistance;
  derivedToSource: DirectedPathDistance;
  /** Certified interval containing the true bidirectional Hausdorff distance. */
  sampledHausdorffLowerBoundMm: number;
  hausdorffUpperBoundMm: number;
  hausdorffUncertaintyMm: number;
  /** Diagnostic RMS over samples from both directions. */
  bidirectionalSampledRmsDistanceMm: number;
  /** Symmetric curve-to-flattened-polyline allowance included in the bounds. */
  representationErrorBoundMm: number;
  sourcePerimeterMm: number;
  derivedPerimeterMm: number;
  perimeterDifferenceMm: number;
  sourceAreaMm2: number | null;
  derivedAreaMm2: number | null;
  areaDifferenceMm2: number | null;
  /** Retains winding information, unlike absolute area difference. */
  signedAreaDifferenceMm2: number | null;
  /** Closed contours with opposite non-degenerate winding are not structurally equivalent. */
  windingMismatch: boolean | null;
}>;

export type PathQualityOptions = Readonly<{
  curveFlatteningToleranceMm?: number;
  sampleSpacingMm?: number;
  maxSubdivisionDepth?: number;
}>;

export type GeometricThresholdVerdict = "pass" | "fail" | "indeterminate";

type DirectedSampleResult = Readonly<{
  sampledMaximumMm: number;
  samplingUncertaintyMm: number;
  sampledRmsMm: number;
  sampleCount: number;
  sumSquaredDistance: number;
}>;

function assertComparable(path: FlattenedVectorPath, label: string): void {
  if (path.points.length === 0) throw new RangeError(`${label} path must not be empty`);
  if (path.closed && path.points.length < 3) {
    throw new RangeError(`${label} closed path must contain at least three points`);
  }
  if (!path.closed && path.points.length < 2) {
    throw new RangeError(`${label} open path must contain at least two points`);
  }
  for (const point of path.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError(`${label} path contains a non-finite point`);
    }
  }
}

function maximumSampleGap(samples: readonly Vec2[], closed: boolean): number {
  if (samples.length < 2) return 0;
  let maximum = 0;
  const segmentCount = samples.length - 1 + (closed ? 1 : 0);
  for (let index = 0; index < segmentCount; index += 1) {
    maximum = Math.max(
      maximum,
      distanceBetweenPoints(samples[index], samples[(index + 1) % samples.length]),
    );
  }
  return maximum;
}

function directedSamples(
  samples: readonly Vec2[],
  sourceClosed: boolean,
  target: FlattenedVectorPath,
): DirectedSampleResult {
  let sampledMaximumMm = 0;
  let sumSquaredDistance = 0;
  for (const sample of samples) {
    const distance = pointToPolylineDistance(sample, target.points, target.closed);
    sampledMaximumMm = Math.max(sampledMaximumMm, distance);
    sumSquaredDistance += distance * distance;
  }
  // Distance to any fixed set is 1-Lipschitz. Every point on a resampled
  // source span is at most half that span from one of its endpoint samples.
  const samplingUncertaintyMm = maximumSampleGap(samples, sourceClosed) / 2;
  return {
    sampledMaximumMm,
    samplingUncertaintyMm,
    sampledRmsMm: Math.sqrt(sumSquaredDistance / samples.length),
    sampleCount: samples.length,
    sumSquaredDistance,
  };
}

function certifiedDirection(
  samples: DirectedSampleResult,
  representationErrorBoundMm: number,
): DirectedPathDistance {
  const lowerBoundMm = Math.max(0, samples.sampledMaximumMm - representationErrorBoundMm);
  const upperBoundMm =
    samples.sampledMaximumMm + samples.samplingUncertaintyMm + representationErrorBoundMm;
  return {
    lowerBoundMm,
    upperBoundMm,
    uncertaintyMm: upperBoundMm - lowerBoundMm,
    sampledRmsMm: samples.sampledRmsMm,
    sampleCount: samples.sampleCount,
  };
}

function compareFlattenedPathsWithAllowance(
  source: FlattenedVectorPath,
  derived: FlattenedVectorPath,
  sampleSpacingMm: number,
  representationErrorBoundMm: number,
): PathQualityMetrics {
  if (!Number.isFinite(sampleSpacingMm) || sampleSpacingMm <= 0) {
    throw new RangeError("sampleSpacingMm must be finite and positive");
  }
  if (!Number.isFinite(representationErrorBoundMm) || representationErrorBoundMm < 0) {
    throw new RangeError("representationErrorBoundMm must be finite and non-negative");
  }
  assertComparable(source, "source");
  assertComparable(derived, "derived");
  if (source.closed !== derived.closed) {
    throw new PathTopologyMismatchError(source.closed, derived.closed);
  }

  const sourceSamples = resamplePolyline(source.points, source.closed, sampleSpacingMm);
  const derivedSamples = resamplePolyline(derived.points, derived.closed, sampleSpacingMm);
  const sourceSampleDistance = directedSamples(sourceSamples, source.closed, derived);
  const derivedSampleDistance = directedSamples(derivedSamples, derived.closed, source);
  const sourceToDerived = certifiedDirection(sourceSampleDistance, representationErrorBoundMm);
  const derivedToSource = certifiedDirection(derivedSampleDistance, representationErrorBoundMm);
  const combinedCount = sourceToDerived.sampleCount + derivedToSource.sampleCount;

  const sourcePerimeterMm = polylineLength(source.points, source.closed);
  const derivedPerimeterMm = polylineLength(derived.points, derived.closed);
  const sourceAreaMm2 = source.closed ? signedPolygonArea(source.points) : null;
  const derivedAreaMm2 = derived.closed ? signedPolygonArea(derived.points) : null;
  const sampledHausdorffLowerBoundMm = Math.max(
    sourceToDerived.lowerBoundMm,
    derivedToSource.lowerBoundMm,
  );
  const hausdorffUpperBoundMm = Math.max(
    sourceToDerived.upperBoundMm,
    derivedToSource.upperBoundMm,
  );

  return {
    sourceToDerived,
    derivedToSource,
    sampledHausdorffLowerBoundMm,
    hausdorffUpperBoundMm,
    hausdorffUncertaintyMm: hausdorffUpperBoundMm - sampledHausdorffLowerBoundMm,
    bidirectionalSampledRmsDistanceMm: Math.sqrt(
      (sourceSampleDistance.sumSquaredDistance + derivedSampleDistance.sumSquaredDistance) /
        combinedCount,
    ),
    representationErrorBoundMm,
    sourcePerimeterMm,
    derivedPerimeterMm,
    perimeterDifferenceMm: Math.abs(sourcePerimeterMm - derivedPerimeterMm),
    sourceAreaMm2,
    derivedAreaMm2,
    areaDifferenceMm2:
      sourceAreaMm2 === null || derivedAreaMm2 === null
        ? null
        : Math.abs(Math.abs(sourceAreaMm2) - Math.abs(derivedAreaMm2)),
    signedAreaDifferenceMm2:
      sourceAreaMm2 === null || derivedAreaMm2 === null
        ? null
        : Math.abs(sourceAreaMm2 - derivedAreaMm2),
    windingMismatch:
      sourceAreaMm2 === null || derivedAreaMm2 === null
        ? null
        : sourceAreaMm2 !== 0 && derivedAreaMm2 !== 0 && Math.sign(sourceAreaMm2) !== Math.sign(derivedAreaMm2),
  };
}

/**
 * Compares polygonal paths with a certified Hausdorff interval. Sampling is
 * expressed as physical spacing in millimetres; the upper bound includes half
 * the largest actual sample gap, so unsampled peaks cannot be reported as zero.
 */
export function compareFlattenedPaths(
  source: FlattenedVectorPath,
  derived: FlattenedVectorPath,
  sampleSpacingMm = DEFAULT_STRUCTURAL_TOLERANCES.metricSampleSpacingMm,
): PathQualityMetrics {
  return compareFlattenedPathsWithAllowance(source, derived, sampleSpacingMm, 0);
}

export function compareVectorPaths(
  source: VectorPath,
  derived: VectorPath,
  options: PathQualityOptions = {},
): PathQualityMetrics {
  if (source.closed !== derived.closed) {
    throw new PathTopologyMismatchError(source.closed, derived.closed);
  }
  const curveFlatteningToleranceMm =
    options.curveFlatteningToleranceMm ?? DEFAULT_STRUCTURAL_TOLERANCES.topologySnapMm;
  const sampleSpacingMm =
    options.sampleSpacingMm ?? DEFAULT_STRUCTURAL_TOLERANCES.metricSampleSpacingMm;
  const maxSubdivisionDepth =
    options.maxSubdivisionDepth ?? DEFAULT_STRUCTURAL_TOLERANCES.maxSubdivisionDepth;
  if (!Number.isFinite(curveFlatteningToleranceMm) || curveFlatteningToleranceMm <= 0) {
    throw new RangeError("curveFlatteningToleranceMm must be finite and positive");
  }
  const sourceHasCurves = source.segments.some((segment) => segment.kind !== "line");
  const derivedHasCurves = derived.segments.some((segment) => segment.kind !== "line");
  const representationErrorBoundMm =
    (sourceHasCurves ? curveFlatteningToleranceMm : 0) +
    (derivedHasCurves ? curveFlatteningToleranceMm : 0);
  return compareFlattenedPathsWithAllowance(
    flattenVectorPath(source, curveFlatteningToleranceMm, maxSubdivisionDepth),
    flattenVectorPath(derived, curveFlatteningToleranceMm, maxSubdivisionDepth),
    sampleSpacingMm,
    representationErrorBoundMm,
  );
}

/** Produces a Hausdorff interval whose width is at most the requested mm budget. */
export function compareVectorPathsCertified(
  source: VectorPath,
  derived: VectorPath,
  certificateToleranceMm: number,
  maxSubdivisionDepth = DEFAULT_STRUCTURAL_TOLERANCES.maxSubdivisionDepth,
): PathQualityMetrics {
  if (!Number.isFinite(certificateToleranceMm) || certificateToleranceMm <= 0) {
    throw new RangeError("certificateToleranceMm must be finite and positive");
  }
  return compareVectorPaths(source, derived, {
    curveFlatteningToleranceMm: certificateToleranceMm / 8,
    sampleSpacingMm: certificateToleranceMm,
    maxSubdivisionDepth,
  });
}

export function bidirectionalHausdorffUpperBound(
  source: FlattenedVectorPath,
  derived: FlattenedVectorPath,
  sampleSpacingMm = DEFAULT_STRUCTURAL_TOLERANCES.metricSampleSpacingMm,
): number {
  return compareFlattenedPaths(source, derived, sampleSpacingMm).hausdorffUpperBoundMm;
}

export function bidirectionalSampledRmsDistance(
  source: FlattenedVectorPath,
  derived: FlattenedVectorPath,
  sampleSpacingMm = DEFAULT_STRUCTURAL_TOLERANCES.metricSampleSpacingMm,
): number {
  return compareFlattenedPaths(source, derived, sampleSpacingMm)
    .bidirectionalSampledRmsDistanceMm;
}

/**
 * A conservative gate: PASS only when the certificate is wholly inside the
 * limit, FAIL only when the witnessed lower bound is outside it, otherwise
 * require a finer comparison instead of guessing.
 */
export function assessHausdorffThreshold(
  metrics: PathQualityMetrics,
  maximumMm: number,
): GeometricThresholdVerdict {
  if (!Number.isFinite(maximumMm) || maximumMm < 0) {
    throw new RangeError("maximumMm must be finite and non-negative");
  }
  if (metrics.windingMismatch) return "fail";
  if (metrics.hausdorffUpperBoundMm <= maximumMm) return "pass";
  if (metrics.sampledHausdorffLowerBoundMm > maximumMm) return "fail";
  return "indeterminate";
}
