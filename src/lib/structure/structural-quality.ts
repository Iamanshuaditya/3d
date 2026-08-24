import type { CanonicalDieline, Vec2 } from "./vector-domain";
import type { StructuralPanel } from "./topology";
import {
  distanceBetweenPoints,
  flattenVectorPath,
  pointToSegmentDistance,
  signedPolygonArea,
} from "./vector-math";

export type BoundarySegment = Readonly<{ start: Vec2; end: Vec2 }>;

export type FlatEquivalenceReport = Readonly<{
  sourceOuterSegmentCount: number;
  derivedOuterSegmentCount: number;
  sourceHoleCount: number;
  derivedHoleCount: number;
  maxSourceToDerivedMm: number;
  maxDerivedToSourceMm: number;
  bidirectionalHausdorffMm: number;
  rmsBoundaryDistanceMm: number;
  sourceAreaMm2: number;
  derivedAreaMm2: number;
  areaDifferenceMm2: number;
  sourcePerimeterMm: number;
  derivedPerimeterMm: number;
  perimeterDifferenceMm: number;
  passesBoundaryGate: boolean;
  passesHoleCountGate: boolean;
}>;

function quantize(value: number, tolerance: number): number {
  return Math.round(value / tolerance);
}

function pointKey(point: Vec2, tolerance: number): string {
  return `${quantize(point.x, tolerance)},${quantize(point.y, tolerance)}`;
}

function segmentKey(start: Vec2, end: Vec2, tolerance: number): string {
  const a = pointKey(start, tolerance);
  const b = pointKey(end, tolerance);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function loopSegments(loop: readonly Vec2[]): BoundarySegment[] {
  return loop.map((start, index) => ({ start, end: loop[(index + 1) % loop.length] }));
}

function sourceLoops(dieline: CanonicalDieline, operations: readonly string[]): readonly (readonly Vec2[])[] {
  return dieline.entities
    .filter((entity) => operations.includes(entity.operation) && entity.path.closed)
    .map((entity) => flattenVectorPath(entity.path, dieline.tolerances.curveFlatteningMm).points)
    .filter((points) => points.length >= 3);
}

export function derivePanelUnionBoundary(
  panels: readonly StructuralPanel[],
  toleranceMm: number,
): readonly BoundarySegment[] {
  if (!Number.isFinite(toleranceMm) || toleranceMm <= 0) throw new RangeError("Boundary derivation tolerance must be finite and positive.");
  const occurrences = new Map<string, BoundarySegment[]>();
  for (const panel of panels) {
    for (const segment of loopSegments(panel.outerBoundary)) {
      const key = segmentKey(segment.start, segment.end, toleranceMm);
      occurrences.set(key, [...(occurrences.get(key) ?? []), segment]);
    }
  }
  const boundary: BoundarySegment[] = [];
  for (const segments of occurrences.values()) {
    if (segments.length === 1) boundary.push(segments[0]);
    else if (segments.length !== 2) {
      throw new Error(`Non-manifold panel boundary has ${segments.length} coincident uses.`);
    }
  }
  return boundary;
}

function sampleSegments(segments: readonly BoundarySegment[], spacingMm: number): Vec2[] {
  const samples: Vec2[] = [];
  for (const segment of segments) {
    const length = distanceBetweenPoints(segment.start, segment.end);
    const count = Math.max(1, Math.ceil(length / spacingMm));
    for (let step = 0; step <= count; step += 1) {
      const t = step / count;
      samples.push({
        x: segment.start.x + (segment.end.x - segment.start.x) * t,
        y: segment.start.y + (segment.end.y - segment.start.y) * t,
      });
    }
  }
  return samples;
}

function nearestDistance(point: Vec2, segments: readonly BoundarySegment[]): number {
  let best = Infinity;
  for (const segment of segments) best = Math.min(best, pointToSegmentDistance(point, segment.start, segment.end));
  return best;
}

function directionalDistances(
  source: readonly BoundarySegment[],
  target: readonly BoundarySegment[],
  spacingMm: number,
): number[] {
  if (source.length === 0 || target.length === 0) return [Infinity];
  return sampleSegments(source, spacingMm).map((point) => nearestDistance(point, target));
}

function perimeter(segments: readonly BoundarySegment[]): number {
  return segments.reduce((sum, segment) => sum + distanceBetweenPoints(segment.start, segment.end), 0);
}

function totalLoopArea(outer: readonly (readonly Vec2[])[], holes: readonly (readonly Vec2[])[]): number {
  const outerArea = outer.reduce((sum, loop) => sum + Math.abs(signedPolygonArea(loop)), 0);
  const holeArea = holes.reduce((sum, loop) => sum + Math.abs(signedPolygonArea(loop)), 0);
  return outerArea - holeArea;
}

export function measureFlatPanelEquivalence(
  dieline: CanonicalDieline,
  panels: readonly StructuralPanel[],
): FlatEquivalenceReport {
  const outerLoops = sourceLoops(dieline, ["cut"]);
  const sourceHoles = sourceLoops(dieline, ["window-cut"]);
  if (outerLoops.length === 0) throw new Error("Flat equivalence requires at least one closed source cut loop.");
  const sourceOuterSegments = outerLoops.flatMap(loopSegments);
  const derivedOuterSegments = derivePanelUnionBoundary(panels, dieline.tolerances.topologySnapMm);
  const derivedHoles = panels.flatMap((panel) => panel.holes);
  const spacing = Math.min(
    dieline.tolerances.metricSampleSpacingMm,
    Math.max(dieline.tolerances.boundaryComparisonMm / 2, 0.001),
  );

  const sourceToDerived = directionalDistances(sourceOuterSegments, derivedOuterSegments, spacing);
  const derivedToSource = directionalDistances(derivedOuterSegments, sourceOuterSegments, spacing);
  const allDistances = [...sourceToDerived, ...derivedToSource];
  const maxSourceToDerivedMm = Math.max(...sourceToDerived);
  const maxDerivedToSourceMm = Math.max(...derivedToSource);
  const bidirectionalHausdorffMm = Math.max(maxSourceToDerivedMm, maxDerivedToSourceMm);
  const rmsBoundaryDistanceMm = Math.sqrt(
    allDistances.reduce((sum, value) => sum + value * value, 0) / allDistances.length,
  );

  const sourceAreaMm2 = totalLoopArea(outerLoops, sourceHoles);
  const derivedAreaMm2 = panels.reduce(
    (sum, panel) =>
      sum +
      Math.abs(signedPolygonArea(panel.outerBoundary)) -
      panel.holes.reduce((holeSum, hole) => holeSum + Math.abs(signedPolygonArea(hole)), 0),
    0,
  );
  const sourcePerimeterMm = perimeter(sourceOuterSegments);
  const derivedPerimeterMm = perimeter(derivedOuterSegments);

  return {
    sourceOuterSegmentCount: sourceOuterSegments.length,
    derivedOuterSegmentCount: derivedOuterSegments.length,
    sourceHoleCount: sourceHoles.length,
    derivedHoleCount: derivedHoles.length,
    maxSourceToDerivedMm,
    maxDerivedToSourceMm,
    bidirectionalHausdorffMm,
    rmsBoundaryDistanceMm,
    sourceAreaMm2,
    derivedAreaMm2,
    areaDifferenceMm2: Math.abs(sourceAreaMm2 - derivedAreaMm2),
    sourcePerimeterMm,
    derivedPerimeterMm,
    perimeterDifferenceMm: Math.abs(sourcePerimeterMm - derivedPerimeterMm),
    passesBoundaryGate: bidirectionalHausdorffMm <= dieline.tolerances.boundaryComparisonMm,
    passesHoleCountGate: sourceHoles.length === derivedHoles.length,
  };
}
