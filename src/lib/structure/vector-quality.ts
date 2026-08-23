import { DEFAULT_STRUCTURAL_TOLERANCES, type Vec2, type VectorPath } from "./vector-domain";
import {
  flattenVectorPath,
  pointToPolylineDistance,
  polylineLength,
  resamplePolyline,
  signedPolygonArea,
  type FlattenedVectorPath,
} from "./vector-math";

export type DirectedPathDistance = Readonly<{
  maximumMm: number;
  rmsMm: number;
  sampleCount: number;
}>;

export type PathQualityMetrics = Readonly<{
  sourceToDerived: DirectedPathDistance;
  derivedToSource: DirectedPathDistance;
  /** Maximum of the two directed maximum distances. */
  hausdorffDistanceMm: number;
  /** RMS over samples from both directions. */
  bidirectionalRmsDistanceMm: number;
  sourcePerimeterMm: number;
  derivedPerimeterMm: number;
  perimeterDifferenceMm: number;
  sourceAreaMm2: number | null;
  derivedAreaMm2: number | null;
  areaDifferenceMm2: number | null;
  /** Retains winding information, unlike absolute area difference. */
  signedAreaDifferenceMm2: number | null;
}>;

export type PathQualityOptions = Readonly<{
  curveFlatteningToleranceMm?: number;
  sampleSpacingMm?: number;
  maxSubdivisionDepth?: number;
}>;

function assertComparable(path: FlattenedVectorPath, label: string): void {
  if (path.points.length === 0) throw new RangeError(`${label} path must not be empty`);
  for (const point of path.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError(`${label} path contains a non-finite point`);
    }
  }
}

function directedDistance(
  samples: readonly Vec2[],
  target: FlattenedVectorPath,
): DirectedPathDistance & { sumSquaredDistance: number } {
  let maximumMm = 0;
  let sumSquaredDistance = 0;
  for (const sample of samples) {
    const distance = pointToPolylineDistance(sample, target.points, target.closed);
    maximumMm = Math.max(maximumMm, distance);
    sumSquaredDistance += distance * distance;
  }
  return {
    maximumMm,
    rmsMm: Math.sqrt(sumSquaredDistance / samples.length),
    sampleCount: samples.length,
    sumSquaredDistance,
  };
}

/**
 * Compares already-flattened paths. Sampling is expressed as physical spacing
 * in millimetres, never as an arbitrary number of samples per curve.
 */
export function compareFlattenedPaths(
  source: FlattenedVectorPath,
  derived: FlattenedVectorPath,
  sampleSpacingMm = DEFAULT_STRUCTURAL_TOLERANCES.metricSampleSpacingMm,
): PathQualityMetrics {
  if (!Number.isFinite(sampleSpacingMm) || sampleSpacingMm <= 0) {
    throw new RangeError("sampleSpacingMm must be finite and positive");
  }
  assertComparable(source, "source");
  assertComparable(derived, "derived");
  const sourceSamples = resamplePolyline(source.points, source.closed, sampleSpacingMm);
  const derivedSamples = resamplePolyline(derived.points, derived.closed, sampleSpacingMm);
  const sourceToDerived = directedDistance(sourceSamples, derived);
  const derivedToSource = directedDistance(derivedSamples, source);
  const combinedCount = sourceToDerived.sampleCount + derivedToSource.sampleCount;

  const sourcePerimeterMm = polylineLength(source.points, source.closed);
  const derivedPerimeterMm = polylineLength(derived.points, derived.closed);
  const sourceAreaMm2 = source.closed ? signedPolygonArea(source.points) : null;
  const derivedAreaMm2 = derived.closed ? signedPolygonArea(derived.points) : null;

  return {
    sourceToDerived: {
      maximumMm: sourceToDerived.maximumMm,
      rmsMm: sourceToDerived.rmsMm,
      sampleCount: sourceToDerived.sampleCount,
    },
    derivedToSource: {
      maximumMm: derivedToSource.maximumMm,
      rmsMm: derivedToSource.rmsMm,
      sampleCount: derivedToSource.sampleCount,
    },
    hausdorffDistanceMm: Math.max(sourceToDerived.maximumMm, derivedToSource.maximumMm),
    bidirectionalRmsDistanceMm: Math.sqrt(
      (sourceToDerived.sumSquaredDistance + derivedToSource.sumSquaredDistance) / combinedCount,
    ),
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
  };
}

export function compareVectorPaths(
  source: VectorPath,
  derived: VectorPath,
  options: PathQualityOptions = {},
): PathQualityMetrics {
  const curveFlatteningToleranceMm =
    options.curveFlatteningToleranceMm ?? DEFAULT_STRUCTURAL_TOLERANCES.topologySnapMm;
  const sampleSpacingMm =
    options.sampleSpacingMm ?? DEFAULT_STRUCTURAL_TOLERANCES.metricSampleSpacingMm;
  const maxSubdivisionDepth =
    options.maxSubdivisionDepth ?? DEFAULT_STRUCTURAL_TOLERANCES.maxSubdivisionDepth;
  return compareFlattenedPaths(
    flattenVectorPath(source, curveFlatteningToleranceMm, maxSubdivisionDepth),
    flattenVectorPath(derived, curveFlatteningToleranceMm, maxSubdivisionDepth),
    sampleSpacingMm,
  );
}

export function bidirectionalHausdorffDistance(
  source: FlattenedVectorPath,
  derived: FlattenedVectorPath,
  sampleSpacingMm = DEFAULT_STRUCTURAL_TOLERANCES.metricSampleSpacingMm,
): number {
  return compareFlattenedPaths(source, derived, sampleSpacingMm).hausdorffDistanceMm;
}

export function bidirectionalRmsDistance(
  source: FlattenedVectorPath,
  derived: FlattenedVectorPath,
  sampleSpacingMm = DEFAULT_STRUCTURAL_TOLERANCES.metricSampleSpacingMm,
): number {
  return compareFlattenedPaths(source, derived, sampleSpacingMm).bidirectionalRmsDistanceMm;
}
