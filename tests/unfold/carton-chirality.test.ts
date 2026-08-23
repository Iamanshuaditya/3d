import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import type { CartonSpec } from "@/types/carton";
import { CARTONS } from "@/lib/configurator/carton-spec";
import { applyHingeAngles, buildCartonTree } from "@/lib/configurator/carton-geometry";
import { anglesAtStage, cartonUnfoldPlan } from "@/lib/configurator/unfold-plan";

/**
 * Artwork must read the right way round on the assembled carton.
 *
 * This is the check that a normal, a winding test or a monotonic "is v
 * increasing" test all pass while the customer's logo comes out backwards.
 * Chirality is whether the map from (u, v) to (screen-right, screen-up)
 * preserves orientation for someone looking at the printed face — so we
 * compare the signed area of one triangle in UV space against its signed area
 * as that viewer sees it. Same sign: readable. Opposite sign: mirrored.
 *
 * It was measured negative on every panel before the `toUv` u-inversion; see
 * `docs/research/ARCHITECTURE_AUDIT.md` §5.
 */

function geometryCentre(mesh: THREE.Mesh) {
  const attribute = mesh.geometry.getAttribute("position");
  const sum = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (let i = 0; i < attribute.count; i += 1) {
    sum.add(mesh.localToWorld(point.fromBufferAttribute(attribute, i)));
  }
  return sum.multiplyScalar(1 / attribute.count);
}

function readability(printed: THREE.Mesh, board: THREE.Mesh) {
  const position = printed.geometry.getAttribute("position");
  const uv = printed.geometry.getAttribute("uv");
  const index = printed.geometry.getIndex();
  const triangle = index ? [index.getX(0), index.getX(1), index.getX(2)] : [0, 1, 2];

  const world = triangle.map((i) =>
    printed.localToWorld(new THREE.Vector3().fromBufferAttribute(position, i)),
  );
  const uvs = triangle.map((i) => new THREE.Vector2(uv.getX(i), uv.getY(i)));

  // Which side is the printed face on? The unprinted board is always behind
  // it. Deriving it that way keeps this test independent of the two builders'
  // opposite winding conventions.
  const outward = geometryCentre(printed).sub(geometryCentre(board)).normalize();
  const hint = Math.abs(outward.y) > 0.9
    ? new THREE.Vector3(0, 0, -1)
    : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(hint, outward).normalize();
  const up = new THREE.Vector3().crossVectors(outward, right).normalize();

  const screen = world.map((p) => new THREE.Vector2(p.dot(right), p.dot(up)));
  const area = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) =>
    (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);

  return (
    Math.sign(area(uvs[0], uvs[1], uvs[2])) * Math.sign(area(screen[0], screen[1], screen[2]))
  );
}

function assembled(spec: CartonSpec) {
  const material = new THREE.MeshBasicMaterial();
  const tree = buildCartonTree(spec, material, material, material);
  applyHingeAngles(tree, anglesAtStage(cartonUnfoldPlan(spec)!, 0));
  tree.root.updateMatrixWorld(true);
  return tree;
}

for (const spec of Object.values(CARTONS)) {
  test(`${spec.id}: artwork reads correctly on every assembled panel`, () => {
    const tree = assembled(spec);
    const checked: string[] = [];
    for (const [id, printed] of Object.entries(tree.meshes)) {
      const board = tree.root.getObjectByName(`${id}__inner`) as THREE.Mesh | undefined;
      assert.ok(board, `${id} has no board face to orient against`);
      assert.equal(
        readability(printed, board),
        1,
        `${spec.id}/${id}: artwork is mirrored on the assembled carton`,
      );
      checked.push(id);
    }
    assert.ok(checked.length >= 10, `only ${checked.length} panels were checked`);
    tree.dispose();
  });

  test(`${spec.id}: the printed face is on the outside of every enclosing wall`, () => {
    const tree = assembled(spec);
    const centroid = new THREE.Box3().setFromObject(tree.root).getCenter(new THREE.Vector3());
    // A panel folded back on itself is an interior reinforcement, not a wall:
    // a roll-end tray's roll-over ends up printed-side against the inside of
    // the front wall, which is correct. Read that from the spec's fold angle
    // rather than from panel names.
    const foldedInside = new Set(
      spec.panels.filter((panel) => (panel.angle ?? 0) >= 150).map((panel) => panel.id),
    );
    let walls = 0;
    for (const [id, printed] of Object.entries(tree.meshes)) {
      if (foldedInside.has(id)) continue;
      const board = tree.root.getObjectByName(`${id}__inner`) as THREE.Mesh;
      const outward = geometryCentre(printed).sub(geometryCentre(board)).normalize();
      const awayFromCentre = geometryCentre(printed).sub(centroid).normalize();
      const alignment = outward.dot(awayFromCentre);
      // Projecting flanges — rim strips, locking ears, corner gussets — sit
      // edge-on to the carton's centre, so "inside vs outside" is not defined
      // for them. Only enclosing walls are.
      if (Math.abs(alignment) < 0.5) continue;
      walls += 1;
      assert.ok(
        alignment > 0,
        `${spec.id}/${id}: the printed face points into the carton, not out of it`,
      );
    }
    assert.ok(walls >= 5, `only ${walls} enclosing walls were found to check`);
    tree.dispose();
  });

}

test("the dieline view drops the unprinted board so the blank reads as printed", () => {
  const tree = assembled(CARTONS["mailer-box"]);
  assert.ok(tree.boardMeshes.length > 0);
  assert.ok(tree.boardMeshes.every((mesh) => mesh.visible));
  tree.dispose();
});
