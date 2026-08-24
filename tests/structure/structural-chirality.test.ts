import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  applyStructuralHingeAngles,
  buildPlanarGraph,
  createStructuralTree,
  extractStructuralPanels,
  resolveStructuralRig,
  structuralAssembledPose,
  type CanonicalDieline,
  type StructuralConstructionSpec,
  type StructuralEntity,
  type StructuralOperation,
  type Vec2,
} from "@/lib/structure";

/**
 * Artwork must read the right way round on an assembled STRUCTURAL carton, and
 * the printed face must end up on the outside of every enclosing wall.
 *
 * `tests/unfold/carton-chirality.test.ts` asserts this for the legacy carton
 * builder, which places panels at their final box positions. Structural panels
 * instead stay in canonical sheet coordinates, so they need their own check —
 * without one, a u-inversion copied over from the legacy builder mirrors every
 * printed panel while normals, winding and flat-pose geometry all stay valid.
 */

const SOURCE_SHA = "c".repeat(64);
const WIDTH = 400;
const HEIGHT = 100;
const WALL = 100;

function entity(
  id: string,
  operation: StructuralOperation,
  points: readonly Vec2[],
  closed: boolean,
): StructuralEntity {
  const provenance = {
    sourceId: "chirality-fixture",
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

/** A four-wall tube: the smallest shape with a real inside and outside. */
function tubeDieline(): CanonicalDieline {
  return {
    schemaVersion: 2,
    id: "structural-chirality-tube",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: WIDTH,
    heightMm: HEIGHT,
    source: { id: "chirality-fixture", format: "authored", sourceUnits: "mm", sha256: SOURCE_SHA },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities: [
      entity(
        "outer",
        "cut",
        [
          { x: 0, y: 0 },
          { x: WIDTH, y: 0 },
          { x: WIDTH, y: HEIGHT },
          { x: 0, y: HEIGHT },
        ],
        true,
      ),
      ...[1, 2, 3].map((index) =>
        entity(
          `crease-${index}`,
          "crease",
          [
            { x: index * WALL, y: 0 },
            { x: index * WALL, y: HEIGHT },
          ],
          false,
        ),
      ),
    ],
  };
}

function assembledTube() {
  const dieline = tubeDieline();
  const graph = buildPlanarGraph(dieline);
  const panels = extractStructuralPanels(dieline, graph);
  assert.equal(panels.length, 4, "the fixture must decompose into four walls");

  const ordered = [...panels].sort((a, b) => a.bounds.minX - b.bounds.minX);
  const construction: StructuralConstructionSpec = {
    schemaVersion: 1,
    sourceLock: { canonicalSchemaVersion: 2, dielineId: dieline.id, sha256: SOURCE_SHA },
    rootPanelId: ordered[0].id,
    boardThicknessMm: 0.6,
    hinges: [1, 2, 3].map((index) => ({
      id: `wall-${index}`,
      parentPanelId: ordered[index - 1].id,
      childPanelId: ordered[index].id,
      source: [
        { entityId: `crease-${index}`, pathId: `crease-${index}-path`, flattenedSegmentIndexes: [0] },
      ],
      // Positive-depth: the sign that keeps the printed +Y face exterior.
      assembledAngleDeg: -90,
    })),
  };

  const rig = resolveStructuralRig(dieline, graph, panels, construction);
  const material = new THREE.MeshBasicMaterial();
  const tree = createStructuralTree(dieline, panels, rig, [material, material, material]);
  applyStructuralHingeAngles(tree, structuralAssembledPose(rig));
  tree.root.updateMatrixWorld(true);
  return tree;
}

function printedFaceFrame(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const normal = geometry.getAttribute("normal");
  const printed = geometry.groups[0];
  const indexes = [printed.start, printed.start + 1, printed.start + 2];

  const world = indexes.map((index) =>
    mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position, index)),
  );
  const uvs = indexes.map((index) => new THREE.Vector2(uv.getX(index), uv.getY(index)));
  const outward = new THREE.Vector3()
    .fromBufferAttribute(normal, printed.start)
    .transformDirection(mesh.matrixWorld)
    .normalize();

  // A viewer standing off the printed face: screen-right and screen-up are any
  // consistent right-handed basis around the outward normal.
  const hint =
    Math.abs(outward.y) > 0.9 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(hint, outward).normalize();
  const up = new THREE.Vector3().crossVectors(outward, right).normalize();
  const screen = world.map((point) => new THREE.Vector2(point.dot(right), point.dot(up)));

  const area = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) =>
    (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);

  return {
    outward,
    readability:
      Math.sign(area(uvs[0], uvs[1], uvs[2])) * Math.sign(area(screen[0], screen[1], screen[2])),
  };
}

function meshCentre(mesh: THREE.Mesh) {
  const position = mesh.geometry.getAttribute("position");
  const sum = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    sum.add(mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position, index)));
  }
  return sum.multiplyScalar(1 / position.count);
}

test("structural artwork reads the right way round on every assembled panel", () => {
  const tree = assembledTube();
  let checked = 0;
  for (const [id, mesh] of Object.entries(tree.meshes)) {
    const { readability } = printedFaceFrame(mesh);
    assert.equal(readability, 1, `${id}: structural artwork is mirrored on the assembled carton`);
    checked += 1;
  }
  assert.equal(checked, 4);
  tree.dispose();
});

test("the structural printed face is on the outside of every enclosing wall", () => {
  const tree = assembledTube();
  const centroid = new THREE.Box3().setFromObject(tree.root).getCenter(new THREE.Vector3());
  for (const [id, mesh] of Object.entries(tree.meshes)) {
    const { outward } = printedFaceFrame(mesh);
    const awayFromCentre = meshCentre(mesh).sub(centroid).normalize();
    assert.ok(
      outward.dot(awayFromCentre) > 0.5,
      `${id}: the printed face points into the carton, not out of it`,
    );
  }
  tree.dispose();
});

test("global sheet UVs stay continuous and unmirrored across the whole sheet", () => {
  const dieline = tubeDieline();
  const graph = buildPlanarGraph(dieline);
  const panels = extractStructuralPanels(dieline, graph);
  const material = new THREE.MeshBasicMaterial();
  const construction: StructuralConstructionSpec = {
    schemaVersion: 1,
    sourceLock: { canonicalSchemaVersion: 2, dielineId: dieline.id, sha256: SOURCE_SHA },
    rootPanelId: [...panels].sort((a, b) => a.bounds.minX - b.bounds.minX)[0].id,
    boardThicknessMm: 0.6,
    hinges: [],
  };
  const ordered = [...panels].sort((a, b) => a.bounds.minX - b.bounds.minX);
  const rig = resolveStructuralRig(dieline, graph, panels, {
    ...construction,
    hinges: [1, 2, 3].map((index) => ({
      id: `wall-${index}`,
      parentPanelId: ordered[index - 1].id,
      childPanelId: ordered[index].id,
      source: [
        { entityId: `crease-${index}`, pathId: `crease-${index}-path`, flattenedSegmentIndexes: [0] },
      ],
      assembledAngleDeg: -90,
    })),
  });
  const tree = createStructuralTree(dieline, panels, rig, [material, material, material]);

  // Sheet-left must sample texture-left: a panel further right on the sheet
  // must have a strictly greater u than the panel to its left.
  const centres = ordered.map((panel) => {
    const mesh = tree.meshes[panel.id];
    const uv = mesh.geometry.getAttribute("uv");
    const printed = mesh.geometry.groups[0];
    let sum = 0;
    for (let index = printed.start; index < printed.start + printed.count; index += 1) {
      sum += uv.getX(index);
    }
    return sum / printed.count;
  });
  for (let index = 1; index < centres.length; index += 1) {
    assert.ok(
      centres[index] > centres[index - 1],
      `panel ${ordered[index].id} samples a smaller u than the panel to its left; the sheet is mirrored`,
    );
  }
  tree.dispose();
});
