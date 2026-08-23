import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IDENTITY_AFFINE_MATRIX,
  bidirectionalHausdorffDistance,
  compareFlattenedPaths,
  compareVectorPaths,
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
    sampleSpacingMm: 0.25,
  });
  approximately(metrics.hausdorffDistanceMm, 0, 1e-12);
  assert.equal(metrics.bidirectionalRmsDistanceMm, 0);
  assert.equal(metrics.perimeterDifferenceMm, 0);
  assert.equal(metrics.areaDifferenceMm2, 0);
  assert.equal(metrics.signedAreaDifferenceMm2, 0);
});

test("a 0.02 mm boundary drift is measured in physical units", () => {
  const source = rectangle("source", 0, 0, 30, 20);
  const shifted = rectangle("derived", 0, 0.02, 30, 20);
  const metrics = compareVectorPaths(source, shifted, {
    curveFlatteningToleranceMm: 0.001,
    sampleSpacingMm: 0.1,
  });
  approximately(metrics.hausdorffDistanceMm, 0.02, 1e-9);
  assert.ok(metrics.bidirectionalRmsDistanceMm > 0);
  assert.ok(metrics.bidirectionalRmsDistanceMm <= 0.02);
  assert.equal(metrics.perimeterDifferenceMm, 0);
  assert.equal(metrics.areaDifferenceMm2, 0);
});

test("perimeter and area metrics detect dimensional drift independently", () => {
  const source = rectangle("source", 0, 0, 30, 20);
  const wider = rectangle("derived", 0, 0, 30.1, 20);
  const metrics = compareVectorPaths(source, wider, { sampleSpacingMm: 0.1 });
  approximately(metrics.hausdorffDistanceMm, 0.1, 1e-9);
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
  const metrics = compareFlattenedPaths(source, reversed, 0.25);
  approximately(metrics.hausdorffDistanceMm, 0, 1e-12);
  assert.equal(metrics.areaDifferenceMm2, 0);
  assert.equal(metrics.signedAreaDifferenceMm2, 200);
  approximately(bidirectionalHausdorffDistance(source, reversed), 0, 1e-12);
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
    sampleSpacingMm: 0.05,
  });
  assert.ok(metrics.hausdorffDistanceMm >= 0.029);
  assert.ok(metrics.hausdorffDistanceMm <= 0.031);
});
