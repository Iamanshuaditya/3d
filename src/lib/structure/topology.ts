import type {
  CanonicalDieline,
  CoreStructuralOperation,
  StructuralEntity,
  Vec2,
} from "./vector-domain";
import {
  distanceBetweenPoints,
  flattenVectorPath,
  signedPolygonArea,
} from "./vector-math";

const EPSILON = 1e-9;

export type SourceSpanRef = Readonly<{
  entityId: string;
  pathId: string;
  operation: CoreStructuralOperation;
  flattenedSegmentIndex: number;
}>;

export type PlanarVertex = Readonly<{
  id: string;
  point: Vec2;
}>;

export type PlanarEdge = Readonly<{
  id: string;
  a: string;
  b: string;
  operation: CoreStructuralOperation;
  source: SourceSpanRef;
}>;

export type PlanarFace = Readonly<{
  id: string;
  vertexIds: readonly string[];
  edgeIds: readonly string[];
  points: readonly Vec2[];
  signedAreaMm2: number;
}>;

export type PlanarGraph = Readonly<{
  vertices: readonly PlanarVertex[];
  edges: readonly PlanarEdge[];
  faces: readonly PlanarFace[];
}>;

export type CutCycle = Readonly<{
  id: string;
  edgeIds: readonly string[];
  points: readonly Vec2[];
  areaMm2: number;
  nestingDepth: number;
  role: "outer" | "hole" | "island";
}>;

export type StructuralPanel = Readonly<{
  id: string;
  faceId: string;
  outerBoundary: readonly Vec2[];
  holes: readonly (readonly Vec2[])[];
  creaseEdgeIds: readonly string[];
  bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
}>;

type MutableSpan = {
  start: Vec2;
  end: Vec2;
  operation: CoreStructuralOperation;
  source: SourceSpanRef;
  splits: number[];
};

const TOPOLOGY_OPERATIONS = new Set<CoreStructuralOperation>([
  "cut",
  "window-cut",
  "crease",
  "perforation",
  "score",
  "half-cut",
]);

function isCoreOperation(value: string): value is CoreStructuralOperation {
  return TOPOLOGY_OPERATIONS.has(value as CoreStructuralOperation);
}

function isCutOperation(operation: CoreStructuralOperation): boolean {
  return operation === "cut" || operation === "window-cut";
}

function isCreaseOperation(operation: CoreStructuralOperation): boolean {
  return (
    operation === "crease" ||
    operation === "score" ||
    operation === "perforation" ||
    operation === "half-cut"
  );
}

function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function parameterOnSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  if (denominator <= EPSILON) return 0;
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator;
}

function segmentIntersection(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
  epsilon: number,
): { aT: number; bT: number } | null {
  const r = subtract(a1, a0);
  const s = subtract(b1, b0);
  const denominator = cross(r, s);
  const qMinusP = subtract(b0, a0);
  if (Math.abs(denominator) <= epsilon) return null;
  const aT = cross(qMinusP, s) / denominator;
  const bT = cross(qMinusP, r) / denominator;
  if (aT < -epsilon || aT > 1 + epsilon || bT < -epsilon || bT > 1 + epsilon) return null;
  return {
    aT: Math.max(0, Math.min(1, aT)),
    bT: Math.max(0, Math.min(1, bT)),
  };
}

function operationForTopology(entity: StructuralEntity): CoreStructuralOperation | null {
  return isCoreOperation(entity.operation) ? entity.operation : null;
}

function collectSpans(dieline: CanonicalDieline): MutableSpan[] {
  const result: MutableSpan[] = [];
  for (const entity of dieline.entities) {
    const operation = operationForTopology(entity);
    if (!operation) continue;
    const flattened = flattenVectorPath(
      entity.path,
      dieline.tolerances.curveFlatteningMm,
      dieline.tolerances.maxSubdivisionDepth,
      dieline.tolerances.coordinateEpsilonMm,
    );
    const segmentCount = flattened.points.length - 1 + (flattened.closed ? 1 : 0);
    for (let index = 0; index < segmentCount; index += 1) {
      const start = flattened.points[index];
      const end = flattened.points[(index + 1) % flattened.points.length];
      if (distanceBetweenPoints(start, end) <= dieline.tolerances.coordinateEpsilonMm) continue;
      result.push({
        start,
        end,
        operation,
        source: {
          entityId: entity.id,
          pathId: entity.path.id,
          operation,
          flattenedSegmentIndex: index,
        },
        splits: [0, 1],
      });
    }
  }
  return result;
}

function addSplit(span: MutableSpan, parameter: number, epsilon: number): void {
  const clamped = Math.max(0, Math.min(1, parameter));
  if (span.splits.some((existing) => Math.abs(existing - clamped) <= epsilon)) return;
  span.splits.push(clamped);
}

function splitAtIntersections(spans: MutableSpan[], toleranceMm: number): void {
  const parameterEpsilon = 1e-10;
  for (let first = 0; first < spans.length; first += 1) {
    for (let second = first + 1; second < spans.length; second += 1) {
      const a = spans[first];
      const b = spans[second];
      const intersection = segmentIntersection(
        a.start,
        a.end,
        b.start,
        b.end,
        toleranceMm * 1e-6,
      );
      if (!intersection) continue;
      addSplit(a, intersection.aT, parameterEpsilon);
      addSplit(b, intersection.bT, parameterEpsilon);
    }
  }
}

class VertexIndex {
  private readonly buckets = new Map<string, PlanarVertex[]>();
  private readonly vertices: PlanarVertex[] = [];

  constructor(private readonly toleranceMm: number) {}

  private key(point: Vec2): string {
    const cell = Math.max(this.toleranceMm, 1e-9);
    return `${Math.round(point.x / cell)}:${Math.round(point.y / cell)}`;
  }

  getOrCreate(point: Vec2): PlanarVertex {
    const cell = Math.max(this.toleranceMm, 1e-9);
    const gx = Math.round(point.x / cell);
    const gy = Math.round(point.y / cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const candidates = this.buckets.get(`${gx + dx}:${gy + dy}`) ?? [];
        for (const candidate of candidates) {
          if (distanceBetweenPoints(candidate.point, point) <= this.toleranceMm) return candidate;
        }
      }
    }
    const vertex: PlanarVertex = { id: `v${this.vertices.length}`, point: { ...point } };
    this.vertices.push(vertex);
    const key = this.key(point);
    this.buckets.set(key, [...(this.buckets.get(key) ?? []), vertex]);
    return vertex;
  }

  all(): readonly PlanarVertex[] {
    return this.vertices;
  }
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildEdges(spans: MutableSpan[], toleranceMm: number) {
  const vertices = new VertexIndex(toleranceMm);
  const edges: PlanarEdge[] = [];
  const seen = new Map<string, PlanarEdge>();

  for (const span of spans) {
    const sorted = [...span.splits].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      const startPoint = lerp(span.start, span.end, sorted[index - 1]);
      const endPoint = lerp(span.start, span.end, sorted[index]);
      if (distanceBetweenPoints(startPoint, endPoint) <= toleranceMm) continue;
      const start = vertices.getOrCreate(startPoint);
      const end = vertices.getOrCreate(endPoint);
      if (start.id === end.id) continue;
      const key = edgeKey(start.id, end.id);
      const existing = seen.get(key);
      if (existing) {
        if (existing.operation !== span.operation) {
          throw new Error(
            `Ambiguous structural edge ${key}: ${existing.operation} overlaps ${span.operation}.`,
          );
        }
        continue;
      }
      const edge: PlanarEdge = {
        id: `e${edges.length}`,
        a: start.id,
        b: end.id,
        operation: span.operation,
        source: span.source,
      };
      edges.push(edge);
      seen.set(key, edge);
    }
  }

  return { vertices: vertices.all(), edges };
}

type HalfEdge = { edge: PlanarEdge; from: string; to: string; angle: number };

function traceFaces(vertices: readonly PlanarVertex[], edges: readonly PlanarEdge[]): PlanarFace[] {
  const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const outgoing = new Map<string, HalfEdge[]>();

  for (const edge of edges) {
    const a = byId.get(edge.a);
    const b = byId.get(edge.b);
    if (!a || !b) throw new Error(`Planar edge ${edge.id} references a missing vertex.`);
    const ab: HalfEdge = {
      edge,
      from: edge.a,
      to: edge.b,
      angle: Math.atan2(b.point.y - a.point.y, b.point.x - a.point.x),
    };
    const ba: HalfEdge = {
      edge,
      from: edge.b,
      to: edge.a,
      angle: Math.atan2(a.point.y - b.point.y, a.point.x - b.point.x),
    };
    outgoing.set(edge.a, [...(outgoing.get(edge.a) ?? []), ab]);
    outgoing.set(edge.b, [...(outgoing.get(edge.b) ?? []), ba]);
  }
  for (const list of outgoing.values()) list.sort((left, right) => left.angle - right.angle);

  const visited = new Set<string>();
  const faces: PlanarFace[] = [];
  const halfKey = (half: HalfEdge) => `${half.edge.id}:${half.from}>${half.to}`;

  for (const candidates of outgoing.values()) {
    for (const start of candidates) {
      if (visited.has(halfKey(start))) continue;
      const vertexIds: string[] = [];
      const edgeIds: string[] = [];
      let current = start;
      let guard = 0;
      while (guard <= edges.length * 2 + 4) {
        guard += 1;
        const key = halfKey(current);
        if (visited.has(key)) break;
        visited.add(key);
        vertexIds.push(current.from);
        edgeIds.push(current.edge.id);

        const atTarget = outgoing.get(current.to) ?? [];
        const reverseIndex = atTarget.findIndex(
          (candidate) => candidate.edge.id === current.edge.id && candidate.to === current.from,
        );
        if (reverseIndex < 0 || atTarget.length === 0) break;
        const nextIndex = (reverseIndex - 1 + atTarget.length) % atTarget.length;
        current = atTarget[nextIndex];
        if (
          current.edge.id === start.edge.id &&
          current.from === start.from &&
          current.to === start.to
        ) {
          const points = vertexIds.map((id) => byId.get(id)!.point);
          const area = signedPolygonArea(points);
          if (Math.abs(area) > EPSILON) {
            faces.push({
              id: `f${faces.length}`,
              vertexIds: [...vertexIds],
              edgeIds: [...edgeIds],
              points,
              signedAreaMm2: area,
            });
          }
          break;
        }
      }
    }
  }
  return faces;
}

function pointOnSegment(point: Vec2, a: Vec2, b: Vec2, tolerance: number): boolean {
  const ab = subtract(b, a);
  const ap = subtract(point, a);
  const length = Math.hypot(ab.x, ab.y);
  if (length <= EPSILON) return distanceBetweenPoints(point, a) <= tolerance;
  const distance = Math.abs(cross(ab, ap)) / length;
  if (distance > tolerance) return false;
  const t = parameterOnSegment(point, a, b);
  return t >= -EPSILON && t <= 1 + EPSILON;
}

function pointInPolygon(point: Vec2, polygon: readonly Vec2[], tolerance: number): boolean {
  let inside = false;
  for (let index = 0, prior = polygon.length - 1; index < polygon.length; prior = index++) {
    const a = polygon[prior];
    const b = polygon[index];
    if (pointOnSegment(point, a, b, tolerance)) return true;
    const crosses = (a.y > point.y) !== (b.y > point.y);
    if (crosses) {
      const xAtY = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < xAtY) inside = !inside;
    }
  }
  return inside;
}

function arithmeticMean(points: readonly Vec2[]): Vec2 {
  const sum = points.reduce(
    (accumulator, point) => ({ x: accumulator.x + point.x, y: accumulator.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function interiorProbe(points: readonly Vec2[], tolerance: number): Vec2 {
  const mean = arithmeticMean(points);
  if (
    pointInPolygon(mean, points, tolerance) &&
    !points.some((point) => distanceBetweenPoints(point, mean) <= tolerance)
  ) {
    return mean;
  }
  const epsilon = Math.max(tolerance * 2, 1e-4);
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const midpoint = lerp(a, b, 0.5);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) continue;
    const normal = { x: -dy / length, y: dx / length };
    for (const sign of [-1, 1]) {
      const candidate = {
        x: midpoint.x + normal.x * epsilon * sign,
        y: midpoint.y + normal.y * epsilon * sign,
      };
      if (pointInPolygon(candidate, points, tolerance)) return candidate;
    }
  }
  throw new Error("Could not derive an interior probe for a structural polygon.");
}

function polygonBounds(points: readonly Vec2[]) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function deduplicateFaces(faces: readonly PlanarFace[]): PlanarFace[] {
  const unique = new Map<string, PlanarFace>();
  for (const face of faces) {
    const key = [...face.edgeIds].sort().join("|");
    const existing = unique.get(key);
    if (!existing || face.signedAreaMm2 > existing.signedAreaMm2) unique.set(key, face);
  }
  return [...unique.values()];
}

export function buildPlanarGraph(dieline: CanonicalDieline): PlanarGraph {
  const spans = collectSpans(dieline);
  splitAtIntersections(spans, dieline.tolerances.topologySnapMm);
  const { vertices, edges } = buildEdges(spans, dieline.tolerances.topologySnapMm);
  const faces = traceFaces(vertices, edges);
  return { vertices, edges, faces };
}

export function extractCutCycles(
  dieline: CanonicalDieline,
  graph: PlanarGraph = buildPlanarGraph(dieline),
): readonly CutCycle[] {
  const cutEdges = graph.edges.filter((edge) => isCutOperation(edge.operation));
  if (cutEdges.length === 0) throw new Error("Structural topology contains no cut edges.");
  const incident = new Map<string, number>();
  for (const edge of cutEdges) {
    incident.set(edge.a, (incident.get(edge.a) ?? 0) + 1);
    incident.set(edge.b, (incident.get(edge.b) ?? 0) + 1);
  }
  const openVertices = [...incident.entries()].filter(([, degree]) => degree !== 2);
  if (openVertices.length > 0) {
    throw new Error(
      `Cut topology is not a closed 2-regular contour at ${openVertices.length} vertex/vertices; explicit reviewed topology repair is required.`,
    );
  }

  const rawCycles = deduplicateFaces(traceFaces(graph.vertices, cutEdges)).filter(
    (face) => face.signedAreaMm2 > EPSILON,
  );
  if (rawCycles.length === 0) throw new Error("No closed cut cycle could be reconstructed.");
  const tolerance = dieline.tolerances.topologySnapMm;
  const records = rawCycles.map((face, index) => ({
    face,
    index,
    probe: interiorProbe(face.points, tolerance),
  }));

  return records.map(({ face, index, probe }) => {
    const nestingDepth = records.filter(
      (candidate) =>
        candidate.index !== index &&
        Math.abs(candidate.face.signedAreaMm2) > Math.abs(face.signedAreaMm2) + EPSILON &&
        pointInPolygon(probe, candidate.face.points, tolerance),
    ).length;
    return {
      id: `cut-cycle-${index + 1}`,
      edgeIds: [...face.edgeIds],
      points: [...face.points],
      areaMm2: Math.abs(face.signedAreaMm2),
      nestingDepth,
      role: nestingDepth === 0 ? "outer" : nestingDepth % 2 === 1 ? "hole" : "island",
    } satisfies CutCycle;
  });
}

export function extractStructuralPanels(
  dieline: CanonicalDieline,
  graph: PlanarGraph = buildPlanarGraph(dieline),
): readonly StructuralPanel[] {
  const cycles = extractCutCycles(dieline, graph);
  const outerCycles = cycles.filter((cycle) => cycle.role === "outer");
  if (outerCycles.length !== 1) {
    throw new Error(
      `One-sheet structural panel extraction requires exactly one outer cut cycle; found ${outerCycles.length}.`,
    );
  }
  const outer = outerCycles[0];
  const holes = cycles.filter((cycle) => cycle.role === "hole");
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const tolerance = dieline.tolerances.topologySnapMm;

  // Canonical coordinates are x-right/y-down. With the predecessor half-edge
  // walk above, bounded cells have positive signed area; negative cycles are
  // the unbounded/exterior companion and must never become physical panels.
  const candidateFaces = deduplicateFaces(graph.faces).filter((face) => {
    if (face.signedAreaMm2 <= EPSILON) return false;
    const probe = interiorProbe(face.points, tolerance);
    return (
      pointInPolygon(probe, outer.points, tolerance) &&
      !holes.some((hole) => pointInPolygon(probe, hole.points, tolerance))
    );
  });

  const panels: StructuralPanel[] = [];
  for (const face of candidateFaces) {
    const ownedHoles = holes.filter((hole) =>
      pointInPolygon(interiorProbe(hole.points, tolerance), face.points, tolerance),
    );
    const creaseEdgeIds = face.edgeIds.filter((id) => {
      const operation = edgeById.get(id)?.operation;
      return operation ? isCreaseOperation(operation) : false;
    });
    panels.push({
      id: `panel-${panels.length + 1}`,
      faceId: face.id,
      outerBoundary: [...face.points],
      holes: ownedHoles.map((hole) => [...hole.points]),
      creaseEdgeIds,
      bounds: polygonBounds(face.points),
    });
  }

  if (panels.length === 0) {
    throw new Error("No bounded structural panels were extracted from the canonical dieline.");
  }
  for (const hole of holes) {
    const holeProbe = interiorProbe(hole.points, tolerance);
    const owners = panels.filter((panel) =>
      pointInPolygon(holeProbe, panel.outerBoundary, tolerance),
    );
    if (owners.length !== 1) {
      throw new Error(`Cut hole ${hole.id} must belong to exactly one structural panel; found ${owners.length}.`);
    }
  }
  return panels;
}
