import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  buildPlanarGraph,
  extractStructuralPanels,
  measureFlatPanelEquivalence,
  type CanonicalDieline,
  type StructuralEntity,
  type StructuralOperation,
  type Vec2,
} from "@/lib/structure";

function entity(
  id: string,
  operation: StructuralOperation,
  points: readonly Vec2[],
  closed: boolean,
): StructuralEntity {
  const provenance = {
    sourceId: "quality-fixture",
    format: "authored" as const,
    entityId: id,
    sourceUnits: "mm" as const,
  };
  return {
    id,
    operation,
    provenance,
    classification: { method: "authored", confidence: 1 },
    path: {
      id: `${id}-path`,
      closed,
      transform: IDENTITY_AFFINE_MATRIX,
      provenance,
      segments: Array.from({ length: points.length - 1 + (closed ? 1 : 0) }, (_, index) => ({
        kind: "line" as const,
        start: points[index],
        end: points[(index + 1) % points.length],
      })),
    },
  };
}

function fixture(): CanonicalDieline {
  return {
    schemaVersion: 2,
    id: "flat-quality",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: { id: "quality-fixture", format: "authored", sourceUnits: "mm" },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities: [
      entity(
        "outer",
        "cut",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ],
        true,
      ),
      entity("crease", "crease", [{ x: 50, y: 0 }, { x: 50, y: 50 }], false),
      entity(
        "window",
        "window-cut",
        [
          { x: 10, y: 10 },
          { x: 20, y: 10 },
          { x: 20, y: 20 },
          { x: 10, y: 20 },
        ],
        true,
      ),
    ],
  };
}

test("flat panel union reproduces source outer contour and window geometry", () => {
  const dieline = fixture();
  const panels = extractStructuralPanels(dieline, buildPlanarGraph(dieline));
  const report = measureFlatPanelEquivalence(dieline, panels);
  assert.equal(report.sourceHoleCount, 1);
  assert.equal(report.derivedHoleCount, 1);
  assert.equal(report.passesHoleGeometryGate, true);
  assert.ok(report.maxHoleHausdorffMm <= 1e-9);
  assert.ok(report.holeAreaDifferenceMm2 <= 1e-9);
  assert.ok(report.holePerimeterDifferenceMm <= 1e-9);
  assert.ok(report.bidirectionalHausdorffMm <= 1e-9);
  assert.ok(report.rmsBoundaryDistanceMm <= 1e-9);
  assert.ok(report.areaDifferenceMm2 <= 1e-9);
  assert.ok(report.perimeterDifferenceMm <= 1e-9);
  assert.equal(report.passesBoundaryGate, true);
});

/**
 * Production-sized sheets sample the boundary into six-figure arrays.
 *
 * `measureFlatPanelEquivalence` used to reduce those with `Math.max(...array)`,
 * which overflows the V8 argument stack somewhere above ~110k entries. Every
 * synthetic fixture in this suite stayed far below that, so the whole golden
 * acceptance path crashed the first time it met a real 3 m perimeter dieline.
 */
test("flat equivalence survives a production-sized boundary sample count", () => {
  const widthMm = 1200;
  const heightMm = 800;
  const sheet: CanonicalDieline = {
    schemaVersion: 2,
    id: "large-perimeter-fixture",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm,
    heightMm,
    source: { id: "quality-fixture", format: "authored", sourceUnits: "mm" },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities: [
      entity(
        "outer",
        "cut",
        [
          { x: 0, y: 0 },
          { x: widthMm, y: 0 },
          { x: widthMm, y: heightMm },
          { x: 0, y: heightMm },
        ],
        true,
      ),
    ],
  };

  const spacingMm = Math.min(
    sheet.tolerances.metricSampleSpacingMm,
    Math.max(sheet.tolerances.boundaryComparisonMm / 2, 0.001),
  );
  const perimeterMm = 2 * (widthMm + heightMm);
  assert.ok(
    perimeterMm / spacingMm > 150_000,
    "the fixture must exceed the argument-spread limit to be a real regression test",
  );

  const graph = buildPlanarGraph(sheet);
  const panels = extractStructuralPanels(sheet, graph);
  const report = measureFlatPanelEquivalence(sheet, panels);

  assert.ok(Number.isFinite(report.bidirectionalHausdorffMm));
  assert.ok(report.bidirectionalHausdorffMm < sheet.tolerances.boundaryComparisonMm);
  assert.equal(report.passesBoundaryGate, true);
});
