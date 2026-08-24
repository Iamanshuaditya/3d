import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  buildPlanarGraph,
  extractStructuralPanels,
  resolveStructuralRig,
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
    sourceId: "structural-rig-fixture",
    format: "authored" as const,
    entityId: id,
    sourceUnits: "mm" as const,
  };
  const segments = Array.from({ length: points.length - 1 + (closed ? 1 : 0) }, (_, index) => ({
    kind: "line" as const,
    start: points[index],
    end: points[(index + 1) % points.length],
  }));
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
      segments,
    },
  };
}

const SOURCE_SHA = "a".repeat(64);

function fixture(): CanonicalDieline {
  return {
    schemaVersion: 2,
    id: "rig-two-panel",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: {
      id: "structural-rig-fixture",
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

function authoredSpec(
  rootPanelId: string,
  childPanelId: string,
  overrides: Partial<StructuralConstructionSpec> = {},
): StructuralConstructionSpec {
  return {
    schemaVersion: 1,
    sourceLock: {
      canonicalSchemaVersion: 2,
      dielineId: "rig-two-panel",
      sha256: SOURCE_SHA,
    },
    rootPanelId,
    boardThicknessMm: 0.5,
    hinges: [
      {
        id: "body-fold",
        parentPanelId: rootPanelId,
        childPanelId,
        source: [{ entityId: "center-crease", pathId: "center-crease-path" }],
        assembledAngleDeg: 90,
        isPrimary: true,
        motion: { delayMs: 75, durationMs: 600, easing: "easeInOutCubic" },
      },
    ],
    ...overrides,
  };
}

function setup() {
  const dieline = fixture();
  const graph = buildPlanarGraph(dieline);
  const panels = [...extractStructuralPanels(dieline, graph)].sort(
    (left, right) => left.bounds.minX - right.bounds.minX,
  );
  assert.equal(panels.length, 2);
  return { dieline, graph, panels };
}

test("structural rig resolves one exact source crease into a hash-locked panel hierarchy", () => {
  const { dieline, graph, panels } = setup();
  const rig = resolveStructuralRig(
    dieline,
    graph,
    panels,
    authoredSpec(panels[0].id, panels[1].id),
  );

  assert.equal(rig.rootPanelId, panels[0].id);
  assert.equal(rig.hinges.length, 1);
  const hinge = rig.hinges[0];
  assert.equal(hinge.id, "body-fold");
  assert.equal(hinge.parentHingeId, null);
  assert.equal(hinge.depth, 1);
  assert.equal(hinge.flatAngleDeg, 0);
  assert.equal(hinge.assembledAngleDeg, 90);
  assert.equal(hinge.lengthMm, 50);
  assert.deepEqual(hinge.start, { x: 50, y: 0 });
  assert.deepEqual(hinge.end, { x: 50, y: 50 });
  assert.deepEqual(hinge.motion, { delayMs: 75, durationMs: 600, easing: "easeInOutCubic" });
  assert.equal(rig.articulatedHinges[0].parentId, null);
  assert.equal(rig.articulatedHinges[0].flatAngleDeg, 0);
});

test("structural rig rejects stale construction metadata after source bytes change", () => {
  const { dieline, graph, panels } = setup();
  const stale = authoredSpec(panels[0].id, panels[1].id, {
    sourceLock: {
      canonicalSchemaVersion: 2,
      dielineId: dieline.id,
      sha256: "b".repeat(64),
    },
  });
  assert.throws(
    () => resolveStructuralRig(dieline, graph, panels, stale),
    /source SHA-256 does not match/,
  );
});

test("structural rig rejects a hinge source that is not shared by the declared panel pair", () => {
  const { dieline, graph, panels } = setup();
  const invalid = authoredSpec(panels[0].id, panels[1].id, {
    hinges: [
      {
        id: "bad-source",
        parentPanelId: panels[0].id,
        childPanelId: panels[1].id,
        source: [{ entityId: "outer-cut", pathId: "outer-cut-path" }],
        assembledAngleDeg: 90,
      },
    ],
  });
  assert.throws(
    () => resolveStructuralRig(dieline, graph, panels, invalid),
    /does not resolve to a fold edge/,
  );
});

test("structural rig requires every non-root panel to have exactly one incoming hinge", () => {
  const { dieline, graph, panels } = setup();
  const invalid: StructuralConstructionSpec = {
    ...authoredSpec(panels[0].id, panels[1].id),
    hinges: [],
  };
  assert.throws(
    () => resolveStructuralRig(dieline, graph, panels, invalid),
    /requires 1 hinges; found 0/,
  );
});
