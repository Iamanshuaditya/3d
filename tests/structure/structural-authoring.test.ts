import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  buildPlanarGraph,
  extractStructuralPanels,
  inspectStructuralConstruction,
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
    sourceId: "construction-authoring-fixture",
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
    id: "construction-authoring-fixture",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: {
      id: "construction-authoring-fixture",
      format: "authored",
      sourceUnits: "mm",
      sha256: "f".repeat(64),
    },
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
      entity("center", "crease", [{ x: 50, y: 0 }, { x: 50, y: 50 }], false),
    ],
  };
}

test("construction inventory derives the exact shared crease but no fold semantics", () => {
  const dieline = fixture();
  const graph = buildPlanarGraph(dieline);
  const panels = extractStructuralPanels(dieline, graph);
  const inventory = inspectStructuralConstruction(dieline, graph, panels);

  assert.equal(inventory.panelCount, 2);
  assert.equal(inventory.hingeCandidateCount, 1);
  assert.equal(inventory.formsTree, true);
  assert.deepEqual(inventory.unresolvedCreases, []);
  const candidate = inventory.hingeCandidates[0];
  assert.equal(candidate.source.length, 1);
  assert.equal(candidate.source[0].entityId, "center");
  assert.equal(candidate.source[0].pathId, "center-path");
  assert.deepEqual(candidate.source[0].flattenedSegmentIndexes, [0]);
  assert.ok(Math.abs(candidate.lengthMm - 50) < 1e-9);
  assert.deepEqual(candidate.start, { x: 50, y: 0 });
  assert.deepEqual(candidate.end, { x: 50, y: 50 });
  assert.equal("assembledAngleDeg" in candidate, false);
  assert.equal("foldDirection" in candidate, false);
});
