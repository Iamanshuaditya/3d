import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  type CanonicalDieline,
  type StructuralEntity,
  type StructuralOperation,
  type Vec2,
} from "./vector-domain";

/**
 * Parametric straight-tuck-end carton dielines.
 *
 * The golden reference proves the structural engine reproduces one licensed
 * lock-bottom carton exactly. It cannot prove the engine generalises: every
 * gate it exercises is source-locked to that file's checksum, panel count and
 * crease inventory.
 *
 * A straight-tuck carton is a materially different construction — no diagonal
 * lock, a different panel count, and flaps separated by real gaps so the fold
 * line at each flap band alternates between cut and crease along a single
 * collinear run. That last property is the interesting one: it forces the
 * topology stage to split a straight line into differently-classified spans
 * rather than treating the whole run as one edge.
 *
 * Everything here is authored from parameters, so the fixtures are fully
 * redistributable. No licensed geometry is involved.
 */

export type StraightTuckCartonParams = Readonly<{
  id: string;
  /** Front/back panel width, mm. */
  widthMm: number;
  /** Side panel depth, mm. */
  depthMm: number;
  /** Body height, mm. */
  heightMm: number;
  /** Top and bottom flap depth, mm. */
  flapMm: number;
  /** Glue-seam tab width, mm. */
  glueMm: number;
  /** Relief gap cut between neighbouring flaps, mm. */
  flapGapMm: number;
  /**
   * Lower-case SHA-256 of the authored parameter set.
   *
   * The rig is source-locked, so a dieline without a digest cannot compile a
   * construction. This is supplied rather than computed here so the module
   * stays synchronous and free of `node:crypto`, which would not survive the
   * browser bundle. Callers hash `canonicalParameterJson` for a stable value.
   */
  sourceSha256: string;
}>;

export type StraightTuckCartonLayout = Readonly<{
  dieline: CanonicalDieline;
  /** Stable, sorted parameter encoding. Hash this to obtain `sourceSha256`. */
  canonicalParameterJson: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** Expected results, derived from the parameters rather than measured back. */
  expected: Readonly<{
    panelCount: number;
    hingeCount: number;
    bodyPanelCount: number;
    flapPanelCount: number;
    assembledWidthMm: number;
    assembledDepthMm: number;
    assembledHeightMm: number;
  }>;
}>;

const SOURCE_FORMAT = "authored" as const;

function provenance(id: string, sourceId: string) {
  return { sourceId, format: SOURCE_FORMAT, entityId: id, sourceUnits: "mm" as const };
}

/** Builds one polyline entity. Closed paths repeat no vertex. */
function polyline(
  id: string,
  sourceId: string,
  operation: StructuralOperation,
  points: readonly Vec2[],
  closed: boolean,
): StructuralEntity {
  const prov = provenance(id, sourceId);
  const segmentCount = closed ? points.length : points.length - 1;
  return {
    id,
    operation,
    provenance: prov,
    classification: { method: "authored", confidence: 1 },
    path: {
      id: `${id}-path`,
      closed,
      transform: IDENTITY_AFFINE_MATRIX,
      provenance: prov,
      segments: Array.from({ length: segmentCount }, (_, index) => ({
        kind: "line" as const,
        start: points[index],
        end: points[(index + 1) % points.length],
      })),
    },
  };
}

export function createStraightTuckCartonDieline(
  params: StraightTuckCartonParams,
): StraightTuckCartonLayout {
  const { id, widthMm: w, depthMm: d, heightMm: h, flapMm: f, glueMm: g, flapGapMm: gap } = params;
  if (!/^[a-f0-9]{64}$/i.test(params.sourceSha256)) {
    throw new Error("Straight-tuck carton sourceSha256 must be a 64-character hexadecimal digest.");
  }

  for (const [label, value] of Object.entries({ w, d, h, f, g, gap })) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Straight-tuck carton ${label} must be finite and positive.`);
    }
  }
  if (gap * 2 >= Math.min(w, d)) {
    throw new RangeError("Flap relief gaps would consume the whole flap width.");
  }

  // Sorted keys so the encoding — and therefore the digest — is stable.
  const canonicalParameterJson = JSON.stringify({
    construction: "straight-tuck-end",
    depthMm: d, flapGapMm: gap, flapMm: f, glueMm: g, heightMm: h, id, widthMm: w,
  });

  const sheetWidthMm = g + 2 * w + 2 * d;
  const sheetHeightMm = 2 * f + h;
  const bodyTop = f;
  const bodyBottom = f + h;

  // Body panels left to right. The glue tab carries no flaps.
  const spans: readonly (readonly [number, number])[] = [
    [0, g],
    [g, g + w],
    [g + w, g + w + d],
    [g + w + d, g + 2 * w + d],
    [g + 2 * w + d, sheetWidthMm],
  ];
  const flapped = spans.slice(1);

  // ---- outer cut: one closed castellated loop --------------------------------
  const outline: Vec2[] = [{ x: 0, y: bodyTop }];
  for (const [a, b] of flapped) {
    outline.push({ x: a + gap, y: bodyTop });
    outline.push({ x: a + gap, y: 0 });
    outline.push({ x: b - gap, y: 0 });
    outline.push({ x: b - gap, y: bodyTop });
  }
  outline.push({ x: sheetWidthMm, y: bodyTop });
  outline.push({ x: sheetWidthMm, y: bodyBottom });
  for (const [a, b] of [...flapped].reverse()) {
    outline.push({ x: b - gap, y: bodyBottom });
    outline.push({ x: b - gap, y: sheetHeightMm });
    outline.push({ x: a + gap, y: sheetHeightMm });
    outline.push({ x: a + gap, y: bodyBottom });
  }
  outline.push({ x: 0, y: bodyBottom });

  const entities: StructuralEntity[] = [
    polyline("outer-cut", id, "cut", outline, true),
  ];

  // ---- vertical body creases -------------------------------------------------
  for (const [index, [a]] of spans.entries()) {
    if (index === 0) continue;
    entities.push(
      polyline(`body-crease-${index}`, id, "crease", [
        { x: a, y: bodyTop },
        { x: a, y: bodyBottom },
      ], false),
    );
  }

  // ---- flap creases: only where a flap actually meets its panel --------------
  for (const [index, [a, b]] of flapped.entries()) {
    entities.push(
      polyline(`top-crease-${index}`, id, "crease", [
        { x: a + gap, y: bodyTop },
        { x: b - gap, y: bodyTop },
      ], false),
    );
    entities.push(
      polyline(`bottom-crease-${index}`, id, "crease", [
        { x: a + gap, y: bodyBottom },
        { x: b - gap, y: bodyBottom },
      ], false),
    );
  }

  const dieline: CanonicalDieline = {
    schemaVersion: 2,
    id,
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: sheetWidthMm,
    heightMm: sheetHeightMm,
    source: { id, format: SOURCE_FORMAT, sourceUnits: "mm", sha256: params.sourceSha256.toLowerCase() },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities,
    metadata: {
      construction: "straight-tuck-end",
      nominalDimensions: `${w} x ${d} x ${h} mm`,
    },
  };

  return {
    dieline,
    canonicalParameterJson,
    sheetWidthMm,
    sheetHeightMm,
    expected: {
      panelCount: spans.length + flapped.length * 2,
      hingeCount: spans.length + flapped.length * 2 - 1,
      bodyPanelCount: spans.length,
      flapPanelCount: flapped.length * 2,
      assembledWidthMm: w,
      assembledDepthMm: d,
      assembledHeightMm: h,
    },
  };
}
