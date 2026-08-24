import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  evaluateGoldenStructuralAcceptance,
  extractCreaseChains,
  buildPlanarGraph,
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
    sourceId: "acceptance-fixture",
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
    id: "acceptance-fixture",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: {
      id: "acceptance-fixture",
      format: "authored",
      sourceUnits: "mm",
      sha256: "fixture-sha",
    },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities: [
      entity("outer", "cut", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }], true),
      entity("window", "cut", [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }], true),
      entity("crease-a", "crease", [{ x: 50, y: 0 }, { x: 50, y: 25 }], false),
      entity("crease-b", "crease", [{ x: 50, y: 25 }, { x: 50, y: 50 }], false),
    ],
  };
}

test("collinear source crease spans resolve into one physical crease chain", () => {
  const chains = extractCreaseChains(buildPlanarGraph(fixture()));
  assert.equal(chains.length, 1);
  assert.equal(chains[0].edgeIds.length, 2);
  assert.ok(Math.abs(chains[0].lengthMm - 50) < 1e-9);
});

test("acceptance report only passes when source, topology, window, flat geometry, and UVs agree", () => {
  const report = evaluateGoldenStructuralAcceptance(fixture(), {
    sourceSha256: "fixture-sha",
    outerEnvelopeMm: { width: 100, height: 50, tolerance: 1e-9 },
    outerEdgeCount: 4,
    windowEdgeCount: 4,
    creaseSourceSegmentCount: 2,
    creaseChainCount: 1,
    windowAreaMm2: { value: 100, tolerance: 1e-9 },
    windowPerimeterMm: { value: 40, tolerance: 1e-9 },
    maxUvRoundTripMm: 0.0001,
  });
  assert.equal(report.passed, true);
  assert.equal(report.windowOwnerCount, 1);
  assert.equal(report.flat.passesBoundaryGate, true);
  assert.equal(report.flat.passesHoleGeometryGate, true);
  assert.ok(report.maxUvRoundTripMm <= 0.0001);
  assert.ok(Object.values(report.gates).every(Boolean));
});

test("wrong source provenance fails acceptance even when geometry happens to match", () => {
  const report = evaluateGoldenStructuralAcceptance(fixture(), {
    sourceSha256: "different-source",
    outerEnvelopeMm: { width: 100, height: 50, tolerance: 1e-9 },
    outerEdgeCount: 4,
    windowEdgeCount: 4,
    creaseSourceSegmentCount: 2,
    creaseChainCount: 1,
    windowAreaMm2: { value: 100, tolerance: 1e-9 },
    windowPerimeterMm: { value: 40, tolerance: 1e-9 },
    maxUvRoundTripMm: 0.0001,
  });
  assert.equal(report.gates.sourceSha256, false);
  assert.equal(report.passed, false);
});
