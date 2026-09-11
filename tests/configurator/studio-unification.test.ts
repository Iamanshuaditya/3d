import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { blenderPouchConfig } from "@/lib/configurator/blender-pouch";
import { getProduct, mailerBoxProduct } from "@/lib/configurator/product-config";
import { validateProductModel } from "@/lib/configurator/model-validator";
import { applyInflation, editableMeshes } from "@/lib/configurator/model-surfaces";
import { resolveProductPresentation } from "@/lib/configurator/presentation";
import { resolveStudioScenePresentation } from "@/lib/configurator/studio-scene-presentation";
import { configureDesignTexture } from "@/lib/configurator/texture-manager";
import { configurationStudioHref, projectStudioHref, studioHref } from "@/lib/projects/location";
import LegacyStudioPage from "@/app/studio/page";
import LegacyPouchPage from "@/app/test/pouch/page";
import LegacyLabPage from "@/app/test/page";
import RootAliasPage from "@/app/route/page";

const origin = "http://localhost:3000";

test("cards, resolved configurations and saved projects share the root editor URL", () => {
  assert.equal(studioHref(), "/");
  const configuration = {
    productId: "mailer-box-001", productVersionId: "mailer-box-001@3",
    optionSelection: { width: 200, length: 300, custom: "A & B + C" },
  };
  const project = { ...configuration, id: "project-to-reopen" };
  const url = new URL(projectStudioHref(project), origin);
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("project"), project.id);
  assert.equal(url.searchParams.get("product"), configuration.productId);
  assert.equal(url.searchParams.get("version"), configuration.productVersionId);
  assert.deepEqual(JSON.parse(url.searchParams.get("options")!), configuration.optionSelection);
  assert.equal(new URL(configurationStudioHref(configuration), origin).searchParams.has("project"), false);
  assert.equal(new URL(studioHref({ product: blenderPouchConfig.id }), origin).pathname, "/");
});

test("legacy editor routes redirect without dropping saved project or option selection", async () => {
  const selection = { product: "mailer-box-001", project: "saved-project", version: "mailer-box-001@3", options: '{"length":300}' };
  for (const page of [LegacyStudioPage, LegacyLabPage, RootAliasPage]) {
    await assert.rejects(() => page({ searchParams: Promise.resolve(selection) }), (error) => {
      assert.ok(error instanceof Error && "digest" in error);
      assert.equal(error.digest, `NEXT_REDIRECT;replace;${studioHref(selection)};307;`);
      return true;
    });
  }
  await assert.rejects(() => LegacyPouchPage({ searchParams: Promise.resolve({}) }), (error) => {
    assert.ok(error instanceof Error && "digest" in error);
    assert.equal(error.digest, `NEXT_REDIRECT;replace;${studioHref({ product: blenderPouchConfig.id })};307;`);
    return true;
  });
});

test("the Blender master is a library product while structural folding remains available", () => {
  assert.equal(getProduct(blenderPouchConfig.id), blenderPouchConfig);
  assert.equal(blenderPouchConfig.hidden, undefined);
  assert.equal(blenderPouchConfig.previewOnly, true);
  assert.equal(resolveStudioScenePresentation(blenderPouchConfig).background, "#ffffff");
  assert.equal(resolveProductPresentation(mailerBoxProduct).mode, "progressive-unfold");
  // A pouch's empty pose is not a certified flat manufacturing dieline.
  assert.equal(resolveProductPresentation(blenderPouchConfig).mode, "static");
});

test("the shared renderer resolves every Blender primitive and inflates a clone without changing its UV atlas", async () => {
  const bytes = readFileSync(new URL("../../public/models/blender-stand-up-pouch-v3.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
  const model = gltf.scene.clone(true);
  const surface = blenderPouchConfig.editableSurfaces[0];
  const meshes = editableMeshes(model, surface);
  assert.ok(meshes.length >= 4, "all material primitives must receive artwork");
  assert.deepEqual(validateProductModel(model, blenderPouchConfig).errors, []);
  const sourceWeights = editableMeshes(gltf.scene, surface).map((mesh) => [...mesh.morphTargetInfluences!]);
  const uv = meshes.map((mesh) => Array.from(mesh.geometry.getAttribute("uv").array));
  const matrices = meshes.map((mesh) => mesh.matrix.toArray());
  const target = blenderPouchConfig.inflation!.targetName;
  for (const value of [0, 0.5, 1, 0]) {
    applyInflation(model, target, value);
    meshes.forEach((mesh, index) => {
      assert.equal(mesh.morphTargetInfluences![mesh.morphTargetDictionary![target]], value);
      assert.deepEqual(Array.from(mesh.geometry.getAttribute("uv").array), uv[index]);
      assert.deepEqual(mesh.matrix.toArray(), matrices[index]);
    });
  }
  assert.deepEqual(editableMeshes(gltf.scene, surface).map((mesh) => mesh.morphTargetInfluences), sourceWeights);
  const texture = new THREE.CanvasTexture({} as HTMLCanvasElement);
  configureDesignTexture(texture, 16, surface.textureFlipY);
  assert.equal(texture.flipY, false);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  texture.dispose();

  meshes[0].morphTargetDictionary = {};
  assert.match(validateProductModel(model, blenderPouchConfig).errors.join(" "), /missing the Inflation shape key/);
});
