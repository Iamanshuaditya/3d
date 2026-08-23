import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IDENTITY_AFFINE_MATRIX,
  PathTopologyMismatchError,
  assessHausdorffThreshold,
  bidirectionalHausdorffUpperBound,
  compareFlattenedPaths,
  compareVectorPaths,
  compareVectorPathsCertified,
  flattenVectorPath,
  type SourceProvenance,
  type VectorPath,
} from "@/lib/structure";

const provenance: SourceProvenance = {
  sourceId: "quality-fixture",
  format: "authored",
  sourceUnits: "mm",
};

function rectangle(id: string, x: number, y: number, width: number, height: number): VectorPath {
  return {
    id,
    closed: true,
    transform: IDENTITY_AFFINE_MATRIX,
    provenance,
    segments: [
      { kind: "line", start: { x, y }, end: { x: x + width, y } },
      { kind: "line", start: { x: x + width, y }, end: { x: x + width, y: y + height } },
      { kind: "line", start: { x: x + width, y: y + height }, end: { x, y: y + height } },
      { kind: "line", start: { x, y: y + height }, end: { x, y } },
    ],
  };
}

function approximately(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("identical vector paths have zero bidirectional geometric error", () => {
  const path = rectangle("source", 0, 0, 30, 20);
  const metrics = compareVectorPaths(path, path, {
    curveFlatteningToleranceMm: 0.001,
    sampleSpacingMm: 0.01,
  });
  approximately(metrics.sampledHausdorffLowerBoundMm, 0, 1e-12);
  assert.ok(metrics.hausdorffUpperBoundMm <= 0.005 + 1e-12);
  approximately(metrics.bidirectionalSampledRmsDistanceMm, 0, 1e-12);
  assert.equal(metrics.perimeterDifferenceMm, 0);
  assert.equal(metrics.areaDifferenceMm2, 0);
  assert.equal(metrics.signedAreaDifferenceMm2, 0);
  assert.equal(metrics.windingMismatch, false);
});

test("a 0.02 mm boundary drift is measured in physical units", () => {
  const source = rectangle("source", 0, 0, 30, 20);
  const shifted = rectangle("derived", 0, 0.02, 30, 20);
  const metrics = compareVectorPaths(source, shifted, {
    curveFlatteningToleranceMm: 0.001,
    sampleSpacingMm: 0.01,
  });
  approximately(metrics.sampledHausdorffLowerBoundMm, 0.02, 1e-9);
  assert.ok(metrics.hausdorffUpperBoundMm >= 0.02);
  assert.ok(metrics.hausdorffUpperBoundMm <= 0.025 + 1e-9);
  assert.ok(metrics.bidirectionalSampledRmsDistanceMm > 0);
  assert.ok(metrics.bidirectionalSampledRmsDistanceMm <= 0.02);
  assert.equal(metrics.perimeterDifferenceMm, 0);
  assert.equal(metrics.areaDifferenceMm2, 0);
});

test("perimeter and area metrics detect dimensional drift independently", () => {
  const source = rectangle("source", 0, 0, 30, 20);
  const wider = rectangle("derived", 0, 0, 30.1, 20);
  const metrics = compareVectorPaths(source, wider, { sampleSpacingMm: 0.01 });
  approximately(metrics.sampledHausdorffLowerBoundMm, 0.1, 1e-9);
  assert.ok(metrics.hausdorffUpperBoundMm <= 0.105 + 1e-9);
  approximately(metrics.perimeterDifferenceMm, 0.2, 1e-9);
  approximately(metrics.areaDifferenceMm2 ?? -1, 2, 1e-9);
});

test("signed area exposes reversed winding even when shape distance is zero", () => {
  const source = flattenVectorPath(rectangle("source", 0, 0, 10, 10));
  const reversed = {
    ...source,
    id: "reversed",
    points: [...source.points].reverse(),
  };
  const metrics = compareFlattenedPaths(source, reversed, 0.01);
  approximately(metrics.sampledHausdorffLowerBoundMm, 0, 1e-12);
  assert.ok(metrics.hausdorffUpperBoundMm <= 0.005 + 1e-12);
  assert.equal(metrics.areaDifferenceMm2, 0);
  assert.equal(metrics.signedAreaDifferenceMm2, 200);
  assert.equal(metrics.windingMismatch, true);
  assert.equal(assessHausdorffThreshold(metrics, 0.1), "fail");
  assert.ok(bidirectionalHausdorffUpperBound(source, reversed, 0.01) <= 0.005 + 1e-12);
});

test("quality comparison works on adaptive curves rather than sampled source authority", () => {
  const source: VectorPath = {
    id: "source-circle",
    closed: true,
    transform: IDENTITY_AFFINE_MATRIX,
    provenance,
    segments: [
      {
        kind: "arc",
        center: { x: 0, y: 0 },
        radius: 25,
        startAngleRad: 0,
        sweepAngleRad: Math.PI * 2,
      },
    ],
  };
  const derived: VectorPath = {
    ...source,
    id: "derived-circle",
    segments: [
      {
        kind: "elliptical-arc",
        center: { x: 0, y: 0 },
        radiusX: 25.03,
        radiusY: 25,
        rotationRad: 0,
        startAngleRad: 0,
        sweepAngleRad: Math.PI * 2,
      },
    ],
  };
  const metrics = compareVectorPaths(source, derived, {
    curveFlatteningToleranceMm: 0.001,
    sampleSpacingMm: 0.005,
  });
  assert.ok(metrics.sampledHausdorffLowerBoundMm >= 0.027);
  assert.ok(metrics.hausdorffUpperBoundMm >= 0.03);
  assert.ok(metrics.hausdorffUpperBoundMm <= 0.035);
});

test("Hausdorff certificate catches an unsampled triangular deviation", () => {
  const height = (Math.sqrt(3) * 0.049) / 2;
  const a = { x: 0, y: 0 };
  const b = { x: 0.049, y: 0 };
  const c = { x: 0.0245, y: height };
  const metrics = compareFlattenedPaths(
    { id: "a-b-c", points: [a, b, c], closed: false },
    { id: "a-c-b", points: [a, c, b], closed: false },
    0.05,
  );

  assert.equal(metrics.sampledHausdorffLowerBoundMm, 0);
  assert.ok(metrics.hausdorffUpperBoundMm >= 0.021217622);
  assert.ok(metrics.hausdorffUpperBoundMm <= 0.0245 + 1e-12);
  assert.equal(assessHausdorffThreshold(metrics, 0.01), "indeterminate");
  assert.equal(assessHausdorffThreshold(metrics, 0.03), "pass");
});

test("open and closed paths are topologically incomparable even with identical points", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  assert.throws(
    () => compareFlattenedPaths(
      { id: "closed", points, closed: true },
      { id: "open", points: [...points, points[0]], closed: false },
      0.01,
    ),
    PathTopologyMismatchError,
  );
});

test("certified vector comparison honors its requested uncertainty budget", () => {
  const source = rectangle("source", 0, 0, 30, 20);
  const shifted = rectangle("derived", 0, 0.02, 30, 20);
  const metrics = compareVectorPathsCertified(source, shifted, 0.001);
  assert.ok(metrics.hausdorffUncertaintyMm <= 0.001 + 1e-12);
  assert.equal(assessHausdorffThreshold(metrics, 0.021), "pass");
  assert.equal(assessHausdorffThreshold(metrics, 0.019), "fail");
});
