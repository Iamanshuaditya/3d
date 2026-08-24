import type {
  CanonicalDieline,
  CoreStructuralOperation,
  StructuralEntity,
  Vec2,
} from "./vector-domain";
import { IDENTITY_AFFINE_MATRIX } from "./vector-domain";
import {
  distanceBetweenPoints,
  flattenVectorPath,
} from "./vector-math";
import { buildPlanarGraph, type PlanarGraph, type SourceSpanRef } from "./topology";

const TOPOLOGY_OPERATIONS = new Set<CoreStructuralOperation>([
  "cut",
  "window-cut",
  "crease",
  "score",
  "perforation",
  "half-cut",
]);

export type StructuralTopologyProfile = Readonly<{
  id: string;
  /** Profile is valid only for this exact source when supplied. */
  sourceSha256?: string;
  /**
   * Maximum reviewed distance for a dangling structural endpoint to meet the
   * interior of another structural span. This never mutates canonical source
   * vectors; it is used only to derive the planar topology graph.
   */
  endpointToSpanSnapMm: number;
  /** Optional exact repair-count gate for a reviewed source profile. */
  expectedRepairCount?: number;
}>;

export type StructuralTopologyRepair = Readonly<{
  kind: "endpoint-to-span-snap";
  source: SourceSpanRef;
  sourceEndpoint: "start" | "end";
  target: SourceSpanRef;
  from: Vec2;
  to: Vec2;
  distanceMm: number;
  targetParameter: number;
}>;

export type ProfiledPlanarGraph = Readonly<{
  graph: PlanarGraph;
  repairs: readonly StructuralTopologyRepair[];
  topologyDieline: CanonicalDieline;
}>;

type MutableTopologySpan = {
  entityIndex: number;
  flattenedSegmentIndex: number;
  operation: CoreStructuralOperation;
  start: Vec2;
  end: Vec2;
  source: SourceSpanRef;
};

function coreOperation(entity: StructuralEntity): CoreStructuralOperation | null {
  return TOPOLOGY_OPERATIONS.has(entity.operation as CoreStructuralOperation)
    ? (entity.operation as CoreStructuralOperation)
    : null;
}

function projectionToSegment(point: Vec2, start: Vec2, end: Vec2) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return null;
  const raw = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, raw));
  const projected = { x: start.x + dx * t, y: start.y + dy * t };
  return { t, projected, distanceMm: distanceBetweenPoints(point, projected) };
}

function collectTopologySpans(dieline: CanonicalDieline): MutableTopologySpan[] {
  const result: MutableTopologySpan[] = [];
  dieline.entities.forEach((entity, entityIndex) => {
    const operation = coreOperation(entity);
    if (!operation) return;
    const flat = flattenVectorPath(
      entity.path,
      dieline.tolerances.curveFlatteningMm,
      dieline.tolerances.maxSubdivisionDepth,
      dieline.tolerances.coordinateEpsilonMm,
    );
    const count = flat.points.length - 1 + (flat.closed ? 1 : 0);
    for (let index = 0; index < count; index += 1) {
      result.push({
        entityIndex,
        flattenedSegmentIndex: index,
        operation,
        start: { ...flat.points[index] },
        end: { ...flat.points[(index + 1) % flat.points.length] },
        source: {
          entityId: entity.id,
          pathId: entity.path.id,
          operation,
          flattenedSegmentIndex: index,
        },
      });
    }
  });
  return result;
}

function endpointAlreadyConnected(
  point: Vec2,
  ownSpan: MutableTopologySpan,
  spans: readonly MutableTopologySpan[],
  toleranceMm: number,
): boolean {
  return spans.some(
    (other) =>
      other !== ownSpan &&
      (distanceBetweenPoints(point, other.start) <= toleranceMm ||
        distanceBetweenPoints(point, other.end) <= toleranceMm),
  );
}

function snapDanglingEndpoints(
  spans: MutableTopologySpan[],
  toleranceMm: number,
  coordinateEpsilonMm: number,
): StructuralTopologyRepair[] {
  const repairs: StructuralTopologyRepair[] = [];
  const original = spans.map((span) => ({
    span,
    start: { ...span.start },
    end: { ...span.end },
  }));

  for (const record of original) {
    for (const endpointName of ["start", "end"] as const) {
      const point = record[endpointName];
      if (endpointAlreadyConnected(point, record.span, spans, toleranceMm)) continue;

      const candidates = original.flatMap((targetRecord) => {
        if (targetRecord.span === record.span) return [];
        const projection = projectionToSegment(point, targetRecord.start, targetRecord.end);
        if (!projection) return [];
        // Endpoint-to-endpoint cases belong to the normal vertex snapper. This
        // profile exists specifically for a dangling endpoint meeting a span's
        // interior, so keep the repair semantics unambiguous.
        if (projection.t <= 1e-9 || projection.t >= 1 - 1e-9) return [];
        if (
          projection.distanceMm <= coordinateEpsilonMm ||
          projection.distanceMm > toleranceMm
        ) {
          return [];
        }
        return [{ targetRecord, projection }];
      });
      if (candidates.length === 0) continue;
      candidates.sort((left, right) => left.projection.distanceMm - right.projection.distanceMm);
      const best = candidates[0];
      const second = candidates[1];
      if (
        second &&
        Math.abs(second.projection.distanceMm - best.projection.distanceMm) <= coordinateEpsilonMm
      ) {
        throw new Error(
          `Topology profile endpoint ${record.span.source.entityId}/${record.span.source.flattenedSegmentIndex}:${endpointName} has two equally close target spans.`,
        );
      }

      const from = { ...point };
      const to = { ...best.projection.projected };
      if (endpointName === "start") record.span.start = to;
      else record.span.end = to;
      repairs.push({
        kind: "endpoint-to-span-snap",
        source: record.span.source,
        sourceEndpoint: endpointName,
        target: best.targetRecord.span.source,
        from,
        to,
        distanceMm: best.projection.distanceMm,
        targetParameter: best.projection.t,
      });
    }
  }
  return repairs;
}

function topologyOnlyDieline(
  source: CanonicalDieline,
  spans: readonly MutableTopologySpan[],
  profile: StructuralTopologyProfile,
  repairs: readonly StructuralTopologyRepair[],
): CanonicalDieline {
  const byEntity = new Map<number, MutableTopologySpan[]>();
  for (const span of spans) {
    byEntity.set(span.entityIndex, [...(byEntity.get(span.entityIndex) ?? []), span]);
  }

  const entities = source.entities.map((entity, entityIndex) => {
    const topologySpans = byEntity.get(entityIndex);
    if (!topologySpans) return entity;
    const ordered = [...topologySpans].sort(
      (a, b) => a.flattenedSegmentIndex - b.flattenedSegmentIndex,
    );
    return {
      ...entity,
      path: {
        ...entity.path,
        transform: IDENTITY_AFFINE_MATRIX,
        segments: ordered.map((span) => ({
          kind: "line" as const,
          start: span.start,
          end: span.end,
        })),
      },
    } satisfies StructuralEntity;
  });

  return {
    ...source,
    entities,
    metadata: {
      ...source.metadata,
      topologyProfile: profile.id,
      topologyEndpointToSpanSnapMm: profile.endpointToSpanSnapMm,
      topologyRepairCount: repairs.length,
      topologyRepairs: repairs.map((repair) => ({
        sourceEntityId: repair.source.entityId,
        sourcePathId: repair.source.pathId,
        sourceSegment: repair.source.flattenedSegmentIndex,
        sourceEndpoint: repair.sourceEndpoint,
        targetEntityId: repair.target.entityId,
        targetPathId: repair.target.pathId,
        targetSegment: repair.target.flattenedSegmentIndex,
        distanceMm: repair.distanceMm,
      })),
    },
  };
}

/**
 * Builds topology from a reviewed source profile without changing the
 * authoritative vector dieline used by the editor/manufacturing layers.
 */
export function buildProfiledPlanarGraph(
  dieline: CanonicalDieline,
  profile: StructuralTopologyProfile,
): ProfiledPlanarGraph {
  if (!Number.isFinite(profile.endpointToSpanSnapMm) || profile.endpointToSpanSnapMm < 0) {
    throw new RangeError("endpointToSpanSnapMm must be finite and non-negative.");
  }
  if (
    profile.sourceSha256 &&
    dieline.source.sha256?.toLowerCase() !== profile.sourceSha256.toLowerCase()
  ) {
    throw new Error(`Topology profile ${profile.id} does not match the canonical source SHA-256.`);
  }

  const spans = collectTopologySpans(dieline);
  const repairs = snapDanglingEndpoints(
    spans,
    profile.endpointToSpanSnapMm,
    dieline.tolerances.coordinateEpsilonMm,
  );
  if (
    profile.expectedRepairCount !== undefined &&
    repairs.length !== profile.expectedRepairCount
  ) {
    throw new Error(
      `Topology profile ${profile.id} expected ${profile.expectedRepairCount} endpoint-to-span repairs; found ${repairs.length}.`,
    );
  }
  const derived = topologyOnlyDieline(dieline, spans, profile, repairs);
  return {
    graph: buildPlanarGraph(derived),
    repairs,
    topologyDieline: derived,
  };
}
