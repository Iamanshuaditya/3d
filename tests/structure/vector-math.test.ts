import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CurveSubdivisionLimitError,
  IDENTITY_AFFINE_MATRIX,
  affineRotation,
  affineScale,
  affineTranslation,
  applyAffine,
  classifyPointInPolygon,
  composeAffine,
  distanceBetweenPoints,
  evaluateVectorPath,
  evaluateVectorPathByLength,
  evaluateVectorSegment,
  flattenVectorPath,
  flattenVectorSegment,
  invertAffine,
  pointInVectorPath,
  pointToPolylineDistance,
  polygonWinding,
  segmentBounds,
  signedPolygonArea,
  vectorPathBounds,
  vectorPathLength,
  type SourceProvenance,
  type VectorPath,
} from "@/lib/structure";

const provenance: SourceProvenance = {
  sourceId: "authored-test",
  format: "authored",
  sourceUnits: "mm",
};

function approximately(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function squarePath(transform = IDENTITY_AFFINE_MATRIX): VectorPath {
  return {
    id: "square",
    closed: true,
    transform,
    provenance,
    segments: [
      { kind: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { kind: "line", start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
      { kind: "line", start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
      { kind: "line", start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
    ],
  };
}

test("affine composition applies transforms in documented order and inverts exactly", () => {
  const matrix = composeAffine(affineScale(2, 3), affineRotation(Math.PI / 2), affineTranslation(10, 5));
  const transformed = applyAffine(matrix, { x: 1, y: 2 });
  approximately(transformed.x, 4);
  approximately(transformed.y, 7);
  const recovered = applyAffine(invertAffine(matrix), transformed);
  approximately(recovered.x, 1);
  approximately(recovered.y, 2);
});

test("line, quadratic, cubic, circular, and elliptical segments evaluate parametrically", () => {
  assert.deepEqual(
    evaluateVectorSegment({ kind: "line", start: { x: 0, y: 2 }, end: { x: 10, y: 4 } }, 0.5),
    { x: 5, y: 3 },
  );
  assert.deepEqual(
    evaluateVectorSegment(
      { kind: "quadratic", p0: { x: 0, y: 0 }, p1: { x: 5, y: 10 }, p2: { x: 10, y: 0 } },
      0.5,
    ),
    { x: 5, y: 5 },
  );
  assert.deepEqual(
    evaluateVectorSegment(
      {
        kind: "cubic",
        p0: { x: 0, y: 0 },
        p1: { x: 0, y: 10 },
        p2: { x: 10, y: 10 },
        p3: { x: 10, y: 0 },
      },
      0.5,
    ),
    { x: 5, y: 7.5 },
  );
  const arcEnd = evaluateVectorSegment(
    { kind: "arc", center: { x: 0, y: 0 }, radius: 10, startAngleRad: 0, sweepAngleRad: Math.PI / 2 },
    1,
  );
  approximately(arcEnd.x, 0);
  approximately(arcEnd.y, 10);
  const ellipseEnd = evaluateVectorSegment(
    {
      kind: "elliptical-arc",
      center: { x: 1, y: 2 },
      radiusX: 10,
      radiusY: 5,
      rotationRad: Math.PI / 2,
      startAngleRad: 0,
      sweepAngleRad: Math.PI / 2,
    },
    1,
  );
  approximately(ellipseEnd.x, -4);
  approximately(ellipseEnd.y, 2);
});

test("quadratic and cubic bounds include exact interior extrema", () => {
  const quadratic = segmentBounds({
    kind: "quadratic",
    p0: { x: 0, y: 0 },
    p1: { x: 5, y: 10 },
    p2: { x: 10, y: 0 },
  });
  assert.deepEqual(quadratic, { minX: 0, minY: 0, maxX: 10, maxY: 5 });

  const cubic = segmentBounds({
    kind: "cubic",
    p0: { x: 0, y: 0 },
    p1: { x: 0, y: 10 },
    p2: { x: 10, y: 10 },
    p3: { x: 10, y: 0 },
  });
  approximately(cubic.minX, 0);
  approximately(cubic.maxX, 10);
  approximately(cubic.minY, 0);
  approximately(cubic.maxY, 7.5);
});

test("arc bounds remain exact under rotation, non-uniform scale, and translation", () => {
  const bounds = segmentBounds(
    {
      kind: "elliptical-arc",
      center: { x: 0, y: 0 },
      radiusX: 10,
      radiusY: 5,
      rotationRad: Math.PI / 2,
      startAngleRad: 0,
      sweepAngleRad: Math.PI * 2,
    },
    composeAffine(affineScale(2, 3), affineTranslation(20, 30)),
  );
  approximately(bounds.minX, 10);
  approximately(bounds.maxX, 30);
  approximately(bounds.minY, 0);
  approximately(bounds.maxY, 60);
});

test("path bounds and evaluation retain a non-destructively stored transform", () => {
  const path = squarePath(composeAffine(affineScale(2), affineTranslation(5, 7)));
  assert.deepEqual(vectorPathBounds(path), { minX: 5, minY: 7, maxX: 25, maxY: 27 });
  assert.deepEqual(evaluateVectorPath(path, 0.125), { x: 15, y: 7 });
  assert.deepEqual(path.transform, composeAffine(affineScale(2), affineTranslation(5, 7)));
});

test("adaptive circular flattening responds to chord-error tolerance", () => {
  const circle = {
    kind: "arc" as const,
    center: { x: 0, y: 0 },
    radius: 100,
    startAngleRad: 0,
    sweepAngleRad: Math.PI * 2,
  };
  const loose = flattenVectorSegment(circle, 0.5);
  const precise = flattenVectorSegment(circle, 0.05);
  assert.ok(precise.length > loose.length, "smaller physical tolerance must add tessellation");

  const segmentSweep = (Math.PI * 2) / (precise.length - 1);
  for (let index = 0; index < precise.length - 1; index += 1) {
    const exactMidpoint = {
      x: 100 * Math.cos((index + 0.5) * segmentSweep),
      y: 100 * Math.sin((index + 0.5) * segmentSweep),
    };
    assert.ok(
      pointToPolylineDistance(exactMidpoint, [precise[index], precise[index + 1]]) <= 0.05,
    );
  }
});

test("adaptive Bezier flattening respects maximum chord error without a fixed segment count", () => {
  const cubic = {
    kind: "cubic" as const,
    p0: { x: 0, y: 0 },
    p1: { x: 0, y: 100 },
    p2: { x: 100, y: -100 },
    p3: { x: 100, y: 0 },
  };
  const tolerance = 0.05;
  const flattened = flattenVectorSegment(cubic, tolerance);
  for (let step = 0; step <= 1_000; step += 1) {
    const exact = evaluateVectorSegment(cubic, step / 1_000);
    assert.ok(pointToPolylineDistance(exact, flattened) <= tolerance + 1e-9);
  }
  assert.throws(
    () => flattenVectorSegment(cubic, 1e-12, IDENTITY_AFFINE_MATRIX, 1),
    CurveSubdivisionLimitError,
  );
});

test("closed path flattening removes duplicate closure while retaining full perimeter", () => {
  const circle: VectorPath = {
    id: "circle",
    closed: true,
    transform: IDENTITY_AFFINE_MATRIX,
    provenance,
    segments: [
      {
        kind: "arc",
        center: { x: 0, y: 0 },
        radius: 10,
        startAngleRad: 0,
        sweepAngleRad: Math.PI * 2,
      },
    ],
  };
  const flattened = flattenVectorPath(circle, 0.001);
  assert.notDeepEqual(flattened.points[0], flattened.points[flattened.points.length - 1]);
  approximately(vectorPathLength(circle, 0.001), Math.PI * 20, 0.01);
});

test("signed area, canonical winding, and point classification agree", () => {
  const square = flattenVectorPath(squarePath());
  assert.equal(signedPolygonArea(square.points), 100);
  assert.equal(polygonWinding(square.points), "clockwise");
  assert.equal(classifyPointInPolygon({ x: 5, y: 5 }, square.points), "inside");
  assert.equal(classifyPointInPolygon({ x: 10, y: 5 }, square.points), "boundary");
  assert.equal(classifyPointInPolygon({ x: 11, y: 5 }, square.points), "outside");
  assert.equal(pointInVectorPath({ x: 5, y: 5 }, squarePath()), true);
  assert.equal(pointInVectorPath({ x: 12, y: 5 }, squarePath()), false);
});

test("distance-based path evaluation uses physical millimetres", () => {
  const path: VectorPath = {
    id: "open-lines",
    closed: false,
    transform: IDENTITY_AFFINE_MATRIX,
    provenance,
    segments: [
      { kind: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { kind: "line", start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
    ],
  };
  assert.deepEqual(evaluateVectorPathByLength(path, 15), { x: 10, y: 5 });
  approximately(distanceBetweenPoints({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});
