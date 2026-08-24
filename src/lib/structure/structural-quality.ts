import type { CanonicalDieline, Vec2 } from "./vector-domain";
import { extractCutCycles, type StructuralPanel } from "./topology";
import {
  distanceBetweenPoints,
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
  maxHoleHausdorffMm: number;
  sourceAreaMm2: number;
  derivedAreaMm2: number;
  areaDifferenceMm2: number;
  sourceHoleAreaMm2: number;
  derivedHoleAreaMm2: number;
  holeAreaDifferenceMm2: number;
  sourcePerimeterMm: number;
  derivedPerimeterMm: number;
  perimeterDifferenceMm: number;
  sourceHolePerimeterMm: number;
  derivedHolePerimeterMm: number;
  holePerimeterDifferenceMm: number;
  passesBoundaryGate: boolean;
  passesHoleGeometryGate: boolean;
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

export function derivePanelUnionBoundary(
  panels: readonly StructuralPanel[],
  toleranceMm: number,
): readonly BoundarySegment[] {
  if (!Number.isFinite(toleranceMm) || toleranceMm <= 0) {
    throw new RangeError("Boundary derivation tolerance must be finite and positive.");
  }
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

// Boundary sample arrays scale with perimeter / spacing and reach >100k entries on
// real production dielines. Spreading them into Math.max/Math.min overflows the V8
// argument stack, so fold instead of spreading.
function maxOf(values: readonly number[]): number {
  let best = -Infinity;
  for (const value of values) if (value > best) best = value;
  return best;
}

function nearestDistance(point: Vec2, segments: readonly BoundarySegment[]): number {
  let best = Infinity;
  for (const segment of segments) {
    best = Math.min(best, pointToSegmentDistance(point, segment.start, segment.end));
  }
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

function bidirectionalHausdorff(
  first: readonly BoundarySegment[],
  second: readonly BoundarySegment[],
  spacingMm: number,
): number {
  return Math.max(
    maxOf(directionalDistances(first, second, spacingMm)),
    maxOf(directionalDistances(second, first, spacingMm)),
  );
}

function perimeter(segments: readonly BoundarySegment[]): number {
  return segments.reduce(
    (sum, segment) => sum + distanceBetweenPoints(segment.start, segment.end),
    0,
  );
}

function loopsArea(loops: readonly (readonly Vec2[])[]): number {
  return loops.reduce((sum, loop) => sum + Math.abs(signedPolygonArea(loop)), 0);
}

function matchHoleGeometry(
  sourceHoles: readonly (readonly Vec2[])[],
  derivedHoles: readonly (readonly Vec2[])[],
  spacingMm: number,
): number {
  if (sourceHoles.length !== derivedHoles.length) return Infinity;
  if (sourceHoles.length === 0) return 0;
  const available = new Set(derivedHoles.map((_, index) => index));
  let worst = 0;
  for (const source of sourceHoles) {
    const sourceSegments = loopSegments(source);
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (const index of available) {
      const distance = bidirectionalHausdorff(
        sourceSegments,
        loopSegments(derivedHoles[index]),
        spacingMm,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) return Infinity;
    available.delete(bestIndex);
    worst = Math.max(worst, bestDistance);
  }
  return worst;
}

export function measureFlatPanelEquivalence(
  dieline: CanonicalDieline,
  panels: readonly StructuralPanel[],
): FlatEquivalenceReport {
  const cycles = extractCutCycles(dieline);
  const outerCycles = cycles.filter((cycle) => cycle.role === "outer");
  if (outerCycles.length !== 1) {
    throw new Error(`Flat equivalence requires exactly one source outer cut cycle; found ${outerCycles.length}.`);
  }
  const sourceOuter = outerCycles[0].points;
  const sourceHoles = cycles.filter((cycle) => cycle.role === "hole").map((cycle) => cycle.points);
  const sourceOuterSegments = loopSegments(sourceOuter);
  const derivedOuterSegments = derivePanelUnionBoundary(
    panels,
    dieline.tolerances.topologySnapMm,
  );
  const derivedHoles = panels.flatMap((panel) => panel.holes);
  const spacing = Math.min(
    dieline.tolerances.metricSampleSpacingMm,
    Math.max(dieline.tolerances.boundaryComparisonMm / 2, 0.001),
  );

  const sourceToDerived = directionalDistances(
    sourceOuterSegments,
    derivedOuterSegments,
    spacing,
  );
  const derivedToSource = directionalDistances(
    derivedOuterSegments,
    sourceOuterSegments,
    spacing,
  );
  const allDistances = [...sourceToDerived, ...derivedToSource];
  const maxSourceToDerivedMm = maxOf(sourceToDerived);
  const maxDerivedToSourceMm = maxOf(derivedToSource);
  const bidirectionalHausdorffMm = Math.max(
    maxSourceToDerivedMm,
    maxDerivedToSourceMm,
  );
  const rmsBoundaryDistanceMm = Math.sqrt(
    allDistances.reduce((sum, value) => sum + value * value, 0) / allDistances.length,
  );
  const maxHoleHausdorffMm = matchHoleGeometry(sourceHoles, derivedHoles, spacing);

  const sourceHoleAreaMm2 = loopsArea(sourceHoles);
  const derivedHoleAreaMm2 = loopsArea(derivedHoles);
  const sourceAreaMm2 = Math.abs(signedPolygonArea(sourceOuter)) - sourceHoleAreaMm2;
  const derivedAreaMm2 = panels.reduce(
    (sum, panel) =>
      sum +
      Math.abs(signedPolygonArea(panel.outerBoundary)) -
      panel.holes.reduce(
        (holeSum, hole) => holeSum + Math.abs(signedPolygonArea(hole)),
        0,
      ),
    0,
  );
  const sourcePerimeterMm = perimeter(sourceOuterSegments);
  const derivedPerimeterMm = perimeter(derivedOuterSegments);
  const sourceHolePerimeterMm = sourceHoles.reduce(
    (sum, loop) => sum + perimeter(loopSegments(loop)),
    0,
  );
  const derivedHolePerimeterMm = derivedHoles.reduce(
    (sum, loop) => sum + perimeter(loopSegments(loop)),
    0,
  );

  return {
    sourceOuterSegmentCount: sourceOuterSegments.length,
    derivedOuterSegmentCount: derivedOuterSegments.length,
    sourceHoleCount: sourceHoles.length,
    derivedHoleCount: derivedHoles.length,
    maxSourceToDerivedMm,
    maxDerivedToSourceMm,
    bidirectionalHausdorffMm,
    rmsBoundaryDistanceMm,
    maxHoleHausdorffMm,
    sourceAreaMm2,
    derivedAreaMm2,
    areaDifferenceMm2: Math.abs(sourceAreaMm2 - derivedAreaMm2),
    sourceHoleAreaMm2,
    derivedHoleAreaMm2,
    holeAreaDifferenceMm2: Math.abs(sourceHoleAreaMm2 - derivedHoleAreaMm2),
    sourcePerimeterMm,
    derivedPerimeterMm,
    perimeterDifferenceMm: Math.abs(sourcePerimeterMm - derivedPerimeterMm),
    sourceHolePerimeterMm,
    derivedHolePerimeterMm,
    holePerimeterDifferenceMm: Math.abs(
      sourceHolePerimeterMm - derivedHolePerimeterMm,
    ),
    passesBoundaryGate:
      bidirectionalHausdorffMm <= dieline.tolerances.boundaryComparisonMm,
    passesHoleGeometryGate:
      sourceHoles.length === derivedHoles.length &&
      maxHoleHausdorffMm <= dieline.tolerances.boundaryComparisonMm,
  };
}
