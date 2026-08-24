import type { ArticulatedHinge } from "@/types/unfold";
import type { CanonicalDieline, Vec2 } from "./vector-domain";
import type { PlanarEdge, PlanarGraph, StructuralPanel } from "./topology";

export type StructuralMotionEasing = "linear" | "easeInOutCubic";

export type StructuralHingeMotion = Readonly<{
  delayMs: number;
  durationMs: number;
  easing: StructuralMotionEasing;
}>;

export const DEFAULT_STRUCTURAL_HINGE_MOTION: StructuralHingeMotion = Object.freeze({
  delayMs: 0,
  durationMs: 550,
  easing: "easeInOutCubic",
});

/**
 * Durable address of source crease geometry. Generated planar-edge ids are not
 * stable construction metadata, so authored rigs bind source entities/paths
 * and optionally the exact flattened source spans that were reviewed.
 */
export type StructuralSourceAddress = Readonly<{
  entityId: string;
  pathId: string;
  flattenedSegmentIndexes?: readonly number[];
}>;

export type StructuralHingeDefinition = Readonly<{
  id: string;
  parentPanelId: string;
  childPanelId: string;
  source: readonly StructuralSourceAddress[];
  assembledAngleDeg: number;
  openAngleDeg?: number;
  isPrimary?: boolean;
  motion?: Partial<StructuralHingeMotion>;
}>;

export type StructuralConstructionSpec = Readonly<{
  schemaVersion: 1;
  sourceLock: Readonly<{
    canonicalSchemaVersion: 2;
    dielineId: string;
    sha256: string;
  }>;
  rootPanelId: string;
  boardThicknessMm: number;
  hinges: readonly StructuralHingeDefinition[];
}>;

export type ResolvedStructuralHinge = Readonly<{
  id: string;
  parentPanelId: string;
  childPanelId: string;
  parentHingeId: string | null;
  depth: number;
  sourceEdgeIds: readonly string[];
  source: readonly StructuralSourceAddress[];
  start: Vec2;
  end: Vec2;
  lengthMm: number;
  assembledAngleDeg: number;
  flatAngleDeg: 0;
  openAngleDeg?: number;
  isPrimary: boolean;
  motion: StructuralHingeMotion;
}>;

export type ResolvedStructuralRig = Readonly<{
  sourceLock: StructuralConstructionSpec["sourceLock"];
  rootPanelId: string;
  boardThicknessMm: number;
  hinges: readonly ResolvedStructuralHinge[];
  articulatedHinges: readonly ArticulatedHinge[];
}>;

function isFoldEdge(edge: PlanarEdge): boolean {
  return (
    edge.operation === "crease" ||
    edge.operation === "score" ||
    edge.operation === "perforation" ||
    edge.operation === "half-cut"
  );
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function resolveMotion(
  motion: Partial<StructuralHingeMotion> | undefined,
  hingeId: string,
): StructuralHingeMotion {
  const delayMs = motion?.delayMs ?? DEFAULT_STRUCTURAL_HINGE_MOTION.delayMs;
  const durationMs = motion?.durationMs ?? DEFAULT_STRUCTURAL_HINGE_MOTION.durationMs;
  const easing = motion?.easing ?? DEFAULT_STRUCTURAL_HINGE_MOTION.easing;
  finite(delayMs, `Hinge ${hingeId} delayMs`);
  finite(durationMs, `Hinge ${hingeId} durationMs`);
  if (delayMs < 0) throw new RangeError(`Hinge ${hingeId} delayMs cannot be negative.`);
  if (durationMs <= 0) throw new RangeError(`Hinge ${hingeId} durationMs must be positive.`);
  if (easing !== "linear" && easing !== "easeInOutCubic") {
    throw new Error(`Hinge ${hingeId} uses unsupported easing ${String(easing)}.`);
  }
  return { delayMs, durationMs, easing };
}

function addressMatches(address: StructuralSourceAddress, edge: PlanarEdge): boolean {
  if (edge.source.entityId !== address.entityId || edge.source.pathId !== address.pathId) return false;
  return (
    !address.flattenedSegmentIndexes ||
    address.flattenedSegmentIndexes.includes(edge.source.flattenedSegmentIndex)
  );
}

function edgeLength(edge: PlanarEdge, vertices: ReadonlyMap<string, Vec2>): number {
  const a = vertices.get(edge.a);
  const b = vertices.get(edge.b);
  if (!a || !b) throw new Error(`Structural edge ${edge.id} references a missing vertex.`);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function orderedEndpoints(
  edges: readonly PlanarEdge[],
  vertices: ReadonlyMap<string, Vec2>,
  toleranceMm: number,
): { start: Vec2; end: Vec2; lengthMm: number } {
  if (edges.length === 0) throw new Error("A structural hinge must resolve at least one topology edge.");

  const degree = new Map<string, number>();
  const incident = new Map<string, PlanarEdge[]>();
  for (const edge of edges) {
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
    incident.set(edge.a, [...(incident.get(edge.a) ?? []), edge]);
    incident.set(edge.b, [...(incident.get(edge.b) ?? []), edge]);
  }

  const branches = [...degree.entries()].filter(([, count]) => count > 2);
  if (branches.length > 0) throw new Error("Structural hinge source chain branches; one hinge must be one straight degree of freedom.");
  const endpointIds = [...degree.entries()].filter(([, count]) => count === 1).map(([id]) => id);
  if (endpointIds.length !== 2) {
    throw new Error(`Structural hinge source chain must have exactly two endpoints; found ${endpointIds.length}.`);
  }

  const visitedEdges = new Set<string>();
  const queue = [endpointIds[0]];
  const visitedVertices = new Set<string>();
  while (queue.length > 0) {
    const vertexId = queue.shift()!;
    if (visitedVertices.has(vertexId)) continue;
    visitedVertices.add(vertexId);
    for (const edge of incident.get(vertexId) ?? []) {
      visitedEdges.add(edge.id);
      queue.push(edge.a === vertexId ? edge.b : edge.a);
    }
  }
  if (visitedEdges.size !== edges.length) {
    throw new Error("Structural hinge source spans are disconnected.");
  }

  const first = vertices.get(endpointIds[0]);
  const second = vertices.get(endpointIds[1]);
  if (!first || !second) throw new Error("Structural hinge endpoint is missing from the planar graph.");
  const ordered = [first, second].sort((left, right) => left.x - right.x || left.y - right.y);
  const start = ordered[0];
  const end = ordered[1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const directLength = Math.hypot(dx, dy);
  if (directLength <= toleranceMm) throw new Error("Structural hinge source chain has zero usable length.");

  for (const vertexId of degree.keys()) {
    const point = vertices.get(vertexId)!;
    const perpendicular = Math.abs(dx * (start.y - point.y) - (start.x - point.x) * dy) / directLength;
    if (perpendicular > toleranceMm) {
      throw new Error(
        `Structural hinge source chain is not straight within ${toleranceMm} mm tolerance.`,
      );
    }
  }

  const totalLength = edges.reduce((sum, edge) => sum + edgeLength(edge, vertices), 0);
  if (Math.abs(totalLength - directLength) > Math.max(toleranceMm, directLength * 1e-9)) {
    throw new Error("Structural hinge source chain overlaps or doubles back instead of forming one straight crease.");
  }
  return { start: { ...start }, end: { ...end }, lengthMm: totalLength };
}

function samePair(owners: readonly string[], parentPanelId: string, childPanelId: string): boolean {
  if (owners.length !== 2) return false;
  const expected = [parentPanelId, childPanelId].sort();
  const actual = [...owners].sort();
  return expected[0] === actual[0] && expected[1] === actual[1];
}

function validateSourceLock(dieline: CanonicalDieline, spec: StructuralConstructionSpec): void {
  if (spec.sourceLock.canonicalSchemaVersion !== dieline.schemaVersion) {
    throw new Error(
      `Structural rig canonical schema lock ${spec.sourceLock.canonicalSchemaVersion} does not match dieline schema ${dieline.schemaVersion}.`,
    );
  }
  if (spec.sourceLock.dielineId !== dieline.id) {
    throw new Error(`Structural rig is locked to dieline ${spec.sourceLock.dielineId}, not ${dieline.id}.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(spec.sourceLock.sha256)) {
    throw new Error("Structural rig source SHA-256 lock must be a 64-character hexadecimal digest.");
  }
  if (!dieline.source.sha256) {
    throw new Error("Canonical dieline has no source SHA-256; authored construction metadata cannot be hash-validated.");
  }
  if (spec.sourceLock.sha256.toLowerCase() !== dieline.source.sha256.toLowerCase()) {
    throw new Error("Structural rig source SHA-256 does not match the canonical dieline source.");
  }
}

/**
 * Resolves authored construction facts against exact imported topology.
 *
 * Geometry is never inferred here: every hinge must bind reviewed source
 * crease spans, be shared by exactly the declared panel pair, and participate
 * in one connected acyclic panel hierarchy. Zero degrees remains the exact
 * canonical flat pose.
 */
export function resolveStructuralRig(
  dieline: CanonicalDieline,
  graph: PlanarGraph,
  panels: readonly StructuralPanel[],
  spec: StructuralConstructionSpec,
): ResolvedStructuralRig {
  validateSourceLock(dieline, spec);
  finite(spec.boardThicknessMm, "boardThicknessMm");
  if (spec.boardThicknessMm <= 0) throw new RangeError("boardThicknessMm must be positive.");

  const panelById = new Map(panels.map((panel) => [panel.id, panel]));
  if (!panelById.has(spec.rootPanelId)) {
    throw new Error(`Structural rig root panel ${spec.rootPanelId} does not exist.`);
  }
  if (spec.hinges.length !== Math.max(0, panels.length - 1)) {
    throw new Error(
      `A connected ${panels.length}-panel structural rig requires ${Math.max(0, panels.length - 1)} hinges; found ${spec.hinges.length}.`,
    );
  }

  const hingeIds = new Set<string>();
  const incomingByPanel = new Map<string, string>();
  for (const hinge of spec.hinges) {
    if (!hinge.id) throw new Error("Structural hinge id cannot be empty.");
    if (hingeIds.has(hinge.id)) throw new Error(`Duplicate structural hinge id ${hinge.id}.`);
    hingeIds.add(hinge.id);
    if (!panelById.has(hinge.parentPanelId)) throw new Error(`Hinge ${hinge.id} parent panel ${hinge.parentPanelId} does not exist.`);
    if (!panelById.has(hinge.childPanelId)) throw new Error(`Hinge ${hinge.id} child panel ${hinge.childPanelId} does not exist.`);
    if (hinge.parentPanelId === hinge.childPanelId) throw new Error(`Hinge ${hinge.id} cannot fold a panel against itself.`);
    if (hinge.childPanelId === spec.rootPanelId) throw new Error(`Root panel ${spec.rootPanelId} cannot have an incoming hinge.`);
    if (incomingByPanel.has(hinge.childPanelId)) {
      throw new Error(`Panel ${hinge.childPanelId} has more than one parent hinge.`);
    }
    incomingByPanel.set(hinge.childPanelId, hinge.id);
    finite(hinge.assembledAngleDeg, `Hinge ${hinge.id} assembledAngleDeg`);
    if (hinge.openAngleDeg !== undefined) finite(hinge.openAngleDeg, `Hinge ${hinge.id} openAngleDeg`);
    if (hinge.source.length === 0) throw new Error(`Hinge ${hinge.id} has no source crease addresses.`);
  }
  for (const panel of panels) {
    if (panel.id !== spec.rootPanelId && !incomingByPanel.has(panel.id)) {
      throw new Error(`Non-root panel ${panel.id} has no authored parent hinge.`);
    }
  }

  const children = new Map<string, StructuralHingeDefinition[]>();
  for (const hinge of spec.hinges) {
    children.set(hinge.parentPanelId, [...(children.get(hinge.parentPanelId) ?? []), hinge]);
  }
  const depthByPanel = new Map<string, number>([[spec.rootPanelId, 0]]);
  const queue = [spec.rootPanelId];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    const parentDepth = depthByPanel.get(parent)!;
    for (const hinge of children.get(parent) ?? []) {
      if (depthByPanel.has(hinge.childPanelId)) {
        throw new Error(`Structural panel hierarchy contains a cycle at ${hinge.childPanelId}.`);
      }
      depthByPanel.set(hinge.childPanelId, parentDepth + 1);
      queue.push(hinge.childPanelId);
    }
  }
  if (depthByPanel.size !== panels.length) {
    throw new Error(`Structural panel hierarchy reaches ${depthByPanel.size}/${panels.length} panels from root ${spec.rootPanelId}.`);
  }

  const vertexById = new Map(graph.vertices.map((vertex) => [vertex.id, vertex.point]));
  const ownersByEdge = new Map<string, string[]>();
  for (const panel of panels) {
    for (const edgeId of panel.creaseEdgeIds) {
      ownersByEdge.set(edgeId, [...(ownersByEdge.get(edgeId) ?? []), panel.id]);
    }
  }

  const usedTopologyEdges = new Set<string>();
  const resolved: ResolvedStructuralHinge[] = spec.hinges.map((hinge) => {
    const selected = new Map<string, PlanarEdge>();
    for (const address of hinge.source) {
      const matches = graph.edges.filter((edge) => isFoldEdge(edge) && addressMatches(address, edge));
      if (matches.length === 0) {
        throw new Error(
          `Hinge ${hinge.id} source ${address.entityId}/${address.pathId} does not resolve to a fold edge.`,
        );
      }
      for (const edge of matches) selected.set(edge.id, edge);
    }
    const edges = [...selected.values()];
    for (const edge of edges) {
      if (usedTopologyEdges.has(edge.id)) {
        throw new Error(`Topology crease edge ${edge.id} is claimed by more than one structural hinge.`);
      }
      const owners = ownersByEdge.get(edge.id) ?? [];
      if (!samePair(owners, hinge.parentPanelId, hinge.childPanelId)) {
        throw new Error(
          `Hinge ${hinge.id} edge ${edge.id} is adjacent to [${owners.join(", ")}], not exactly ${hinge.parentPanelId}/${hinge.childPanelId}.`,
        );
      }
      usedTopologyEdges.add(edge.id);
    }

    const endpoints = orderedEndpoints(edges, vertexById, dieline.tolerances.topologySnapMm);
    const parentHingeId = incomingByPanel.get(hinge.parentPanelId) ?? null;
    return {
      id: hinge.id,
      parentPanelId: hinge.parentPanelId,
      childPanelId: hinge.childPanelId,
      parentHingeId,
      depth: depthByPanel.get(hinge.childPanelId)!,
      sourceEdgeIds: edges.map((edge) => edge.id),
      source: hinge.source.map((address) => ({
        ...address,
        flattenedSegmentIndexes: address.flattenedSegmentIndexes
          ? [...address.flattenedSegmentIndexes]
          : undefined,
      })),
      start: endpoints.start,
      end: endpoints.end,
      lengthMm: endpoints.lengthMm,
      assembledAngleDeg: hinge.assembledAngleDeg,
      flatAngleDeg: 0,
      openAngleDeg: hinge.openAngleDeg,
      isPrimary: hinge.isPrimary ?? false,
      motion: resolveMotion(hinge.motion, hinge.id),
    };
  });

  const articulatedHinges: ArticulatedHinge[] = resolved.map((hinge) => ({
    id: hinge.id,
    parentId: hinge.parentHingeId,
    depth: hinge.depth,
    assembledAngleDeg: hinge.assembledAngleDeg,
    flatAngleDeg: 0,
    openAngleDeg: hinge.openAngleDeg,
    isPrimary: hinge.isPrimary,
  }));

  return {
    sourceLock: spec.sourceLock,
    rootPanelId: spec.rootPanelId,
    boardThicknessMm: spec.boardThicknessMm,
    hinges: resolved,
    articulatedHinges,
  };
}
