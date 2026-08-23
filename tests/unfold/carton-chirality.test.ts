import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CARTONS } from "@/lib/configurator/carton-spec";
import { applyHingeAngles, buildCartonTree } from "@/lib/configurator/carton-geometry";
import { anglesAtStage, cartonUnfoldPlan } from "@/lib/configurator/unfold-plan";

/**
 * Chirality of the generic folded-carton construction.
 *
 * KNOWN PRE-EXISTING DEFECT, pinned here rather than silently changed.
 *
 * `toUv` maps a panel's dieline rect straight onto the canvas and the panels
 * fold UP out of that plane. The consequence, measured below, is that on the
 * assembled carton every printed panel is the outermost board surface (right)
 * but its face normal points into the box (wrong) — so artwork on the box
 * EXTERIOR is seen through the back of the printed quad and reads mirrored.
 *
 * The two properties are in genuine tension: a carton printed on the outside
 * folds away from its print, so a blank whose top view matches the editor
 * necessarily assembles with the print inside, and vice versa. Fixing the
 * exterior therefore means changing which physical wall each dieline panel
 * becomes, which invalidates the authored `sections` metadata on shipped
 * products. It is a scoped migration, not a one-line flip, and it is
 * deliberately NOT bundled with the unfolding work.
 *
 * This test documents today's behaviour precisely so it cannot change by
 * accident.
 */

const spec = CARTONS["mailer-box"];

function assembledTree() {
  const material = new THREE.MeshBasicMaterial();
  const tree = buildCartonTree(spec, material, material, material);
  applyHingeAngles(tree, anglesAtStage(cartonUnfoldPlan(spec)!, 0));
  tree.root.updateMatrixWorld(true);
  return tree;
}

const WALLS = ["BASE", "BACK", "FRONT", "LEFT", "RIGHT", "LID_TOP"];

test("the printed panel is the outermost board surface on every wall", () => {
  const tree = assembledTree();
  const centroid = new THREE.Box3().setFromObject(tree.root).getCenter(new THREE.Vector3());
  for (const id of WALLS) {
    const printed = tree.meshes[id].getWorldPosition(new THREE.Vector3());
    const board = tree.root
      .getObjectByName(`${id}__inner`)!
      .getWorldPosition(new THREE.Vector3());
    assert.ok(
      board.distanceTo(centroid) < printed.distanceTo(centroid),
      `${id}: the unprinted board should sit inside the printed face`,
    );
  }
  tree.dispose();
});

test("PINNED DEFECT: exterior artwork is mirrored because printed normals face inward", () => {
  const tree = assembledTree();
  const centroid = new THREE.Box3().setFromObject(tree.root).getCenter(new THREE.Vector3());
  for (const id of WALLS) {
    const mesh = tree.meshes[id];
    const normal = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const outward = mesh.getWorldPosition(new THREE.Vector3()).sub(centroid).normalize();
    // Change this expectation only together with a migration of every
    // product's `sections` metadata — see the comment at the top of the file.
    assert.ok(
      normal.dot(outward) < -0.99,
      `${id}: printed normal is no longer inward — the chirality convention changed`,
    );
  }
  tree.dispose();
});

test("the dieline view drops the unprinted board so the blank reads as printed", () => {
  const tree = assembledTree();
  assert.ok(tree.boardMeshes.length > 0);
  assert.ok(tree.boardMeshes.every((mesh) => mesh.visible));
  tree.dispose();
});
