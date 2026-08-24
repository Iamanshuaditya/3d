import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  buildPlanarGraph,
  extractCutCycles,
  extractStructuralPanels,
  type CanonicalDieline,
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
    sourceId: "topology-fixture",
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

function fixture(): CanonicalDieline {
  return {
    schemaVersion: 2,
    id: "two-panel-window",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: { id: "topology-fixture", format: "authored", sourceUnits: "mm" },
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
      linePathEntity(
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

function segmentedFixture(): CanonicalDieline {
  const outer = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ];
  const window = [
    { x: 10, y: 10 },
    { x: 20, y: 10 },
    { x: 20, y: 20 },
    { x: 10, y: 20 },
  ];
  const segments = (prefix: string, points: readonly Vec2[]) =>
    points.map((point, index) =>
      linePathEntity(
        `${prefix}-${index}`,
        "cut",
        [point, points[(index + 1) % points.length]],
        false,
      ),
    );
  return {
    ...fixture(),
    id: "segmented-source",
    entities: [
      ...segments("outer", outer),
      ...segments("window", window),
      linePathEntity("center-crease", "crease", [{ x: 50, y: 0 }, { x: 50, y: 50 }], false),
    ],
  };
}

test("planar graph splits source cut edges at crease intersections", () => {
  const graph = buildPlanarGraph(fixture());
  const creaseEdges = graph.edges.filter((edge) => edge.operation === "crease");
  assert.equal(creaseEdges.length, 1);
  const cutVerticesAtCrease = graph.vertices.filter(
    (vertex) =>
      Math.abs(vertex.point.x - 50) < 1e-9 &&
      (Math.abs(vertex.point.y) < 1e-9 || Math.abs(vertex.point.y - 50) < 1e-9),
  );
  assert.equal(cutVerticesAtCrease.length, 2);
});

test("panel extraction yields two real panels and owns the window as a hole", () => {
  const dieline = fixture();
  const graph = buildPlanarGraph(dieline);
  const panels = extractStructuralPanels(dieline, graph);
  assert.equal(panels.length, 2);
  const withWindow = panels.filter((panel) => panel.holes.length === 1);
  assert.equal(withWindow.length, 1);
  assert.equal(withWindow[0].holes[0].length, 4);
  assert.ok(withWindow[0].creaseEdgeIds.length >= 1);

  const totalBounds = panels.reduce(
    (bounds, panel) => ({
      minX: Math.min(bounds.minX, panel.bounds.minX),
      minY: Math.min(bounds.minY, panel.bounds.minY),
      maxX: Math.max(bounds.maxX, panel.bounds.maxX),
      maxY: Math.max(bounds.maxY, panel.bounds.maxY),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  assert.deepEqual(totalBounds, { minX: 0, minY: 0, maxX: 100, maxY: 50 });
});

test("a centered structural window does not erase its owning panel", () => {
  const dieline: CanonicalDieline = {
    ...fixture(),
    id: "centered-window-single-panel",
    widthMm: 100,
    heightMm: 100,
    entities: [
      linePathEntity(
        "outer-cut",
        "cut",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        true,
      ),
      linePathEntity(
        "centered-window",
        "window-cut",
        [
          { x: 40, y: 40 },
          { x: 60, y: 40 },
          { x: 60, y: 60 },
          { x: 40, y: 60 },
        ],
        true,
      ),
    ],
  };

  const graph = buildPlanarGraph(dieline);
  const panels = extractStructuralPanels(dieline, graph);
  assert.equal(panels.length, 1);
  assert.equal(panels[0].holes.length, 1);
  assert.equal(panels[0].holes[0].length, 4);
});

test("individually stroked PDF-style cut edges reconstruct one outer cycle and nested window", () => {
  const dieline = segmentedFixture();
  const graph = buildPlanarGraph(dieline);
  const cycles = extractCutCycles(dieline, graph);
  assert.equal(cycles.filter((cycle) => cycle.role === "outer").length, 1);
  assert.equal(cycles.filter((cycle) => cycle.role === "hole").length, 1);
  const panels = extractStructuralPanels(dieline, graph);
  assert.equal(panels.length, 2);
  assert.equal(panels.filter((panel) => panel.holes.length === 1).length, 1);
});

test("open cut topology fails instead of inventing a production closure", () => {
  const dieline = segmentedFixture();
  const withoutOneOuterEdge = {
    ...dieline,
    entities: dieline.entities.filter((candidate) => candidate.id !== "outer-3"),
  };
  const graph = buildPlanarGraph(withoutOneOuterEdge);
  assert.throws(
    () => extractCutCycles(withoutOneOuterEdge, graph),
    /explicit reviewed topology repair is required/,
  );
});
