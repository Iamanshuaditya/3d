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

test("flat panel union reproduces the source outer contour and hole count", () => {
  const dieline = fixture();
  const panels = extractStructuralPanels(dieline, buildPlanarGraph(dieline));
  const report = measureFlatPanelEquivalence(dieline, panels);
  assert.equal(report.sourceHoleCount, 1);
  assert.equal(report.derivedHoleCount, 1);
  assert.equal(report.passesHoleCountGate, true);
  assert.ok(report.bidirectionalHausdorffMm <= 1e-9);
  assert.ok(report.rmsBoundaryDistanceMm <= 1e-9);
  assert.ok(report.areaDifferenceMm2 <= 1e-9);
  assert.ok(report.perimeterDifferenceMm <= 1e-9);
  assert.equal(report.passesBoundaryGate, true);
});
