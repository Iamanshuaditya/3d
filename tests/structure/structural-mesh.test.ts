import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  createStructuralPanelGeometry,
  type CanonicalDieline,
  type StructuralPanel,
} from "@/lib/structure";

const dieline: CanonicalDieline = {
  schemaVersion: 2,
  id: "mesh-fixture",
  units: "mm",
  coordinateSystem: "x-right-y-down",
  widthMm: 100,
  heightMm: 60,
  source: { id: "mesh-fixture", format: "authored", sourceUnits: "mm" },
  tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
  entities: [],
};

const panel: StructuralPanel = {
  id: "panel-1",
  faceId: "face-1",
  outerBoundary: [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 50 },
    { x: 40, y: 50 },
    { x: 35, y: 55 },
    { x: 0, y: 55 },
  ],
  holes: [
    [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ],
  ],
  creaseEdgeIds: [],
  bounds: { minX: 0, minY: 0, maxX: 60, maxY: 55 },
};

function pointInRect(x: number, y: number, minX: number, minY: number, maxX: number, maxY: number) {
  return x > minX && x < maxX && y > minY && y < maxY;
}

test("structural mesh keeps the exact non-rectangular bounds and real board thickness", () => {
  const result = createStructuralPanelGeometry(panel, dieline, 1.2);
  const position = result.geometry.getAttribute("position");
  assert.ok(position.count > 0);
  assert.equal(result.geometry.groups.length, 3);
  assert.equal(result.boardThicknessMm, 1.2);
  assert.equal(result.geometry.boundingBox?.min.x, 0);
  assert.equal(result.geometry.boundingBox?.max.x, 60);
  assert.equal(result.geometry.boundingBox?.max.z, 55);
  assert.equal(result.geometry.boundingBox?.max.y, 0);
  assert.ok(Math.abs((result.geometry.boundingBox?.min.y ?? 0) + 1.2) < 1e-6);
});

test("printed triangulation leaves the structural window physically empty", () => {
  const result = createStructuralPanelGeometry(panel, dieline, 1);
  const positions = result.geometry.getAttribute("position");
  const printed = result.geometry.groups[0];
  for (let vertex = printed.start; vertex < printed.start + printed.count; vertex += 3) {
    const ax = positions.getX(vertex);
    const ay = positions.getZ(vertex);
    const bx = positions.getX(vertex + 1);
    const by = positions.getZ(vertex + 1);
    const cx = positions.getX(vertex + 2);
    const cy = positions.getZ(vertex + 2);
    const centroidX = (ax + bx + cx) / 3;
    const centroidY = (ay + by + cy) / 3;
    assert.equal(pointInRect(centroidX, centroidY, 10, 10, 20, 20), false);
  }
});

test("printed-face UVs are derived globally from canonical sheet coordinates", () => {
  const result = createStructuralPanelGeometry(panel, dieline, 1);
  const positions = result.geometry.getAttribute("position");
  const uvs = result.geometry.getAttribute("uv");
  const printed = result.geometry.groups[0];
  for (let vertex = printed.start; vertex < printed.start + printed.count; vertex += 1) {
    const x = positions.getX(vertex);
    const y = positions.getZ(vertex);
    assert.ok(Math.abs(uvs.getX(vertex) - (1 - x / 100)) < 1e-6);
    assert.ok(Math.abs(uvs.getY(vertex) - (1 - y / 60)) < 1e-6);
  }
});
