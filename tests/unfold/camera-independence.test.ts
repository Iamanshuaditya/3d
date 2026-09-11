import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { mailerBoxSpec } from "@/lib/configurator/mailer-box-spec";
import { applyHingeAngles, buildCartonTree } from "@/lib/configurator/carton-geometry";
import { anglesAtStage, cartonUnfoldPlan } from "@/lib/configurator/unfold-plan";
import { InitialProductFraming } from "@/lib/configurator/initial-product-framing";

const STUDIO_SHELL = new URL("../../src/components/studio/StudioShell.tsx", import.meta.url);
const STUDIO_VIEWPORT = new URL("../../src/components/studio/StudioViewport.tsx", import.meta.url);
const PRESENTATION = new URL("../../src/lib/configurator/presentation.ts", import.meta.url);

test("folding a real carton preserves the user's camera after its initial fit", () => {
  const material = new THREE.MeshBasicMaterial();
  const tree = buildCartonTree(mailerBoxSpec, material, material, material);
  try {
    const plan = cartonUnfoldPlan(mailerBoxSpec)!;
    const framing = new InitialProductFraming();
    const camera = new THREE.PerspectiveCamera(32, 1.4, 0.1, 1000);
    camera.position.set(6, 5, 8);
    const target = new THREE.Vector3();
    const input = {
      productKey: "mailer", root: tree.root, camera, target,
      cancelled: false, aspect: 1.4, padding: 1.1, minDistance: 2, maxDistance: 100,
    };
    applyHingeAngles(tree, anglesAtStage(plan, 0));
    tree.root.updateMatrixWorld(true);
    const initialBounds = new THREE.Box3().setFromObject(tree.root);
    assert.equal(framing.fit(input), true);
    camera.position.set(7.1, 4.3, -6.2);
    target.set(0.2, 0.4, -0.1);
    camera.zoom = 1.3;
    camera.lookAt(target);
    const snapshot = () => ({
      position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      zoom: camera.zoom, target: target.toArray(),
    });
    const before = snapshot();
    let maximumBoundsChange = 0;
    const stages = Array.from({ length: plan.steps.length + 1 }, (_, index) => index);
    for (const stage of [...stages, ...stages.reverse()]) {
      applyHingeAngles(tree, anglesAtStage(plan, stage));
      tree.root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(tree.root);
      maximumBoundsChange = Math.max(maximumBoundsChange, bounds.max.distanceTo(initialBounds.max));
      assert.equal(framing.fit(input), false);
      assert.deepEqual(snapshot(), before, `fold stage ${stage} moved the camera`);
    }
    assert.ok(maximumBoundsChange > 0.5, "the fixture must actually change the product extent");
    assert.equal(framing.fit({ ...input, productKey: "different-product" }), true);
  } finally {
    tree.dispose();
    material.dispose();
  }
});

test("a camera action before the model loads cancels automatic framing", () => {
  const framing = new InitialProductFraming();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(2, 3, 4);
  const target = new THREE.Vector3();
  const input = {
    productKey: "delayed", root: undefined, camera, target, cancelled: false,
    aspect: 1, padding: 1.1, minDistance: 1, maxDistance: 100,
  };
  assert.equal(framing.fit(input), false);
  assert.equal(framing.fit({ ...input, cancelled: true }), false);
  const geometry = new THREE.BoxGeometry(10, 10, 10);
  const material = new THREE.MeshBasicMaterial();
  try {
    assert.equal(framing.fit({ ...input, root: new THREE.Mesh(geometry, material) }), false);
    assert.deepEqual(camera.position.toArray(), [2, 3, 4]);
    assert.deepEqual(target.toArray(), [0, 0, 0]);
  } finally {
    geometry.dispose();
    material.dispose();
  }
});

test("fold state never owns a Studio camera preset", async () => {
  const [studio, viewport, presentation] = await Promise.all([
    readFile(STUDIO_SHELL, "utf8"),
    readFile(STUDIO_VIEWPORT, "utf8"),
    readFile(PRESENTATION, "utf8"),
  ]);

  assert.doesNotMatch(studio, /dielineCameraPreset/);
  assert.doesNotMatch(studio, /defaultCameraPreset/);
  assert.doesNotMatch(studio, /wasFlatRef|movedCameraRef/);
  assert.doesNotMatch(studio, /useEffect\s*\([^)]*unfold\.status\?\.isFlat/);

  // The only remaining preset mutations clear a preset after an explicit
  // camera action finishes. Fold state may still drive `dielineView`, which is
  // a structural/material presentation flag and deliberately not a camera
  // mutation.
  const presetCalls = [...studio.matchAll(/setPendingPreset\(([^)]*)\)/g)].map(
    (match) => match[1].trim(),
  );
  assert.deepEqual(
    presetCalls,
    ["null", "null"],
    "Studio may clear an explicit camera preset, but folding must not assign one",
  );
  assert.match(viewport, /dielineView=\{Boolean\(unfold\.status\?\.isFlat\)\}/);
  assert.match(viewport, /onNext=\{unfold\.next\}/);
  assert.match(viewport, /onPrevious=\{unfold\.previous\}/);
  assert.doesNotMatch(viewport, /useEffect\s*\([^)]*unfold\.status\?\.isFlat/);

  assert.doesNotMatch(presentation, /dielineCameraPreset|defaultCameraPreset/);
  assert.match(
    presentation,
    /Camera state is deliberately absent from this contract/,
    "the presentation contract should document the camera/fold separation",
  );
});
