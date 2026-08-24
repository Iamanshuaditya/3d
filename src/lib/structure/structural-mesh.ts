import * as THREE from "three";
import type { CanonicalDieline, Vec2 } from "./vector-domain";
import type { StructuralPanel } from "./topology";
import { signedPolygonArea } from "./vector-math";

export type StructuralPanelMeshGeometry = Readonly<{
  geometry: THREE.BufferGeometry;
  boardThicknessMm: number;
  printedFaceVertexCount: number;
  innerFaceVertexCount: number;
  edgeVertexCount: number;
}>;

function normalizeLoop(points: readonly Vec2[], clockwise: boolean): Vec2[] {
  if (points.length < 3) throw new Error("A structural panel loop requires at least three points.");
  const isClockwiseInNumericCoordinates = signedPolygonArea(points) < 0;
  return isClockwiseInNumericCoordinates === clockwise ? [...points] : [...points].reverse();
}

function sheetUv(point: Vec2, dieline: CanonicalDieline): [number, number] {
  if (dieline.widthMm <= 0 || dieline.heightMm <= 0) throw new Error("Canonical dieline dimensions must be positive.");
  return [1 - point.x / dieline.widthMm, 1 - point.y / dieline.heightMm];
}

function pushTriangle(
  positions: number[],
  normals: number[],
  uvs: number[],
  a: Vec2,
  b: Vec2,
  c: Vec2,
  y: number,
  desiredNormalY: 1 | -1,
  dieline: CanonicalDieline,
): void {
  const worldA = new THREE.Vector3(a.x, y, a.y);
  const worldB = new THREE.Vector3(b.x, y, b.y);
  const worldC = new THREE.Vector3(c.x, y, c.y);
  const normal = new THREE.Vector3()
    .subVectors(worldB, worldA)
    .cross(new THREE.Vector3().subVectors(worldC, worldA));
  const ordered = normal.y * desiredNormalY >= 0 ? [a, b, c] : [a, c, b];
  for (const point of ordered) {
    positions.push(point.x, y, point.y);
    normals.push(0, desiredNormalY, 0);
    uvs.push(...sheetUv(point, dieline));
  }
}

function pushEdgeQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  start: Vec2,
  end: Vec2,
  topY: number,
  bottomY: number,
  dieline: CanonicalDieline,
): void {
  const dx = end.x - start.x;
  const dz = end.y - start.y;
  const length = Math.hypot(dx, dz);
  if (length <= Number.EPSILON) return;
  // A stable outward side normal is sufficient for edge lighting. Exact
  // outward polarity depends on loop winding, so callers orient loops first.
  const nx = dz / length;
  const nz = -dx / length;
  const vertices = [
    [start, topY],
    [end, topY],
    [end, bottomY],
    [start, topY],
    [end, bottomY],
    [start, bottomY],
  ] as const;
  for (const [point, y] of vertices) {
    positions.push(point.x, y, point.y);
    normals.push(nx, 0, nz);
    uvs.push(...sheetUv(point, dieline));
  }
}

/**
 * Builds one immutable board panel directly from canonical sheet coordinates.
 * Material groups are: 0 printed outside, 1 inner board, 2 exposed cut edge.
 * No fold state is baked into this geometry; hinges transform the mesh later.
 */
export function createStructuralPanelGeometry(
  panel: StructuralPanel,
  dieline: CanonicalDieline,
  boardThicknessMm: number,
): StructuralPanelMeshGeometry {
  if (!Number.isFinite(boardThicknessMm) || boardThicknessMm <= 0) {
    throw new RangeError("boardThicknessMm must be finite and positive");
  }

  // ShapeUtils expects a consistently oriented contour/hole set. We choose a
  // canonical numeric-coordinate orientation and keep the authoritative source
  // loops untouched on StructuralPanel.
  const outer = normalizeLoop(panel.outerBoundary, true);
  const holes = panel.holes.map((hole) => normalizeLoop(hole, false));
  const contour2d = outer.map((point) => new THREE.Vector2(point.x, point.y));
  const holes2d = holes.map((hole) => hole.map((point) => new THREE.Vector2(point.x, point.y)));
  const triangles = THREE.ShapeUtils.triangulateShape(contour2d, holes2d);
  if (triangles.length === 0) throw new Error(`Panel ${panel.id} could not be triangulated.`);

  const flattenedPoints = [...outer, ...holes.flat()];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const topY = 0;
  const bottomY = -boardThicknessMm;

  const printedStart = 0;
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map((index) => flattenedPoints[index]) as [Vec2, Vec2, Vec2];
    if (!a || !b || !c) throw new Error(`Panel ${panel.id} triangulation returned an invalid vertex index.`);
    pushTriangle(positions, normals, uvs, a, b, c, topY, 1, dieline);
  }
  const printedCount = positions.length / 3 - printedStart;

  const innerStart = positions.length / 3;
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map((index) => flattenedPoints[index]) as [Vec2, Vec2, Vec2];
    pushTriangle(positions, normals, uvs, a, b, c, bottomY, -1, dieline);
  }
  const innerCount = positions.length / 3 - innerStart;

  const edgeStart = positions.length / 3;
  const addLoopEdges = (loop: readonly Vec2[]) => {
    for (let index = 0; index < loop.length; index += 1) {
      pushEdgeQuad(
        positions,
        normals,
        uvs,
        loop[index],
        loop[(index + 1) % loop.length],
        topY,
        bottomY,
        dieline,
      );
    }
  };
  addLoopEdges(outer);
  for (const hole of holes) addLoopEdges([...hole].reverse());
  const edgeCount = positions.length / 3 - edgeStart;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.clearGroups();
  geometry.addGroup(printedStart, printedCount, 0);
  geometry.addGroup(innerStart, innerCount, 1);
  geometry.addGroup(edgeStart, edgeCount, 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    structuralPanelId: panel.id,
    structuralFaceId: panel.faceId,
    boardThicknessMm,
    canonicalDielineId: dieline.id,
  };

  return {
    geometry,
    boardThicknessMm,
    printedFaceVertexCount: printedCount,
    innerFaceVertexCount: innerCount,
    edgeVertexCount: edgeCount,
  };
}
