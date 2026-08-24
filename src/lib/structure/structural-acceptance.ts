import type { CanonicalDieline, CoreStructuralOperation, Vec2 } from "./vector-domain";
import { flattenVectorPath, distanceBetweenPoints, signedPolygonArea } from "./vector-math";
import {
  buildPlanarGraph,
  extractCutCycles,
  extractStructuralPanels,
  type PlanarEdge,
  type PlanarGraph,
  type StructuralPanel,
} from "./topology";
import { measureFlatPanelEquivalence, type FlatEquivalenceReport } from "./structural-quality";
import { createStructuralPanelGeometry } from "./structural-mesh";

const CREASE_OPERATIONS = new Set<CoreStructuralOperation>([
  "crease",
  "score",
  "perforation",
  "half-cut",
]);

export type StructuralCreaseChain = Readonly<{
  id: string;
  edgeIds: readonly string[];
  points: readonly Vec2[];
  lengthMm: number;
}>;

export type GoldenStructuralExpectations = Readonly<{
  sourceSha256: string;
  outerEnvelopeMm: Readonly<{ width: number; height: number; tolerance: number }>;
  outerEdgeCount: number;
  windowEdgeCount: number;
  creaseSourceSegmentCount: number;
  creaseChainCount: number;
  windowAreaMm2: Readonly<{ value: number; tolerance: number }>;
  windowPerimeterMm: Readonly<{ value: number; tolerance: number }>;
  maxUvRoundTripMm: number;
}>;

export type GoldenStructuralAcceptanceReport = Readonly<{
  sourceSha256: string | null;
  outerEnvelopeMm: Readonly<{ width: number; height: number }>;
  outerEdgeCount: number;
  windowEdgeCount: number;
  creaseSourceSegmentCount: number;
  creaseChainCount: number;
  panelCount: number;
  windowOwnerCount: number;
  windowAreaMm2: number;
  windowPerimeterMm: number;
  maxUvRoundTripMm: number;
  flat: FlatEquivalenceReport;
  gates: Readonly<{
    sourceSha256: boolean;
    outerEnvelope: boolean;
    outerEdgeCount: boolean;
    windowEdgeCount: boolean;
    creaseSourceSegmentCount: boolean;
    creaseChainCount: boolean;
    windowArea: boolean;
    windowPerimeter: boolean;
    windowOwnership: boolean;
    flatBoundary: boolean;
    flatHoleGeometry: boolean;
    uvRoundTrip: boolean;
  }>;
  passed: boolean;
}>;

function edgeDirection(edge: PlanarEdge, graph: PlanarGraph, from: string): Vec2 {
  const byId = new Map(graph.vertices.map((vertex) => [vertex.id, vertex.point]));
  const start = byId.get(from);
  const other = byId.get(edge.a === from ? edge.b : edge.a);
  if (!start || !other) throw new Error(`Crease edge ${edge.id} references a missing vertex.`);
  return { x: other.x - start.x, y: other.y - start.y };
}

function collinearThroughVertex(
  first: PlanarEdge,
  second: PlanarEdge,
  vertexId: string,
  graph: PlanarGraph,
  angularToleranceRad: number,
): boolean {
  const a = edgeDirection(first, graph, vertexId);
  const b = edgeDirection(second, graph, vertexId);
  const aLength = Math.hypot(a.x, a.y);
  const bLength = Math.hypot(b.x, b.y);
  if (aLength <= Number.EPSILON || bLength <= Number.EPSILON) return false;
  const normalizedCross = Math.abs(a.x * b.y - a.y * b.x) / (aLength * bLength);
  const normalizedDot = (a.x * b.x + a.y * b.y) / (aLength * bLength);
  return normalizedCross <= Math.sin(angularToleranceRad) && normalizedDot < 0;
}

export function extractCreaseChains(
  graph: PlanarGraph,
  angularToleranceRad = (0.05 * Math.PI) / 180,
): readonly StructuralCreaseChain[] {
  if (!Number.isFinite(angularToleranceRad) || angularToleranceRad < 0 || angularToleranceRad >= Math.PI / 2) {
    throw new RangeError("Crease-chain angular tolerance must be finite and between 0 and pi/2.");
  }
  const creaseEdges = graph.edges.filter((edge) => CREASE_OPERATIONS.has(edge.operation));
  const byId = new Map(creaseEdges.map((edge) => [edge.id, edge]));
  const incident = new Map<string, PlanarEdge[]>();
  for (const edge of creaseEdges) {
    incident.set(edge.a, [...(incident.get(edge.a) ?? []), edge]);
    incident.set(edge.b, [...(incident.get(edge.b) ?? []), edge]);
  }
  const vertexPoint = new Map(graph.vertices.map((vertex) => [vertex.id, vertex.point]));
  const visited = new Set<string>();
  const chains: StructuralCreaseChain[] = [];

  const continuation = (edge: PlanarEdge, at: string): PlanarEdge | null => {
    const candidates = incident.get(at) ?? [];
    if (candidates.length !== 2) return null;
    const next = candidates[0].id === edge.id ? candidates[1] : candidates[0];
    return collinearThroughVertex(edge, next, at, graph, angularToleranceRad) ? next : null;
  };

  const extend = (edgeIds: string[], vertexIds: string[], forward: boolean) => {
    while (true) {
      const edgeId = forward ? edgeIds[edgeIds.length - 1] : edgeIds[0];
      const edge = byId.get(edgeId);
      if (!edge) throw new Error(`Missing crease edge ${edgeId}.`);
      const at = forward ? vertexIds[vertexIds.length - 1] : vertexIds[0];
      const next = continuation(edge, at);
      if (!next || visited.has(next.id)) return;
      const other = next.a === at ? next.b : next.a;
      visited.add(next.id);
      if (forward) {
        edgeIds.push(next.id);
        vertexIds.push(other);
      } else {
        edgeIds.unshift(next.id);
        vertexIds.unshift(other);
      }
    }
  };

  for (const edge of creaseEdges) {
    if (visited.has(edge.id)) continue;
    visited.add(edge.id);
    const edgeIds = [edge.id];
    const vertexIds = [edge.a, edge.b];
    extend(edgeIds, vertexIds, true);
    extend(edgeIds, vertexIds, false);
    const points = vertexIds.map((id) => {
      const point = vertexPoint.get(id);
      if (!point) throw new Error(`Crease chain references missing vertex ${id}.`);
      return point;
    });
    const lengthMm = points.slice(1).reduce(
      (sum, point, index) => sum + distanceBetweenPoints(points[index], point),
      0,
    );
    chains.push({ id: `crease-chain-${chains.length + 1}`, edgeIds, points, lengthMm });
  }
  return chains;
}

function loopPerimeter(points: readonly Vec2[]): number {
  return points.reduce(
    (sum, point, index) => sum + distanceBetweenPoints(point, points[(index + 1) % points.length]),
    0,
  );
}

function cutEnvelope(points: readonly Vec2[]): { width: number; height: number } {
  const bounds = points.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  return { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

function sourceCreaseSegmentCount(dieline: CanonicalDieline): number {
  return dieline.entities
    .filter((entity) => CREASE_OPERATIONS.has(entity.operation as CoreStructuralOperation))
    .reduce((sum, entity) => {
      const flattened = flattenVectorPath(
        entity.path,
        dieline.tolerances.curveFlatteningMm,
        dieline.tolerances.maxSubdivisionDepth,
        dieline.tolerances.coordinateEpsilonMm,
      );
      return sum + flattened.points.length - 1 + (flattened.closed ? 1 : 0);
    }, 0);
}

function measureUvRoundTrip(
  panels: readonly StructuralPanel[],
  dieline: CanonicalDieline,
): number {
  let worst = 0;
  // This is a geometry/UV probe thickness only. It is not manufacturing stock
  // metadata and must never be interpreted as an authored board thickness.
  const probeThicknessMm = 1;
  for (const panel of panels) {
    const mesh = createStructuralPanelGeometry(panel, dieline, probeThicknessMm);
    try {
      const position = mesh.geometry.getAttribute("position");
      const uv = mesh.geometry.getAttribute("uv");
      for (let index = 0; index < mesh.printedFaceVertexCount; index += 1) {
        const x = position.getX(index);
        const sheetY = position.getZ(index);
        const recoveredX = (1 - uv.getX(index)) * dieline.widthMm;
        const recoveredY = (1 - uv.getY(index)) * dieline.heightMm;
        worst = Math.max(worst, Math.hypot(recoveredX - x, recoveredY - sheetY));
      }
    } finally {
      mesh.geometry.dispose();
    }
  }
  return worst;
}

function approximately(actual: number, expected: number, tolerance: number): boolean {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

export function evaluateGoldenStructuralAcceptance(
  dieline: CanonicalDieline,
  expectations: GoldenStructuralExpectations,
): GoldenStructuralAcceptanceReport {
  const graph = buildPlanarGraph(dieline);
  const cycles = extractCutCycles(dieline, graph);
  const outer = cycles.filter((cycle) => cycle.role === "outer");
  const holes = cycles.filter((cycle) => cycle.role === "hole");
  if (outer.length !== 1) throw new Error(`Golden acceptance requires one outer cut cycle; found ${outer.length}.`);
  if (holes.length !== 1) throw new Error(`Golden acceptance requires one structural window; found ${holes.length}.`);
  const panels = extractStructuralPanels(dieline, graph);
  const flat = measureFlatPanelEquivalence(dieline, panels);
  const creaseChains = extractCreaseChains(graph);
  const envelope = cutEnvelope(outer[0].points);
  const windowAreaMm2 = Math.abs(signedPolygonArea(holes[0].points));
  const windowPerimeterMm = loopPerimeter(holes[0].points);
  const windowProbe = holes[0].points.reduce(
    (sum, point) => ({ x: sum.x + point.x / holes[0].points.length, y: sum.y + point.y / holes[0].points.length }),
    { x: 0, y: 0 },
  );
  const windowOwnerCount = panels.filter((panel) => {
    // A hole is owned explicitly by the panel, so matching a representative
    // point against hole loops is safer than assuming a panel ordering.
    return panel.holes.some((loop) => {
      const center = loop.reduce(
        (sum, point) => ({ x: sum.x + point.x / loop.length, y: sum.y + point.y / loop.length }),
        { x: 0, y: 0 },
      );
      return distanceBetweenPoints(center, windowProbe) <= dieline.tolerances.topologySnapMm;
    });
  }).length;
  const maxUvRoundTripMm = measureUvRoundTrip(panels, dieline);
  const creaseSegments = sourceCreaseSegmentCount(dieline);

  const gates = {
    sourceSha256: dieline.source.sha256 === expectations.sourceSha256,
    outerEnvelope:
      approximately(envelope.width, expectations.outerEnvelopeMm.width, expectations.outerEnvelopeMm.tolerance) &&
      approximately(envelope.height, expectations.outerEnvelopeMm.height, expectations.outerEnvelopeMm.tolerance),
    outerEdgeCount: outer[0].points.length === expectations.outerEdgeCount,
    windowEdgeCount: holes[0].points.length === expectations.windowEdgeCount,
    creaseSourceSegmentCount: creaseSegments === expectations.creaseSourceSegmentCount,
    creaseChainCount: creaseChains.length === expectations.creaseChainCount,
    windowArea: approximately(windowAreaMm2, expectations.windowAreaMm2.value, expectations.windowAreaMm2.tolerance),
    windowPerimeter: approximately(windowPerimeterMm, expectations.windowPerimeterMm.value, expectations.windowPerimeterMm.tolerance),
    windowOwnership: windowOwnerCount === 1,
    flatBoundary: flat.passesBoundaryGate,
    flatHoleGeometry: flat.passesHoleGeometryGate,
    uvRoundTrip: maxUvRoundTripMm <= expectations.maxUvRoundTripMm,
  } as const;

  return {
    sourceSha256: dieline.source.sha256 ?? null,
    outerEnvelopeMm: envelope,
    outerEdgeCount: outer[0].points.length,
    windowEdgeCount: holes[0].points.length,
    creaseSourceSegmentCount: creaseSegments,
    creaseChainCount: creaseChains.length,
    panelCount: panels.length,
    windowOwnerCount,
    windowAreaMm2,
    windowPerimeterMm,
    maxUvRoundTripMm,
    flat,
    gates,
    passed: Object.values(gates).every(Boolean),
  };
}

export const LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS: GoldenStructuralExpectations = {
  sourceSha256: "b6b8cda57f693275174abfb6e2e3d74411122eb1057feac086ecd26df27df557",
  outerEnvelopeMm: { width: 712.4, height: 470, tolerance: 0.02 },
  outerEdgeCount: 70,
  windowEdgeCount: 8,
  creaseSourceSegmentCount: 24,
  creaseChainCount: 16,
  windowAreaMm2: { value: 46600.4, tolerance: 0.5 },
  windowPerimeterMm: { value: 856.57, tolerance: 0.05 },
  maxUvRoundTripMm: 0.0001,
};
