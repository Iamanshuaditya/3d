import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import type { GlbArticulationSpec } from "@/types/unfold";
import {
  applyGlbHingeAngles,
  glbHinges,
  glbUnfoldPlan,
  rigGlbArticulation,
} from "@/lib/configurator/glb-articulation";
import { anglesAtStage, validateUnfoldPlan } from "@/lib/configurator/unfold-plan";
import { resolveProductPresentation } from "@/lib/configurator/presentation";
import { PRODUCTS } from "@/lib/configurator/product-config";

/** BASE -> ARM -> TIP, mirroring how an authored GLB must nest its parts. */
function scene() {
  const root = new THREE.Object3D();
  root.name = "ROOT";
  const base = new THREE.Object3D();
  base.name = "BASE";
  const arm = new THREE.Object3D();
  arm.name = "ARM";
  arm.position.set(0, 10, 0);
  const tip = new THREE.Object3D();
  tip.name = "TIP";
  tip.position.set(0, 20, 0);
  const stray = new THREE.Object3D();
  stray.name = "STRAY";
  root.add(base, stray);
  base.add(arm);
  arm.add(tip);
  return { root, base, arm, tip, stray };
}

const SPEC: GlbArticulationSpec = {
  mode: "glb-nodes",
  hinges: [
    {
      nodeName: "ARM",
      parentNodeName: null,
      axis: [1, 0, 0],
      pivot: [0, 0, 0],
      assembledAngleDeg: 0,
      flatAngleDeg: -90,
      isPrimary: true,
      openAngleDeg: -45,
    },
    {
      nodeName: "TIP",
      parentNodeName: "ARM",
      axis: [1, 0, 0],
      pivot: [0, 10, 0],
      assembledAngleDeg: 0,
      flatAngleDeg: -30,
    },
  ],
};

// -------------------------------------------------------------- hinge graph

test("the hinge graph carries depth and dependencies from the declaration", () => {
  const hinges = glbHinges(SPEC);
  assert.deepEqual(
    hinges.map((h) => [h.id, h.depth, h.parentId]),
    [["ARM", 1, null], ["TIP", 2, "ARM"]],
  );
  assert.equal(hinges[0].isPrimary, true);
  assert.equal(hinges[1].isPrimary, false);
});

test("a hinge naming a parent that is not itself a hinge fails loudly", () => {
  assert.throws(
    () =>
      glbHinges({
        ...SPEC,
        hinges: [{ ...SPEC.hinges[0], parentNodeName: "NOT_A_HINGE" }],
      }),
    /is not itself a declared hinge/,
  );
});

test("a cycle in the hinge graph fails loudly instead of hanging", () => {
  assert.throws(
    () =>
      glbHinges({
        mode: "glb-nodes",
        hinges: [
          { ...SPEC.hinges[0], nodeName: "A", parentNodeName: "B" },
          { ...SPEC.hinges[1], nodeName: "B", parentNodeName: "A" },
        ],
      }),
    /hinge cycle/,
  );
});

// --------------------------------------------------------------------- plan

test("a GLB plan is dependency-valid and reaches flat", () => {
  const plan = glbUnfoldPlan(SPEC)!;
  assert.ok(plan);
  assert.deepEqual(validateUnfoldPlan(plan, glbHinges(SPEC)), []);
  assert.equal(plan.reachesFlat, true);
  // Derived: the primary opens first, then the deepest joint flattens before
  // the arm it hangs off.
  assert.equal(plan.steps[0].id, "open");
  const flattenStage = (id: string) => plan.steps.findIndex((s) => s.targets[id] === (id === "TIP" ? -30 : -90));
  assert.ok(flattenStage("TIP") < flattenStage("ARM"));
});

test("an authored sequence overrides the derived order", () => {
  const plan = glbUnfoldPlan({
    ...SPEC,
    sequence: [
      { id: "tip", label: "Fold the tip", hingeIds: ["TIP"], to: "flat" },
      { id: "arm", label: "Fold the arm", hingeIds: ["ARM"], to: "flat" },
    ],
  })!;
  assert.equal(plan.source, "authored");
  assert.deepEqual(plan.steps.map((s) => s.label), ["Fold the tip", "Fold the arm"]);
  assert.deepEqual(validateUnfoldPlan(plan, glbHinges(SPEC)), []);
});

// ---------------------------------------------------------------- rigging

test("rigging leaves the rest pose byte-identical", () => {
  const { root, tip } = scene();
  root.updateMatrixWorld(true);
  const before = tip.getWorldPosition(new THREE.Vector3());

  const rig = rigGlbArticulation(root, SPEC);
  root.updateMatrixWorld(true);
  const after = tip.getWorldPosition(new THREE.Vector3());

  assert.ok(before.distanceTo(after) < 1e-9, `rest pose moved: ${before.toArray()} -> ${after.toArray()}`);
  rig.dispose();
});

test("dispose restores the original parenting, so re-rigging is safe", () => {
  // This is the StrictMode hazard: mount -> cleanup -> mount must leave a
  // working rig, not a set of groups detached from the scene.
  const { root, arm, base, tip } = scene();
  const rigA = rigGlbArticulation(root, SPEC);
  rigA.dispose();
  assert.equal(arm.parent, base, "ARM should be back under BASE");
  assert.equal(arm.position.y, 10, "ARM's own offset should be restored");

  const rigB = rigGlbArticulation(root, SPEC);
  applyGlbHingeAngles(rigB, { ARM: -90, TIP: 0 });
  root.updateMatrixWorld(true);
  const moved = tip.getWorldPosition(new THREE.Vector3());
  assert.ok(
    Math.abs(moved.y) < 1e-6 && Math.abs(moved.z + 30) < 1e-6,
    `a re-rigged model must still articulate, got ${moved.toArray()}`,
  );
  rigB.dispose();
});

test("a parent rotation carries its children", () => {
  const { root, tip } = scene();
  const rig = rigGlbArticulation(root, SPEC);

  applyGlbHingeAngles(rig, { ARM: -90, TIP: 0 });
  root.updateMatrixWorld(true);
  const armOnly = tip.getWorldPosition(new THREE.Vector3());
  // ARM lies back along -Z, carrying TIP with it: 10 + 20 units out.
  assert.ok(Math.abs(armOnly.z + 30) < 1e-6, `expected z = -30, got ${armOnly.z}`);

  applyGlbHingeAngles(rig, { ARM: -90, TIP: -90 });
  root.updateMatrixWorld(true);
  const both = tip.getWorldPosition(new THREE.Vector3());
  // TIP folds back on itself about the ARM's far end: it swings out of the
  // ARM's line, so it ends up half as far along -Z and dropped below it.
  assert.ok(Math.abs(both.y + 10) < 1e-6, `expected y = -10, got ${both.y}`);
  assert.ok(Math.abs(both.z + 20) < 1e-6, `expected z = -20, got ${both.z}`);
  rig.dispose();
});

test("a pose that omits a joint leaves it at its assembled angle", () => {
  const { root, tip } = scene();
  const rig = rigGlbArticulation(root, SPEC);
  applyGlbHingeAngles(rig, {});
  root.updateMatrixWorld(true);
  assert.ok(Math.abs(tip.getWorldPosition(new THREE.Vector3()).y - 30) < 1e-9);
  rig.dispose();
});

test("rigging a node the model does not contain fails loudly", () => {
  const { root } = scene();
  assert.throws(
    () =>
      rigGlbArticulation(root, {
        mode: "glb-nodes",
        hinges: [{ ...SPEC.hinges[0], nodeName: "MISSING" }],
      }),
    /not in the model/,
  );
});

test("a declared hinge parent that is not an ancestor fails loudly", () => {
  // STRAY is a sibling of BASE, so rotating it could never carry ARM. Catching
  // this is the whole point of checking the declaration against the hierarchy
  // instead of trusting it.
  const { root } = scene();
  assert.throws(
    () =>
      rigGlbArticulation(root, {
        mode: "glb-nodes",
        hinges: [
          { ...SPEC.hinges[0], nodeName: "STRAY", parentNodeName: null },
          { ...SPEC.hinges[0], nodeName: "ARM", parentNodeName: "STRAY" },
        ],
      }),
    /not one of its ancestors/,
  );
});

test("a zero-length axis fails loudly", () => {
  const { root } = scene();
  assert.throws(
    () =>
      rigGlbArticulation(root, {
        mode: "glb-nodes",
        hinges: [{ ...SPEC.hinges[0], axis: [0, 0, 0] }],
      }),
    /zero-length axis/,
  );
});

// ------------------------------------------------------------- the product

test("the counter display is a progressive-unfold product driven by its GLB hinges", () => {
  const product = PRODUCTS["counter-display"];
  assert.ok(product, "counter-display should be registered");
  assert.equal(product.family, "glb");
  assert.equal(product.articulation?.mode, "glb-nodes");

  const presentation = resolveProductPresentation(product);
  assert.equal(presentation.mode, "progressive-unfold");
  if (presentation.mode !== "progressive-unfold") return;

  const { plan } = presentation;
  assert.equal(plan.source, "authored");
  assert.deepEqual(plan.steps.map((s) => s.label), [
    "Fold the header down",
    "Fold in the side wings",
    "Lay the display flat",
  ]);
  assert.equal(plan.reachesFlat, true);
  assert.deepEqual(validateUnfoldPlan(plan, glbHinges(product.articulation!)), []);

  // Stage 0 is the pose the GLB was authored in, so the product first renders
  // exactly as modelled.
  const assembled = anglesAtStage(plan, 0);
  assert.ok(Object.values(assembled).every((angle) => angle === 0));
});
