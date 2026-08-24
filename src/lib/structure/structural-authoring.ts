import type { CanonicalDieline, Vec2 } from "./vector-domain";
import type {
  PlanarEdge,
  PlanarGraph,
  StructuralPanel,
} from "./topology";
import type { StructuralSourceAddress } from "./structural-rig";

const FOLD_OPERATIONS = new Set(["crease", "score", "perforation", "half-cut"]);

export type StructuralHingeCandidate = Readonly<{
  id: string;
  panelAId: string;
  panelBId: string;
  edgeIds: readonly string[];
  source: readonly StructuralSourceAddress[];
  lengthMm: number;
  start: Vec2;
  end: Vec2;
}>;

export type UnresolvedStructuralCrease = Readonly<{
  edgeId: string;
  owners: readonly string[];
  entityId: string;
  pathId: string;
  flattenedSegmentIndex: number;
  reason: "not-shared-by-exactly-two-panels";
}>;

export type StructuralConstructionInventory = Readonly<{
  panelCount: number;
  hingeCandidateCount: number;
  formsTree: boolean;
  panels: readonly Readonly<{
    id: string;
    bounds: StructuralPanel["bounds"];
    widthMm: number;
    heightMm: number;
    holeCount: number;
    creaseEdgeCount: number;
  }>[];
  hingeCandidates: readonly StructuralHingeCandidate[];
  unresolvedCreases: readonly UnresolvedStructuralCrease[];
}>;

function ownerMap(panels: readonly StructuralPanel[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const panel of panels) {
    for (const edgeId of panel.creaseEdgeIds) {
      result.set(edgeId, [...(result.get(edgeId) ?? []), panel.id]);
    }
  }
  return result;
}

function pairKey(owners: readonly string[]): string {
  return [...owners].sort().join("|");
}

function sourceAddresses(edges: readonly PlanarEdge[]): StructuralSourceAddress[] {
  const grouped = new Map<string, number[]>();
  for (const edge of edges) {
    const key = `${edge.source.entityId}\u0000${edge.source.pathId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), edge.source.flattenedSegmentIndex]);
  }
  return [...grouped.entries()].map(([key, indexes]) => {
    const [entityId, pathId] = key.split("\u0000");
    return {
      entityId,
      pathId,
      flattenedSegmentIndexes: [...new Set(indexes)].sort((a, b) => a - b),
    };
  });
}

function endpoints(
  edges: readonly PlanarEdge[],
  graph: PlanarGraph,
): { start: Vec2; end: Vec2; lengthMm: number } {
  const vertices = new Map(graph.vertices.map((vertex) => [vertex.id, vertex.point]));
  const degree = new Map<string, number>();
  let lengthMm = 0;
  for (const edge of edges) {
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
    const a = vertices.get(edge.a);
    const b = vertices.get(edge.b);
    if (!a || !b) throw new Error(`Construction candidate edge ${edge.id} has a missing vertex.`);
    lengthMm += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const endpointIds = [...degree.entries()]
    .filter(([, count]) => count === 1)
    .map(([id]) => id);
  if (endpointIds.length !== 2) {
    throw new Error(
      `Construction hinge candidate must be one connected open crease chain; found ${endpointIds.length} endpoints.`,
    );
  }
  const points = endpointIds.map((id) => vertices.get(id)!);
  points.sort((left, right) => left.x - right.x || left.y - right.y);
  return { start: { ...points[0] }, end: { ...points[1] }, lengthMm };
}

function isTree(panelIds: readonly string[], candidates: readonly StructuralHingeCandidate[]): boolean {
  if (panelIds.length === 0) return false;
  if (candidates.length !== panelIds.length - 1) return false;
  const neighbors = new Map<string, string[]>();
  for (const candidate of candidates) {
    neighbors.set(candidate.panelAId, [
      ...(neighbors.get(candidate.panelAId) ?? []),
      candidate.panelBId,
    ]);
    neighbors.set(candidate.panelBId, [
      ...(neighbors.get(candidate.panelBId) ?? []),
      candidate.panelAId,
    ]);
  }
  const visited = new Set<string>();
  const queue = [panelIds[0]];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(neighbors.get(id) ?? []));
  }
  return visited.size === panelIds.length;
}

/**
 * Derives only facts that geometry can prove: panel inventory and which two
 * panels share each physical fold chain. Fold direction, assembled angle,
 * root, sequence, glue/tuck role and collision priority remain deliberately
 * absent so a CAD graph can never masquerade as construction knowledge.
 */
export function inspectStructuralConstruction(
  _dieline: CanonicalDieline,
  graph: PlanarGraph,
  panels: readonly StructuralPanel[],
): StructuralConstructionInventory {
  const owners = ownerMap(panels);
  const creaseEdges = graph.edges.filter((edge) => FOLD_OPERATIONS.has(edge.operation));
  const unresolved: UnresolvedStructuralCrease[] = [];
  const groups = new Map<string, PlanarEdge[]>();

  for (const edge of creaseEdges) {
    const edgeOwners = [...new Set(owners.get(edge.id) ?? [])].sort();
    if (edgeOwners.length !== 2) {
      unresolved.push({
        edgeId: edge.id,
        owners: edgeOwners,
        entityId: edge.source.entityId,
        pathId: edge.source.pathId,
        flattenedSegmentIndex: edge.source.flattenedSegmentIndex,
        reason: "not-shared-by-exactly-two-panels",
      });
      continue;
    }
    const key = pairKey(edgeOwners);
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }

  const candidates = [...groups.entries()]
    .map(([key, edges]) => {
      const [panelAId, panelBId] = key.split("|");
      const axis = endpoints(edges, graph);
      return {
        id: `candidate-${panelAId}-${panelBId}`,
        panelAId,
        panelBId,
        edgeIds: edges.map((edge) => edge.id).sort(),
        source: sourceAddresses(edges),
        ...axis,
      } satisfies StructuralHingeCandidate;
    })
    .sort((left, right) =>
      left.start.y - right.start.y ||
      left.start.x - right.start.x ||
      left.id.localeCompare(right.id),
    );

  const panelIds = panels.map((panel) => panel.id);
  return {
    panelCount: panels.length,
    hingeCandidateCount: candidates.length,
    formsTree: unresolved.length === 0 && isTree(panelIds, candidates),
    panels: panels.map((panel) => ({
      id: panel.id,
      bounds: panel.bounds,
      widthMm: panel.bounds.maxX - panel.bounds.minX,
      heightMm: panel.bounds.maxY - panel.bounds.minY,
      holeCount: panel.holes.length,
      creaseEdgeCount: panel.creaseEdgeIds.length,
    })),
    hingeCandidates: candidates,
    unresolvedCreases: unresolved,
  };
}
