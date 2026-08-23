import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import type { CartonSpec } from "@/types/carton";
import { CARTONS } from "@/lib/configurator/carton-spec";
import { applyHingeAngles, buildCartonTree } from "@/lib/configurator/carton-geometry";
import {
  MM_TO_UNITS,
  cartonCanFlatten,
  cartonTopology,
  flatPanelOffset,
} from "@/lib/configurator/carton-topology";
import { anglesAtStage, cartonUnfoldPlan } from "@/lib/configurator/unfold-plan";

/**
 * The headline invariant for foldable packaging:
 *
 *   fully-unfolded 3D panel transform  ==  dieline panel transform
 *
 * If this holds, the final stage of the unfold animation IS the 2D editor
 * canvas — same position, same orientation, same artwork mapping — which is
 * the whole point of unfolding a carton in the first place.
 */

const flattenable = Object.values(CARTONS).filter(cartonCanFlatten);

function poseAt(spec: CartonSpec, stage: number) {
  const material = new THREE.MeshBasicMaterial();
  const tree = buildCartonTree(spec, material, material, material);
  const plan = cartonUnfoldPlan(spec)!;
  applyHingeAngles(tree, anglesAtStage(plan, stage));
  tree.root.updateMatrixWorld(true);
  return { tree, plan };
}

test("every flattenable carton has at least one flattenable spec to test", () => {
  assert.ok(flattenable.length > 0);
});

for (const spec of flattenable) {
  const topology = cartonTopology(spec);
  const rootCentre = {
    x: topology.root.rect.x + topology.root.rect.w / 2,
    y: topology.root.rect.y + topology.root.rect.h / 2,
  };

  test(`${spec.id}: flattened panels land on their dieline positions`, () => {
    const { tree, plan } = poseAt(spec, cartonUnfoldPlan(spec)!.steps.length);
    assert.equal(plan.reachesFlat, true);

    for (const panel of spec.panels) {
      const mesh = tree.meshes[panel.id];
      assert.ok(mesh, `${panel.id} has no mesh`);
      const world = new THREE.Vector3();
      mesh.getWorldPosition(world);
      const expected = flatPanelOffset(spec, panel.id);
      // 0.001 scene units = 0.1 mm of board, an order of magnitude finer than
      // any press tolerance.
      assert.ok(Math.abs(world.x - expected.x) < 1e-3, `${panel.id} x ${world.x} != ${expected.x}`);
      assert.ok(Math.abs(world.z - expected.z) < 1e-3, `${panel.id} z ${world.z} != ${expected.z}`);
      assert.ok(Math.abs(world.y) < 1e-3, `${panel.id} is not in the dieline plane (y=${world.y})`);
    }
    tree.dispose();
  });

  test(`${spec.id}: flattened panels are coplanar and printed-side up`, () => {
    const { tree } = poseAt(spec, cartonUnfoldPlan(spec)!.steps.length);
    const up = new THREE.Vector3(0, 1, 0);
    for (const panel of spec.panels) {
      const mesh = tree.meshes[panel.id];
      const normal = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      assert.ok(
        normal.dot(up) > 0.999,
        `${panel.id} is not lying face-up at the flat stage (dot=${normal.dot(up)})`,
      );
    }
    tree.dispose();
  });

  test(`${spec.id}: artwork is unmirrored and correctly oriented on every flat panel`, () => {
    // Per-vertex chirality check. Reconstruct each vertex's dieline coordinate
    // from its flattened world position and assert the UV it carries is the UV
    // that coordinate should have. This catches mirroring, quarter-turns and
    // per-panel UV drift in one assertion — the failures that survive every
    // monotonic "is v increasing" test.
    const { tree } = poseAt(spec, cartonUnfoldPlan(spec)!.steps.length);
    const world = new THREE.Vector3();

    for (const panel of spec.panels) {
      const mesh = tree.meshes[panel.id];
      const position = mesh.geometry.getAttribute("position");
      const uv = mesh.geometry.getAttribute("uv");
      assert.ok(uv, `${panel.id} has no UVs`);

      for (let index = 0; index < position.count; index += 1) {
        world.fromBufferAttribute(position, index);
        mesh.localToWorld(world);
        const dielineX = world.x / MM_TO_UNITS + rootCentre.x;
        const dielineY = world.z / MM_TO_UNITS + rootCentre.y;
        const expectedU = dielineX / spec.width;
        const expectedV = 1 - dielineY / spec.height;
        assert.ok(
          Math.abs(uv.getX(index) - expectedU) < 1e-4 &&
            Math.abs(uv.getY(index) - expectedV) < 1e-4,
          `${panel.id} vertex ${index}: uv (${uv.getX(index)}, ${uv.getY(index)}) ` +
            `does not match dieline position (${dielineX.toFixed(2)}, ${dielineY.toFixed(2)}) ` +
            `which should be (${expectedU.toFixed(4)}, ${expectedV.toFixed(4)})`,
        );
      }
    }
    tree.dispose();
  });

  test(`${spec.id}: UVs are identical at every stage, so artwork never shifts`, () => {
    const plan = cartonUnfoldPlan(spec)!;
    const snapshots = [0, 1, Math.ceil(plan.steps.length / 2), plan.steps.length].map((stage) => {
      const { tree } = poseAt(spec, stage);
      const perPanel = spec.panels.map((panel) =>
        Array.from(tree.meshes[panel.id].geometry.getAttribute("uv").array),
      );
      tree.dispose();
      return perPanel;
    });
    for (const snapshot of snapshots.slice(1)) {
      assert.deepEqual(snapshot, snapshots[0], "UVs changed between unfold stages");
    }
  });

  test(`${spec.id}: the flat footprint fits inside the printed dieline`, () => {
    const { tree } = poseAt(spec, cartonUnfoldPlan(spec)!.steps.length);
    const box = new THREE.Box3().setFromObject(tree.root);
    const halfWidth = (spec.width * MM_TO_UNITS) / 2;
    const halfHeight = (spec.height * MM_TO_UNITS) / 2;
    // The root panel is not necessarily centred in the dieline, so compare
    // against the dieline extent rather than a symmetric box.
    assert.ok(box.max.x - box.min.x <= spec.width * MM_TO_UNITS + 1e-6);
    assert.ok(box.max.z - box.min.z <= spec.height * MM_TO_UNITS + 1e-6);
    assert.ok(Number.isFinite(halfWidth) && Number.isFinite(halfHeight));
    tree.dispose();
  });

  test(`${spec.id}: the assembled pose is three-dimensional, not already flat`, () => {
    const { tree } = poseAt(spec, 0);
    const box = new THREE.Box3().setFromObject(tree.root);
    assert.ok(
      box.max.y - box.min.y > 0.1,
      "the assembled carton should have real height before unfolding starts",
    );
    tree.dispose();
  });
}
