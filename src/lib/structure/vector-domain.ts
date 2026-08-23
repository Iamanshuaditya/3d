/**
 * Canonical structural-packaging vector domain.
 *
 * All coordinates and distances in this module are millimetres. Canonical
 * sheet coordinates increase rightward on X and downward on Y. Angles use
 * x = cx + r*cos(theta), y = cy + r*sin(theta), so a positive sweep appears
 * clockwise on the sheet. Importers may retain their source units in
 * provenance, but they must normalize geometry to millimetres before
 * constructing a `CanonicalDieline`.
 */

export type Vec2 = Readonly<{
  x: number;
  y: number;
}>;

export type Bounds2D = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

/** SVG-compatible two-dimensional affine matrix. */
export type AffineMatrix = Readonly<{
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}>;

export const IDENTITY_AFFINE_MATRIX: AffineMatrix = Object.freeze({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
});

export type CoreStructuralOperation =
  | "cut"
  | "crease"
  | "perforation"
  | "score"
  | "half-cut"
  | "window-cut"
  | "bleed"
  | "safe"
  | "glue";

/** Finishing operations are typed now without making them structural edges. */
export type FinishingOperation = "varnish" | "foil" | "emboss" | "white-ink";

/**
 * Import profiles can introduce an explicitly namespaced operation without
 * weakening the known-operation union to an arbitrary string.
 */
export type StructuralOperation =
  | CoreStructuralOperation
  | FinishingOperation
  | `custom:${string}`;

export const CORE_STRUCTURAL_OPERATIONS: readonly CoreStructuralOperation[] = Object.freeze([
  "cut",
  "crease",
  "perforation",
  "score",
  "half-cut",
  "window-cut",
  "bleed",
  "safe",
  "glue",
]);

export const FINISHING_OPERATIONS: readonly FinishingOperation[] = Object.freeze([
  "varnish",
  "foil",
  "emboss",
  "white-ink",
]);

export type StructuralSourceFormat =
  | "svg"
  | "dxf"
  | "pdf"
  | "cf2"
  | "authored"
  | `custom:${string}`;

export type SourceUnit =
  | "mm"
  | "cm"
  | "m"
  | "in"
  | "pt"
  | "px"
  | "unitless"
  | `custom:${string}`;

export type SourceMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly SourceMetadataValue[]
  | { readonly [key: string]: SourceMetadataValue };

/** Traceability back to the exact source object that produced a path/entity. */
export type SourceProvenance = Readonly<{
  sourceId: string;
  format: StructuralSourceFormat;
  entityId?: string;
  layerName?: string;
  pageNumber?: number;
  objectIndex?: number;
  sourceUnits?: SourceUnit;
  /** The source transform is retained even after a normalized path transform is composed. */
  sourceTransform?: AffineMatrix;
  metadata?: Readonly<Record<string, SourceMetadataValue>>;
}>;

export type SegmentProvenance = Readonly<{
  source: SourceProvenance;
  sourceSegmentIndex?: number;
  /** Parametric source interval, useful when an importer splits intersections. */
  sourceParameterRange?: readonly [number, number];
}>;

type VectorSegmentBase = Readonly<{
  provenance?: SegmentProvenance;
}>;

export type LineSegment = VectorSegmentBase &
  Readonly<{
    kind: "line";
    start: Vec2;
    end: Vec2;
  }>;

/** Circular arc in centre parameterization. Positive sweep appears clockwise in y-down sheet space. */
export type ArcSegment = VectorSegmentBase &
  Readonly<{
    kind: "arc";
    center: Vec2;
    radius: number;
    startAngleRad: number;
    sweepAngleRad: number;
  }>;

/** Rotated elliptical arc in centre parameterization. */
export type EllipticalArcSegment = VectorSegmentBase &
  Readonly<{
    kind: "elliptical-arc";
    center: Vec2;
    radiusX: number;
    radiusY: number;
    rotationRad: number;
    startAngleRad: number;
    sweepAngleRad: number;
  }>;

export type QuadraticBezierSegment = VectorSegmentBase &
  Readonly<{
    kind: "quadratic";
    p0: Vec2;
    p1: Vec2;
    p2: Vec2;
  }>;

export type CubicBezierSegment = VectorSegmentBase &
  Readonly<{
    kind: "cubic";
    p0: Vec2;
    p1: Vec2;
    p2: Vec2;
    p3: Vec2;
  }>;

export type VectorSegment =
  | LineSegment
  | ArcSegment
  | EllipticalArcSegment
  | QuadraticBezierSegment
  | CubicBezierSegment;

export type VectorPath = Readonly<{
  id: string;
  segments: readonly VectorSegment[];
  closed: boolean;
  /**
   * Retained path transform. Consumers apply it when evaluating geometry;
   * importers do not have to destructively bake it into control points.
   */
  transform: AffineMatrix;
  provenance: SourceProvenance;
}>;

export type OperationClassification = Readonly<{
  method: "explicit" | "layer-map" | "style-map" | "authored" | "inferred";
  sourceValue?: string;
  /** 0..1; inference must never masquerade as an explicit classification. */
  confidence?: number;
}>;

export type StructuralEntity = Readonly<{
  id: string;
  operation: StructuralOperation;
  path: VectorPath;
  provenance: SourceProvenance;
  classification: OperationClassification;
}>;

export type CanonicalDielineSource = Readonly<{
  id: string;
  format: StructuralSourceFormat;
  sourceUnits: SourceUnit;
  name?: string;
  uri?: string;
  /** Lower-case SHA-256 hexadecimal digest, when source bytes are available. */
  sha256?: string;
  metadata?: Readonly<Record<string, SourceMetadataValue>>;
}>;

export type StructuralTolerances = Readonly<{
  /** Floating-point equality only; never use this for CAD endpoint repair. */
  coordinateEpsilonMm: number;
  /** Maximum automatic endpoint/topology repair distance. */
  topologySnapMm: number;
  /** Maximum curve-to-polyline chord deviation used for rendering. */
  curveFlatteningMm: number;
  /** Maximum accepted source/derived structural-boundary deviation. */
  boundaryComparisonMm: number;
  /** Maximum spacing between metric samples along flattened geometry. */
  metricSampleSpacingMm: number;
  /** Recursion safety limit; approximation quality is controlled by mm error above. */
  maxSubdivisionDepth: number;
}>;

export const DEFAULT_STRUCTURAL_TOLERANCES: StructuralTolerances = Object.freeze({
  coordinateEpsilonMm: 1e-9,
  topologySnapMm: 0.01,
  curveFlatteningMm: 0.05,
  boundaryComparisonMm: 0.05,
  metricSampleSpacingMm: 0.05,
  maxSubdivisionDepth: 32,
});

export type CanonicalDieline = Readonly<{
  schemaVersion: 2;
  id: string;
  units: "mm";
  coordinateSystem: "x-right-y-down";
  widthMm: number;
  heightMm: number;
  source: CanonicalDielineSource;
  tolerances: StructuralTolerances;
  entities: readonly StructuralEntity[];
  metadata?: Readonly<Record<string, SourceMetadataValue>>;
}>;
