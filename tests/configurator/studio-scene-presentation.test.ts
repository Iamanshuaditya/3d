import assert from "node:assert/strict";
import test from "node:test";
import {
  frameDistanceForSphere,
  resolveStudioScenePresentation,
  shouldRefitExtent,
} from "@/lib/configurator/studio-scene-presentation";

test("studio profiles cover white, dark, clear, carton, and card presentation cases", () => {
  const whitePouch = resolveStudioScenePresentation({ materialProfile: "glossy-laminate" });
  const darkPouch = resolveStudioScenePresentation({ materialProfile: "glossy-laminate" });
  const clearPouch = resolveStudioScenePresentation({ materialProfile: "clear-barrier-gloss" });
  const carton = resolveStudioScenePresentation({ materialProfile: "kraft-corrugated" });
  const card = resolveStudioScenePresentation({ materialProfile: "kraft-cardstock" });

  assert.equal(whitePouch.background, "#8a94a3");
  assert.equal(darkPouch.background, whitePouch.background);
  assert.equal(carton.background, whitePouch.background);
  assert.equal(card.background, whitePouch.background);
  assert.equal(clearPouch.lighting, "clear-film");
  assert.equal(clearPouch.environment, false, "local reflection map stays authoritative");
  assert.notEqual(clearPouch.background, "#ffffff");
  assert.notEqual(whitePouch.background, "#000000");
});

test("sphere framing is stable across portrait and landscape viewports", () => {
  const portrait = frameDistanceForSphere({
    radius: 1,
    verticalFovDeg: 32,
    aspect: 0.5,
    padding: 1.14,
    minDistance: 0.2,
    maxDistance: 20,
  });
  const landscape = frameDistanceForSphere({
    radius: 1,
    verticalFovDeg: 32,
    aspect: 2,
    padding: 1.14,
    minDistance: 0.2,
    maxDistance: 20,
  });
  assert.ok(portrait > landscape, "horizontal FOV must bind in a narrow viewport");
  assert.ok(landscape > 3.9 && landscape < 4.2);
});

test("framing clamps to authored orbit limits", () => {
  assert.equal(frameDistanceForSphere({
    radius: 0.001,
    verticalFovDeg: 32,
    aspect: 1,
    padding: 1.14,
    minDistance: 2,
    maxDistance: 10,
  }), 2);
  assert.equal(frameDistanceForSphere({
    radius: 100,
    verticalFovDeg: 32,
    aspect: 1,
    padding: 1.14,
    minDistance: 2,
    maxDistance: 10,
  }), 10);
});

test("auto-frame reacts only to initial or material extent changes", () => {
  assert.equal(shouldRefitExtent(null, 1), true);
  assert.equal(shouldRefitExtent(1, 1.049), false);
  assert.equal(shouldRefitExtent(1, 1.051), true);
  assert.equal(shouldRefitExtent(1, 0), false);
});

