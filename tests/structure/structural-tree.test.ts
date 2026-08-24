import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  STRUCTURAL_MM_TO_UNITS,
  applyStructuralHingeAngles,
  buildPlanarGraph,
  createStructuralTree,
  extractStructuralPanels,
  resolveStructuralRig,
  structuralFlatPose,
  type CanonicalDieline,
  type StructuralConstructionSpec,
  type StructuralEntity,
  type StructuralOperation,
  type Vec2,
} from "@/lib/structure";

function linePathEntity(
  id: string,
  operation: StructuralOperation,
  points: readonly Vec2[],
  closed: boolean,
): StructuralEntity {
  const provenance = {
    sourceId: "structural-tree-fixture",
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

const SOURCE_SHA = "c".repeat(64);

function fixture(): CanonicalDieline {
  return {
    schemaVersion: 2,
    id: "structural-tree-two-panel",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: {
      id: "structural-tree-fixture",
      format: "authored",
      sourceUnits: "mm",
      sha256: SOURCE_SHA,
    },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities: [
      linePathEntity(
        "outer-cut",
        "cut",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ],
        true,
      ),
      linePathEntity("center-crease", "crease", [{ x: 50, y: 0 }, { x: 50, y: 50 }], false),
    ],
  };
}

function setup() {
  const dieline = fixture();
  const graph = buildPlanarGraph(dieline);
  const panels = [...extractStructuralPanels(dieline, graph)].sort(
    (left, right) => left.bounds.minX - right.bounds.minX,
  );
  assert.equal(panels.length, 2);
  const spec: StructuralConstructionSpec = {
    schemaVersion: 1,
    sourceLock: {
      canonicalSchemaVersion: 2,
      dielineId: dieline.id,
      sha256: SOURCE_SHA,
    },
    rootPanelId: panels[0].id,
    boardThicknessMm: 0.5,
    hinges: [
      {
        id: "center-fold",
        parentPanelId: panels[0].id,
        childPanelId: panels[1].id,
        source: [{ entityId: "center-crease", pathId: "center-crease-path" }],
        assembledAngleDeg: 90,
        isPrimary: true,
      },
    ],
  };
  const rig = resolveStructuralRig(dieline, graph, panels, spec);
  const materials = [
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial(),
  ] as const;
  const tree = createStructuralTree(dieline, panels, rig, materials);
  return { dieline, panels, rig, tree, materials };
}

function dispose(setupResult: ReturnType<typeof setup>) {
  setupResult.tree.dispose();
  setupResult.materials.forEach((material) => material.dispose());
}

test("zero-degree structural pose restores exact canonical sheet placement", () => {
  const state = setup();
  try {
    applyStructuralHingeAngles(state.tree, structuralFlatPose(state.rig));
    const child = state.tree.meshes[state.panels[1].id];
    const world = new THREE.Vector3(100, 0, 25).applyMatrix4(child.matrixWorld);
    assert.ok(Math.abs(world.x - 50 * STRUCTURAL_MM_TO_UNITS) < 1e-12);
    assert.ok(Math.abs(world.y) < 1e-12);
    assert.ok(Math.abs(world.z) < 1e-12);
    assert.deepEqual(state.tree.hinges[0].group.matrix.elements, new THREE.Matrix4().identity().elements);
  } finally {
    dispose(state);
  }
});

test("assembled pose rotates the exact child panel around the source crease axis", () => {
  const state = setup();
  try {
    const child = state.tree.meshes[state.panels[1].id];
    const folded = new THREE.Vector3(100, 0, 25).applyMatrix4(child.matrixWorld);
    assert.ok(Math.abs(folded.x) < 1e-12);
    assert.ok(Math.abs(folded.y - 50 * STRUCTURAL_MM_TO_UNITS) < 1e-12);
    assert.ok(Math.abs(folded.z) < 1e-12);
  } finally {
    dispose(state);
  }
});

test("fold/unfold cycles reuse geometry and settle to identity without transform drift", () => {
  const state = setup();
  try {
    const child = state.tree.meshes[state.panels[1].id];
    const geometryUuid = child.geometry.uuid;
    for (let cycle = 0; cycle < 100; cycle += 1) {
      applyStructuralHingeAngles(state.tree, { "center-fold": 90 });
      applyStructuralHingeAngles(state.tree, { "center-fold": 0 });
    }
    assert.equal(child.geometry.uuid, geometryUuid);
    const identity = new THREE.Matrix4().identity().elements;
    state.tree.hinges[0].group.matrix.elements.forEach((value, index) => {
      assert.ok(Math.abs(value - identity[index]) < 1e-15);
    });
    const world = new THREE.Vector3(100, 0, 25).applyMatrix4(child.matrixWorld);
    assert.ok(Math.abs(world.y) < 1e-12);
  } finally {
    dispose(state);
  }
});
