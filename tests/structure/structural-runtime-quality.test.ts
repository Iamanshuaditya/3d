import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  buildPlanarGraph,
  certifyStructuralFoldRuntime,
  extractStructuralPanels,
  resolveStructuralRig,
  type CanonicalDieline,
  type StructuralConstructionSpec,
  type StructuralEntity,
} from "@/lib/structure";

const SHA = "d".repeat(64);

function entity(
  id: string,
  operation: "cut" | "crease",
  points: readonly { x: number; y: number }[],
  closed: boolean,
): StructuralEntity {
  const provenance = {
    sourceId: "runtime-quality-fixture",
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

function setup() {
  const dieline: CanonicalDieline = {
    schemaVersion: 2,
    id: "runtime-quality-three-panel",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 150,
    heightMm: 50,
    source: {
      id: "runtime-quality-fixture",
      format: "authored",
      sourceUnits: "mm",
      sha256: SHA,
    },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities: [
      entity(
        "outer",
        "cut",
        [
          { x: 0, y: 0 },
          { x: 150, y: 0 },
          { x: 150, y: 50 },
          { x: 0, y: 50 },
        ],
        true,
      ),
      entity("crease-a", "crease", [{ x: 50, y: 0 }, { x: 50, y: 50 }], false),
      entity("crease-b", "crease", [{ x: 100, y: 0 }, { x: 100, y: 50 }], false),
    ],
  };
  const graph = buildPlanarGraph(dieline);
  const panels = [...extractStructuralPanels(dieline, graph)].sort(
    (left, right) => left.bounds.minX - right.bounds.minX,
  );
  assert.equal(panels.length, 3);
  const construction: StructuralConstructionSpec = {
    schemaVersion: 1,
    sourceLock: {
      canonicalSchemaVersion: 2,
      dielineId: dieline.id,
      sha256: SHA,
    },
    rootPanelId: panels[1].id,
    boardThicknessMm: 0.5,
    hinges: [
      {
        id: "left-fold",
        parentPanelId: panels[1].id,
        childPanelId: panels[0].id,
        source: [{ entityId: "crease-a", pathId: "crease-a-path" }],
        assembledAngleDeg: 90,
      },
      {
        id: "right-fold",
        parentPanelId: panels[1].id,
        childPanelId: panels[2].id,
        source: [{ entityId: "crease-b", pathId: "crease-b-path" }],
        assembledAngleDeg: -90,
      },
    ],
  };
  return { dieline, panels, rig: resolveStructuralRig(dieline, graph, panels, construction) };
}

test("structural runtime certificate proves 100 absolute fold cycles reuse geometry and return exactly flat", () => {
  const state = setup();
  const report = certifyStructuralFoldRuntime(state.dieline, state.panels, state.rig, 100);
  assert.equal(report.passed, true);
  assert.equal(report.cycleCount, 100);
  assert.equal(report.panelCount, 3);
  assert.equal(report.hingeCount, 2);
  assert.equal(report.geometryIdentityStable, true);
  assert.equal(report.maxFlatHingeMatrixError, 0);
  assert.ok(report.maxFlatWorldMatrixDrift <= 1e-13);
  assert.equal(report.allMatricesFinite, true);
});

test("structural runtime certificate refuses a weakened torture-cycle count", () => {
  const state = setup();
  assert.throws(
    () => certifyStructuralFoldRuntime(state.dieline, state.panels, state.rig, 99),
    /requires at least 100 integer cycles/,
  );
});
