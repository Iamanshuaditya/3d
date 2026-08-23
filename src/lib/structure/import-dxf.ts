import DxfParser, {
  type IArcEntity,
  type ICircleEntity,
  type IDxf,
  type IEllipseEntity,
  type IEntity,
  type ILineEntity,
  type ILayer,
  type ILwpolylineEntity,
  type IPoint,
  type IPolylineEntity,
  type ISplineEntity,
} from "dxf-parser";
import {
  IDENTITY_AFFINE_MATRIX,
  type AffineMatrix,
  type CanonicalDieline,
  type CanonicalDielineSource,
  type OperationClassification,
  type SourceMetadataValue,
  type SourceProvenance,
  type SourceUnit,
  type StructuralEntity,
  type StructuralOperation,
  type Vec2,
  type VectorPath,
  type VectorSegment,
} from "./vector-domain";
import { segmentBounds } from "./vector-math";
import {
  assertCanonicalDieline,
  createStructuralTolerances,
  isStructuralOperation,
} from "./vector-validation";

const TAU = Math.PI * 2;

export type DxfImportIssue = Readonly<{
  severity: "warning" | "error";
  code: string;
  message: string;
  entityType?: string;
  entityHandle?: string;
  layerName?: string;
}>;

export type DxfOperationMapping = Readonly<{
  /** Exact, case-insensitive DXF layer name to normalized manufacturing operation. */
  layers?: Readonly<Record<string, StructuralOperation>>;
  /** Explicit caller policy for otherwise unclassified geometric entities. */
  defaultOperation?: StructuralOperation;
}>;

export type ImportStructuralDxfOptions = Readonly<{
  id: string;
  sourceId?: string;
  sourceName?: string;
  sourceUri?: string;
  sourceSha256?: string;
  /** Required when $INSUNITS is absent, unitless, or intentionally overridden. */
  sourceUnits?: SourceUnit;
  /** Explicit scale for unitless or custom-unit drawings. Must be positive. */
  millimetresPerSourceUnit?: number;
  operationMapping?: DxfOperationMapping;
  /** Reject unclassified vector entities rather than reporting and skipping them. */
  strict?: boolean;
  /** Hidden/frozen entities are excluded by default. */
  includeInvisible?: boolean;
  topologySnapMm?: number;
  curveFlatteningMm?: number;
}>;

export type DxfImportResult = Readonly<{
  dieline: CanonicalDieline;
  issues: readonly DxfImportIssue[];
}>;

type DxfUnitDefinition = Readonly<{
  unit: SourceUnit;
  millimetres: number;
}>;

type ParsedDxfPath = Readonly<{
  segments: readonly VectorSegment[];
  closed: boolean;
}>;

type RawDxfEntityRecord = Readonly<{
  type: string;
  tags: ReadonlyMap<number, readonly string[]>;
  nestedVertexTags: readonly ReadonlyMap<number, readonly string[]>[];
}>;

type ClassifiedOperation = Readonly<{
  operation: StructuralOperation;
  classification: OperationClassification;
}>;

const DXF_INSUNITS = new Map<number, DxfUnitDefinition>([
  [1, { unit: "in", millimetres: 25.4 }],
  [2, { unit: "custom:ft", millimetres: 304.8 }],
  [3, { unit: "custom:mi", millimetres: 1_609_344 }],
  [4, { unit: "mm", millimetres: 1 }],
  [5, { unit: "cm", millimetres: 10 }],
  [6, { unit: "m", millimetres: 1000 }],
  [7, { unit: "custom:km", millimetres: 1_000_000 }],
  [8, { unit: "custom:microin", millimetres: 0.0000254 }],
  [9, { unit: "custom:mil", millimetres: 0.0254 }],
  [10, { unit: "custom:yd", millimetres: 914.4 }],
  [11, { unit: "custom:angstrom", millimetres: 1e-7 }],
  [12, { unit: "custom:nm", millimetres: 1e-6 }],
  [13, { unit: "custom:micron", millimetres: 0.001 }],
  [14, { unit: "custom:dm", millimetres: 100 }],
  [15, { unit: "custom:dam", millimetres: 10_000 }],
  [16, { unit: "custom:hm", millimetres: 100_000 }],
  [17, { unit: "custom:gm", millimetres: 1e12 }],
  [18, { unit: "custom:au", millimetres: 149_597_870_700_000 }],
  [19, { unit: "custom:light-year", millimetres: 9.4607304725808e18 }],
  [20, { unit: "custom:parsec", millimetres: 3.085677581491367e19 }],
  [21, { unit: "custom:us-survey-ft", millimetres: 1_200_000 / 3937 }],
  [22, { unit: "custom:us-survey-in", millimetres: 100_000 / 3937 }],
  [23, { unit: "custom:us-survey-yd", millimetres: 3_600_000 / 3937 }],
  [24, { unit: "custom:us-survey-mi", millimetres: 6_336_000_000 / 3937 }],
]);

const SOURCE_UNIT_MM = new Map<SourceUnit, number>([
  ["mm", 1],
  ["cm", 10],
  ["m", 1000],
  ["in", 25.4],
  ["pt", 25.4 / 72],
  ["px", 25.4 / 96],
  ["custom:ft", 304.8],
  ["custom:mi", 1_609_344],
  ["custom:km", 1_000_000],
  ["custom:microin", 0.0000254],
  ["custom:mil", 0.0254],
  ["custom:yd", 914.4],
  ["custom:angstrom", 1e-7],
  ["custom:nm", 1e-6],
  ["custom:micron", 0.001],
  ["custom:dm", 100],
  ["custom:dam", 10_000],
  ["custom:hm", 100_000],
  ["custom:gm", 1e12],
  ["custom:au", 149_597_870_700_000],
  ["custom:light-year", 9.4607304725808e18],
  ["custom:parsec", 3.085677581491367e19],
  ["custom:us-survey-ft", 1_200_000 / 3937],
  ["custom:us-survey-in", 100_000 / 3937],
  ["custom:us-survey-yd", 3_600_000 / 3937],
  ["custom:us-survey-mi", 6_336_000_000 / 3937],
]);

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function parseRawEntityRecords(sourceText: string): readonly RawDxfEntityRecord[] {
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  while (lines[lines.length - 1]?.trim() === "") lines.pop();
  if (lines.length % 2 !== 0) throw new Error("DXF contains an incomplete group-code pair");
  const groups: { code: number; value: string }[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    const code = Number(lines[index].trim());
    if (!Number.isInteger(code)) throw new Error(`DXF group code "${lines[index]}" is invalid`);
    groups.push({ code, value: lines[index + 1].trim() });
  }

  const records: {
    type: string;
    tags: Map<number, string[]>;
    nestedVertexTags: Map<number, string[]>[];
  }[] = [];
  let inEntities = false;
  let current: {
    type: string;
    tags: Map<number, string[]>;
    nestedVertexTags: Map<number, string[]>[];
  } | null = null;
  let polylineSequence = false;
  let polylineNestedRecord = false;
  let currentNestedVertexTags: Map<number, string[]> | null = null;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!inEntities && group.code === 0 && group.value.toUpperCase() === "SECTION") {
      const sectionName = groups[index + 1];
      if (sectionName?.code === 2 && sectionName.value.toUpperCase() === "ENTITIES") {
        inEntities = true;
        index += 1;
      }
      continue;
    }
    if (!inEntities) continue;
    if (group.code === 0) {
      const type = group.value.toUpperCase();
      if (type === "ENDSEC") {
        if (polylineSequence) {
          throw new Error("DXF POLYLINE sequence is missing SEQEND");
        }
        if (current) records.push(current);
        current = null;
        inEntities = false;
        polylineSequence = false;
        polylineNestedRecord = false;
        currentNestedVertexTags = null;
        continue;
      }
      if (polylineSequence) {
        if (type === "SEQEND") {
          if (current) records.push(current);
          current = null;
          polylineSequence = false;
          polylineNestedRecord = false;
          currentNestedVertexTags = null;
        } else if (type === "VERTEX") {
          polylineNestedRecord = true;
          currentNestedVertexTags = new Map();
          current?.nestedVertexTags.push(currentNestedVertexTags);
        } else {
          throw new Error(`DXF POLYLINE contains unexpected nested ${type}; expected VERTEX or SEQEND`);
        }
        // VERTEX records are owned by the preceding POLYLINE and deliberately
        // excluded from its header-level extrusion metadata.
        continue;
      }
      if (current) records.push(current);
      current = { type, tags: new Map(), nestedVertexTags: [] };
      polylineSequence = type === "POLYLINE";
      polylineNestedRecord = false;
      currentNestedVertexTags = null;
      continue;
    }
    if (!current) continue;
    if (polylineNestedRecord) {
      if (currentNestedVertexTags) {
        const values = currentNestedVertexTags.get(group.code) ?? [];
        values.push(group.value);
        currentNestedVertexTags.set(group.code, values);
      }
      continue;
    }
    const values = current.tags.get(group.code) ?? [];
    values.push(group.value);
    current.tags.set(group.code, values);
  }
  if (polylineSequence) throw new Error("DXF POLYLINE sequence is missing SEQEND");
  if (inEntities) throw new Error("DXF ENTITIES section is missing ENDSEC");
  return records;
}

function rawNumericTag(
  record: RawDxfEntityRecord,
  code: number,
  fallback: number,
): number {
  const values = record.tags.get(code) ?? [];
  if (values.length === 0) return fallback;
  if (values.length !== 1) {
    throw new Error(`${record.type} contains duplicate group ${code} extrusion metadata`);
  }
  const value = Number(values[0]);
  if (!Number.isFinite(value)) throw new Error(`${record.type} group ${code} must be finite`);
  return value;
}

function validateRawExtrusion(record: RawDxfEntityRecord): void {
  const x = rawNumericTag(record, 210, 0);
  const y = rawNumericTag(record, 220, 0);
  const z = rawNumericTag(record, 230, 1);
  validateDefaultExtrusion(x, y, z, record.type);
  for (const rawThickness of record.tags.get(39) ?? []) {
    const thickness = Number(rawThickness);
    if (!Number.isFinite(thickness) || thickness !== 0) {
      throw new Error(`${record.type} uses unsupported non-zero thickness`);
    }
  }
  if (record.type === "LWPOLYLINE" || record.type === "POLYLINE") {
    for (const rawFlags of record.tags.get(70) ?? []) {
      const flags = Number(rawFlags);
      if (!Number.isInteger(flags) || flags < 0 || (flags & ~(1 | 128)) !== 0) {
        throw new Error(`${record.type} header contains unsupported structural flags`);
      }
    }
  }
  if (record.type === "LWPOLYLINE") {
    const declaredValues = record.tags.get(90) ?? [];
    const actual = record.tags.get(10)?.length ?? 0;
    if (declaredValues.length !== 1) {
      throw new Error("LWPOLYLINE must declare exactly one vertex count");
    }
    const declared = Number(declaredValues[0]);
    if (!Number.isInteger(declared) || declared < 0 || declared !== actual) {
      throw new Error(`LWPOLYLINE declares ${declared} vertices but contains ${actual}`);
    }
  }
  if (record.type === "SPLINE") {
    for (const rawFlags of record.tags.get(70) ?? []) {
      const flags = Number(rawFlags);
      if (!Number.isInteger(flags) || flags < 0 || (flags & ~31) !== 0) {
        throw new Error("SPLINE header contains unknown flags");
      }
    }
  }
  if (record.type === "POLYLINE") {
    for (const rawElevation of record.tags.get(30) ?? []) {
      const elevation = Number(rawElevation);
      if (!Number.isFinite(elevation) || elevation !== 0) {
        throw new Error("POLYLINE uses unsupported non-zero header elevation");
      }
    }
    for (const code of [40, 41]) {
      for (const rawWidth of record.tags.get(code) ?? []) {
        const width = Number(rawWidth);
        if (!Number.isFinite(width) || width !== 0) {
          throw new Error("POLYLINE uses unsupported non-zero default width");
        }
      }
    }
    for (const vertex of record.nestedVertexTags) {
      for (const rawFlags of vertex.get(70) ?? []) {
        const flags = Number(rawFlags);
        if (!Number.isInteger(flags) || (flags & (1 | 2 | 8 | 16 | 32 | 64 | 128)) !== 0) {
          throw new Error("legacy POLYLINE VERTEX has unsupported special flags");
        }
      }
      if ((vertex.get(50)?.length ?? 0) > 0) {
        throw new Error("legacy POLYLINE VERTEX has unsupported curve-fit tangent metadata");
      }
      if ([71, 72, 73, 74].some((code) => (vertex.get(code)?.length ?? 0) > 0)) {
        throw new Error("legacy POLYLINE VERTEX has unsupported polyface indices");
      }
      for (const code of [40, 41]) {
        for (const rawWidth of vertex.get(code) ?? []) {
          const width = Number(rawWidth);
          if (!Number.isFinite(width) || width !== 0) {
            throw new Error("legacy POLYLINE VERTEX has unsupported non-zero width");
          }
        }
      }
    }
  }
  if (record.type === "SPLINE" && (record.tags.get(41)?.length ?? 0) > 0) {
    throw new Error("DXF SPLINE weights require unsupported rational-curve semantics");
  }
}

function point2(point: IPoint | undefined, label: string): Vec2 {
  if (!point) throw new Error(`${label} is missing`);
  finite(point.x, `${label}.x`);
  finite(point.y, `${label}.y`);
  const z = point.z ?? 0;
  finite(z, `${label}.z`);
  if (z !== 0) {
    throw new Error(`${label} is non-planar (z=${z})`);
  }
  return { x: point.x, y: point.y };
}

function validateDefaultExtrusion(
  x: number | undefined,
  y: number | undefined,
  z: number | undefined,
  label: string,
): void {
  const actualX = x ?? 0;
  const actualY = y ?? 0;
  const actualZ = z ?? 1;
  if (
    !Number.isFinite(actualX) ||
    !Number.isFinite(actualY) ||
    !Number.isFinite(actualZ) ||
    actualX !== 0 ||
    actualY !== 0 ||
    actualZ !== 1
  ) {
    throw new Error(`${label} uses an unsupported non-default extrusion direction`);
  }
}

function normalizedLookup<T>(record: Readonly<Record<string, T>> | undefined, key: string) {
  if (!record) return undefined;
  const normalized = key.trim().toLowerCase();
  return Object.entries(record).find(([candidate]) => candidate.trim().toLowerCase() === normalized)?.[1];
}

function classifyOperation(
  entity: IEntity,
  mapping: DxfOperationMapping | undefined,
): ClassifiedOperation | null {
  const layerName = entity.layer ?? "0";
  const layerOperation = normalizedLookup(mapping?.layers, layerName);
  if (layerOperation) {
    return {
      operation: layerOperation,
      classification: { method: "layer-map", sourceValue: layerName },
    };
  }
  if (mapping?.defaultOperation) {
    return {
      operation: mapping.defaultOperation,
      classification: { method: "authored", sourceValue: "defaultOperation" },
    };
  }
  return null;
}

function dxfPositiveSweep(
  startAngleRad: number,
  endAngleRad: number,
  label: "ARC" | "ELLIPSE",
  allowFullTurn: boolean,
): number {
  finite(startAngleRad, `${label} start angle`);
  finite(endAngleRad, `${label} end angle`);
  if (
    startAngleRad < 0 ||
    startAngleRad >= TAU ||
    endAngleRad < 0 ||
    endAngleRad > TAU
  ) {
    throw new Error(`${label} parameters must lie within one source revolution`);
  }
  const delta = endAngleRad - startAngleRad;
  if (delta === 0) {
    throw new Error(`${label} start and end parameters define a zero sweep`);
  }
  if (delta === TAU) {
    if (allowFullTurn) return TAU;
    throw new Error("ARC cannot encode a full circle; use CIRCLE");
  }
  return delta > 0 ? delta : delta + TAU;
}

function bulgeSegment(
  start: Vec2,
  end: Vec2,
  bulge: number,
  endpointToleranceSourceUnits: number,
): VectorSegment {
  finite(bulge, "polyline bulge");
  if (bulge === 0) return { kind: "line", start, end };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (chord <= Number.EPSILON) throw new Error("bulged polyline edge has zero chord length");
  const centerFactor = (1 - bulge * bulge) / (4 * bulge);
  const center = {
    x: (start.x + end.x) / 2 - dy * centerFactor,
    y: (start.y + end.y) / 2 + dx * centerFactor,
  };
  const radius = (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  if (![center.x, center.y, radius].every(Number.isFinite) || radius <= 0) {
    throw new Error("nonzero polyline bulge cannot be represented as a finite exact arc");
  }
  const startAngleRad = Math.atan2(start.y - center.y, start.x - center.x);
  const sweepAngleRad = 4 * Math.atan(bulge);
  const reconstructedStart = {
    x: center.x + radius * Math.cos(startAngleRad),
    y: center.y + radius * Math.sin(startAngleRad),
  };
  const reconstructedEnd = {
    x: center.x + radius * Math.cos(startAngleRad + sweepAngleRad),
    y: center.y + radius * Math.sin(startAngleRad + sweepAngleRad),
  };
  const endpointError = Math.max(
    Math.hypot(reconstructedStart.x - start.x, reconstructedStart.y - start.y),
    Math.hypot(reconstructedEnd.x - end.x, reconstructedEnd.y - end.y),
  );
  if (!Number.isFinite(endpointError) || endpointError > endpointToleranceSourceUnits) {
    throw new Error(
      `nonzero polyline bulge is numerically unrepresentable within the canonical endpoint tolerance (error ${endpointError})`,
    );
  }
  return {
    kind: "arc",
    center,
    radius,
    startAngleRad,
    sweepAngleRad,
  };
}

function polylineSegments(
  vertices: readonly (IPoint & { bulge?: number })[],
  closed: boolean,
  endpointToleranceSourceUnits: number,
): readonly VectorSegment[] {
  if (vertices.length < (closed ? 3 : 2)) {
    throw new Error(`polyline requires at least ${closed ? 3 : 2} vertices`);
  }
  const points = vertices.map((vertex, index) => point2(vertex, `polyline vertex ${index}`));
  const count = closed ? vertices.length : vertices.length - 1;
  const segments: VectorSegment[] = [];
  for (let index = 0; index < count; index += 1) {
    const nextIndex = (index + 1) % vertices.length;
    segments.push(
      bulgeSegment(
        points[index],
        points[nextIndex],
        vertices[index].bulge ?? 0,
        endpointToleranceSourceUnits,
      ),
    );
  }
  return segments;
}

function isSingleBezierKnotVector(knots: readonly number[], degree: number): boolean {
  const expected = 2 * (degree + 1);
  if (knots.length !== expected) return false;
  const first = knots[0];
  const last = knots[knots.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return false;
  return knots.slice(0, degree + 1).every((value) => value === first) &&
    knots.slice(degree + 1).every((value) => value === last);
}

function splinePath(entity: ISplineEntity): ParsedDxfPath {
  if (entity.rational) throw new Error("rational DXF SPLINE geometry is not yet supported exactly");
  if (entity.periodic || entity.closed) {
    throw new Error("closed or periodic DXF SPLINE geometry is not yet supported exactly");
  }
  const controls = entity.controlPoints ?? [];
  const knots = entity.knotValues ?? [];
  const fitPoints = entity.fitPoints ?? [];
  const degree = entity.degreeOfSplineCurve;
  const declaredCounts: readonly [number | undefined, number, string][] = [
    [entity.numberOfKnots, knots.length, "knots"],
    [entity.numberOfControlPoints, controls.length, "control points"],
    [entity.numberOfFitPoints, fitPoints.length, "fit points"],
  ];
  for (const [declared, actual, label] of declaredCounts) {
    if (
      declared !== undefined &&
      (!Number.isInteger(declared) || declared < 0 || declared !== actual)
    ) {
      throw new Error(`DXF SPLINE declares ${declared} ${label} but contains ${actual}`);
    }
  }
  if (![1, 2, 3].includes(degree)) {
    throw new Error(`DXF SPLINE degree ${degree} is not representable by the canonical domain`);
  }
  if (controls.length !== degree + 1 || !isSingleBezierKnotVector(knots, degree)) {
    throw new Error(
      "general B-spline knot spans are not sampled into authoritative geometry; provide an exact SVG/PDF conversion",
    );
  }
  const points = controls.map((point, index) => point2(point, `spline control point ${index}`));
  const segment: VectorSegment = degree === 1
    ? { kind: "line", start: points[0], end: points[1] }
    : degree === 2
      ? { kind: "quadratic", p0: points[0], p1: points[1], p2: points[2] }
      : { kind: "cubic", p0: points[0], p1: points[1], p2: points[2], p3: points[3] };
  return { segments: [segment], closed: false };
}

function entityPath(entity: IEntity, millimetresPerSourceUnit: number): ParsedDxfPath {
  const endpointToleranceSourceUnits = 1e-9 / millimetresPerSourceUnit;
  switch (entity.type) {
    case "LINE": {
      const line = entity as ILineEntity;
      validateDefaultExtrusion(
        line.extrusionDirection?.x,
        line.extrusionDirection?.y,
        line.extrusionDirection?.z,
        "LINE",
      );
      if (line.vertices?.length !== 2) throw new Error("LINE requires exactly two vertices");
      return {
        segments: [{
          kind: "line",
          start: point2(line.vertices[0], "LINE start"),
          end: point2(line.vertices[1], "LINE end"),
        }],
        closed: false,
      };
    }
    case "LWPOLYLINE": {
      const polyline = entity as ILwpolylineEntity;
      validateDefaultExtrusion(
        polyline.extrusionDirectionX,
        polyline.extrusionDirectionY,
        polyline.extrusionDirectionZ,
        "LWPOLYLINE",
      );
      if ((polyline.elevation ?? 0) !== 0) {
        throw new Error("LWPOLYLINE has non-zero elevation");
      }
      if (
        (polyline.width ?? 0) !== 0 ||
        polyline.vertices.some((vertex) =>
          (vertex.startWidth ?? 0) !== 0 || (vertex.endWidth ?? 0) !== 0
        )
      ) {
        throw new Error("LWPOLYLINE uses unsupported non-zero width geometry");
      }
      return {
        segments: polylineSegments(
          polyline.vertices,
          Boolean(polyline.shape),
          endpointToleranceSourceUnits,
        ),
        closed: Boolean(polyline.shape),
      };
    }
    case "POLYLINE": {
      const polyline = entity as IPolylineEntity;
      validateDefaultExtrusion(
        polyline.extrusionDirection?.x,
        polyline.extrusionDirection?.y,
        polyline.extrusionDirection?.z,
        "POLYLINE",
      );
      if (
        polyline.is3dPolyline ||
        polyline.is3dPolygonMesh ||
        polyline.isPolyfaceMesh ||
        polyline.includesCurveFitVertices ||
        polyline.includesSplineFitVertices
      ) {
        throw new Error("3D, mesh, curve-fit, and spline-fit POLYLINE entities require exact conversion");
      }
      if (polyline.vertices.some((vertex) =>
        vertex.curveFittingVertex ||
        vertex.curveFitTangent ||
        vertex.splineVertex ||
        vertex.splineControlPoint ||
        vertex.threeDPolylineVertex ||
        vertex.threeDPolylineMesh ||
        vertex.polyfaceMeshVertex ||
        vertex.faceA !== undefined ||
        vertex.faceB !== undefined ||
        vertex.faceC !== undefined ||
        vertex.faceD !== undefined
      )) {
        throw new Error(
          "legacy POLYLINE contains curve-fit, spline, 3D, mesh, or polyface VERTEX semantics",
        );
      }
      return {
        segments: polylineSegments(
          polyline.vertices,
          Boolean(polyline.shape),
          endpointToleranceSourceUnits,
        ),
        closed: Boolean(polyline.shape),
      };
    }
    case "ARC": {
      const arc = entity as IArcEntity;
      validateDefaultExtrusion(
        arc.extrusionDirectionX,
        arc.extrusionDirectionY,
        arc.extrusionDirectionZ,
        "ARC",
      );
      const radius = finite(arc.radius, "ARC radius");
      if (radius <= 0) throw new Error("ARC radius must be positive");
      return {
        segments: [{
          kind: "arc",
          center: point2(arc.center, "ARC center"),
          radius,
          startAngleRad: finite(arc.startAngle, "ARC start angle"),
          sweepAngleRad: dxfPositiveSweep(arc.startAngle, arc.endAngle, "ARC", false),
        }],
        closed: false,
      };
    }
    case "CIRCLE": {
      const circle = entity as ICircleEntity;
      const radius = finite(circle.radius, "CIRCLE radius");
      if (radius <= 0) throw new Error("CIRCLE radius must be positive");
      return {
        segments: [{
          kind: "arc",
          center: point2(circle.center, "CIRCLE center"),
          radius,
          startAngleRad: 0,
          sweepAngleRad: TAU,
        }],
        closed: true,
      };
    }
    case "ELLIPSE": {
      const ellipse = entity as IEllipseEntity;
      const center = point2(ellipse.center, "ELLIPSE center");
      const major = point2(ellipse.majorAxisEndPoint, "ELLIPSE major-axis vector");
      const radiusX = Math.hypot(major.x, major.y);
      const ratio = finite(ellipse.axisRatio, "ELLIPSE axis ratio");
      if (radiusX <= 0 || ratio <= 0 || ratio > 1) {
        throw new Error("ELLIPSE major axis must be positive and axis ratio must be in (0, 1]");
      }
      const start = ellipse.startAngle ?? 0;
      const end = ellipse.endAngle ?? TAU;
      const sweep = dxfPositiveSweep(start, end, "ELLIPSE", true);
      const full = sweep === TAU;
      return {
        segments: [{
          kind: "elliptical-arc",
          center,
          radiusX,
          radiusY: radiusX * ratio,
          rotationRad: Math.atan2(major.y, major.x),
          startAngleRad: start,
          sweepAngleRad: sweep,
        }],
        closed: full,
      };
    }
    case "SPLINE":
      return splinePath(entity as ISplineEntity);
    default:
      throw new Error(`DXF entity ${entity.type} is not supported as exact structural geometry`);
  }
}

function unitDefinition(
  dxf: IDxf,
  override: SourceUnit | undefined,
  explicitMillimetres: number | undefined,
): DxfUnitDefinition {
  if (explicitMillimetres !== undefined) {
    if (!Number.isFinite(explicitMillimetres) || explicitMillimetres <= 0) {
      throw new Error("millimetresPerSourceUnit must be finite and positive");
    }
    const raw = dxf.header?.$INSUNITS;
    const code = typeof raw === "number" ? raw : 0;
    const effectiveUnit = override ?? DXF_INSUNITS.get(code)?.unit ?? "unitless";
    const registeredScale = SOURCE_UNIT_MM.get(effectiveUnit);
    if (registeredScale !== undefined && explicitMillimetres !== registeredScale) {
      throw new Error(
        `millimetresPerSourceUnit=${explicitMillimetres} conflicts with source unit ${effectiveUnit} (${registeredScale} mm)`,
      );
    }
    return {
      unit: effectiveUnit,
      millimetres: explicitMillimetres,
    };
  }
  if (override) {
    const millimetres = SOURCE_UNIT_MM.get(override);
    if (!millimetres) {
      throw new Error(`DXF source unit ${override} has no configured millimetre conversion`);
    }
    return { unit: override, millimetres };
  }
  const raw = dxf.header?.$INSUNITS;
  const code = typeof raw === "number" ? raw : 0;
  const definition = DXF_INSUNITS.get(code);
  if (!definition) {
    throw new Error(
      `DXF $INSUNITS=${code} does not establish a supported physical scale; pass sourceUnits explicitly`,
    );
  }
  return definition;
}

function validateMapping(mapping: DxfOperationMapping | undefined): void {
  const normalizedLayers = new Map<string, StructuralOperation>();
  for (const [layer, operation] of Object.entries(mapping?.layers ?? {})) {
    if (!layer.trim()) throw new Error("DXF operation mapping contains an empty layer name");
    if (!isStructuralOperation(operation)) throw new Error(`Unsupported operation ${operation}`);
    const normalized = layer.trim().toLowerCase();
    const prior = normalizedLayers.get(normalized);
    if (prior && prior !== operation) {
      throw new Error(
        `DXF operation mapping has conflicting case-insensitive rules for layer "${layer.trim()}"`,
      );
    }
    normalizedLayers.set(normalized, operation);
  }
  if (mapping?.defaultOperation && !isStructuralOperation(mapping.defaultOperation)) {
    throw new Error(`Unsupported operation ${mapping.defaultOperation}`);
  }
}

function entityHandle(entity: IEntity, index: number): string {
  const raw = (entity as IEntity & { handle?: string | number }).handle;
  return raw === undefined ? `entity-${index + 1}` : String(raw);
}

function entityMetadata(entity: IEntity): Readonly<Record<string, SourceMetadataValue>> {
  return {
    entityType: entity.type,
    ...(entity.color === undefined ? {} : { trueColor: entity.color }),
    ...(entity.colorIndex === undefined ? {} : { colorIndex: entity.colorIndex }),
    ...(entity.lineType ? { lineType: entity.lineType } : {}),
    ...(entity.lineweight === undefined ? {} : { lineweightHundredthMm: entity.lineweight }),
    paperSpace: Boolean(entity.inPaperSpace),
  };
}

function normalizedLayerTable(dxf: IDxf): ReadonlyMap<string, ILayer> {
  const normalized = new Map<string, ILayer>();
  for (const [tableKey, layer] of Object.entries(dxf.tables?.layer?.layers ?? {})) {
    const name = (layer.name || tableKey).trim().toLowerCase();
    if (normalized.has(name)) {
      throw new Error(`DXF layer table contains conflicting case-insensitive name "${name}"`);
    }
    normalized.set(name, layer);
  }
  return normalized;
}

function visibleEntity(layers: ReadonlyMap<string, ILayer>, entity: IEntity): boolean {
  const layer = layers.get((entity.layer ?? "0").trim().toLowerCase());
  return entity.visible !== false && layer?.visible !== false && layer?.frozen !== true;
}

function combineBounds(paths: readonly VectorPath[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const segment of path.segments) {
      const bounds = segmentBounds(segment);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) {
    throw new Error("DXF structural geometry must have finite, positive two-dimensional extents");
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Imports supported planar DXF entities without sampling curves into source
 * authority. DXF's conventional x-right/y-up model space is converted to the
 * canonical x-right/y-down millimetre sheet through one retained affine path
 * transform.
 */
export function importStructuralDxf(
  sourceText: string,
  options: ImportStructuralDxfOptions,
): DxfImportResult {
  if (!options.id.trim()) throw new Error("DXF import id must not be empty");
  validateMapping(options.operationMapping);
  // Preflight legacy POLYLINE nesting before invoking dxf-parser. The bundled
  // parser can loop indefinitely on a missing SEQEND or unexpected nested
  // group-0 record, so malformed availability must fail before dependency use.
  const rawEntities = parseRawEntityRecords(sourceText);
  const dxf = new DxfParser().parseSync(sourceText);
  if (!dxf) throw new Error("DXF parser returned no document");
  if (
    rawEntities.length !== dxf.entities.length ||
    rawEntities.some((record, index) => record.type !== dxf.entities[index]?.type.toUpperCase())
  ) {
    throw new Error("DXF raw entity records do not align with parsed geometry; exact import aborted");
  }
  const unit = unitDefinition(dxf, options.sourceUnits, options.millimetresPerSourceUnit);
  const layers = normalizedLayerTable(dxf);
  const insUnits = typeof dxf.header?.$INSUNITS === "number" ? dxf.header.$INSUNITS : 0;
  const source: CanonicalDielineSource = {
    id: options.sourceId ?? options.id,
    format: "dxf",
    sourceUnits: unit.unit,
    ...(options.sourceName ? { name: options.sourceName } : {}),
    ...(options.sourceUri ? { uri: options.sourceUri } : {}),
    ...(options.sourceSha256 ? { sha256: options.sourceSha256 } : {}),
    metadata: {
      insUnitsCode: insUnits,
      millimetresPerSourceUnit: unit.millimetres,
    },
  };
  const issues: DxfImportIssue[] = [];
  const provisional: StructuralEntity[] = [];

  dxf.entities.forEach((entity, index) => {
    const handle = entityHandle(entity, index);
    const layerName = entity.layer ?? "0";
    const issueBase = { entityType: entity.type, entityHandle: handle, layerName };
    if (!options.includeInvisible && !visibleEntity(layers, entity)) {
      issues.push({
        ...issueBase,
        severity: "warning",
        code: "invisible-entity-skipped",
        message: `Skipped hidden or frozen DXF entity ${handle}`,
      });
      return;
    }
    const classification = classifyOperation(entity, options.operationMapping);
    if (!classification) {
      const issue: DxfImportIssue = {
        ...issueBase,
        severity: options.strict ? "error" : "warning",
        code: "unclassified-operation",
        message: `Skipped DXF entity ${handle} on layer "${layerName}" because no structural operation matched`,
      };
      issues.push(issue);
      return;
    }
    try {
      validateRawExtrusion(rawEntities[index]);
      if (entity.inPaperSpace) {
        throw new Error("paper-space DXF geometry cannot be treated as model-space production geometry");
      }
      const parsed = entityPath(entity, unit.millimetres);
      const provenance: SourceProvenance = {
        sourceId: source.id,
        format: "dxf",
        entityId: handle,
        layerName,
        objectIndex: index,
        sourceUnits: unit.unit,
        sourceTransform: IDENTITY_AFFINE_MATRIX,
        metadata: entityMetadata(entity),
      };
      const path: VectorPath = {
        id: `${options.id}-${handle}-path`,
        segments: parsed.segments.map((segment, sourceSegmentIndex) => ({
          ...segment,
          provenance: {
            source: provenance,
            sourceSegmentIndex,
            sourceParameterRange: [0, 1] as const,
          },
        })),
        closed: parsed.closed,
        transform: IDENTITY_AFFINE_MATRIX,
        provenance,
      };
      provisional.push({
        id: `${options.id}-${handle}`,
        operation: classification.operation,
        classification: classification.classification,
        provenance,
        path,
      });
    } catch (error) {
      issues.push({
        ...issueBase,
        severity: "error",
        code: "unsupported-or-invalid-dxf-geometry",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(`Structural DXF import failed: ${errors.map((issue) => issue.message).join("; ")}`);
  }
  if (provisional.length === 0) throw new Error("Structural DXF contains no classified vector geometry");

  const bounds = combineBounds(provisional.map((entity) => entity.path));
  const canonicalTransform: AffineMatrix = {
    a: unit.millimetres,
    b: 0,
    c: 0,
    d: -unit.millimetres,
    e: -bounds.minX * unit.millimetres,
    f: bounds.maxY * unit.millimetres,
  };
  const entities: StructuralEntity[] = provisional.map((entity) => ({
    ...entity,
    path: { ...entity.path, transform: canonicalTransform },
  }));
  const dieline: CanonicalDieline = {
    schemaVersion: 2,
    id: options.id,
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: (bounds.maxX - bounds.minX) * unit.millimetres,
    heightMm: (bounds.maxY - bounds.minY) * unit.millimetres,
    source,
    tolerances: createStructuralTolerances({
      ...(options.topologySnapMm === undefined ? {} : { topologySnapMm: options.topologySnapMm }),
      ...(options.curveFlatteningMm === undefined ? {} : { curveFlatteningMm: options.curveFlatteningMm }),
    }),
    entities,
    metadata: {
      importer: "structural-dxf-v2",
      issueCount: issues.length,
      sourceCoordinateSystem: "x-right-y-up",
      sourceBounds: bounds,
    },
  };
  assertCanonicalDieline(dieline);
  return { dieline, issues };
}
