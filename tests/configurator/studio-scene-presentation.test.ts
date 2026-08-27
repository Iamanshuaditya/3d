import assert from "node:assert/strict";
import test from "node:test";
import {
  frameDistanceForSphere,
  resolveStudioScenePresentation,
  shouldRefitExtent,
} from "@/lib/configurator/studio-scene-presentation";
import { contrastRatio } from "@/lib/qa/product-experience-gates";

test("studio profiles cover white, dark, clear, carton, and card presentation cases", () => {
  const whitePouch = resolveStudioScenePresentation({ materialProfile: "glossy-laminate" });
  const darkPouch = resolveStudioScenePresentation({ materialProfile: "glossy-laminate" });
  const clearPouch = resolveStudioScenePresentation({ materialProfile: "clear-barrier-gloss" });
  const carton = resolveStudioScenePresentation({ materialProfile: "kraft-corrugated" });
  const card = resolveStudioScenePresentation({ materialProfile: "kraft-cardstock" });

  assert.equal(whitePouch.background, "#8a94a3");
  assert.equal(darkPouch.background, whitePouch.background);
  assert.equal(carton.background, card.background, "both kraft substrates share a profile");
  assert.equal(clearPouch.lighting, "clear-film");
  assert.equal(clearPouch.environment, false, "local reflection map stays authoritative");
  assert.notEqual(clearPouch.background, "#ffffff");
  assert.notEqual(whitePouch.background, "#000000");
});

/**
 * Kraft board sits at almost exactly the luminance of the neutral print-studio
 * grey. Asserting the measured separation rather than a literal colour keeps
 * the requirement — a readable silhouette — true through any future retune.
 */
test("every substrate keeps a readable silhouette against its own background", () => {
  const cases = [
    { substrate: "#ffffff", profile: "glossy-laminate" as const, label: "white film" },
    { substrate: "#111111", profile: "glossy-laminate" as const, label: "dark artwork" },
    { substrate: "#b78b57", profile: "kraft-cardstock" as const, label: "kraft card" },
    { substrate: "#ad8352", profile: "kraft-corrugated" as const, label: "kraft corrugate" },
  ];
  for (const entry of cases) {
    const background = resolveStudioScenePresentation({
      materialProfile: entry.profile,
    }).background;
    const ratio = contrastRatio(entry.substrate, background);
    assert.ok(ratio !== null, `${entry.label}: colours must be comparable`);
    assert.ok(
      ratio > 1.5,
      `${entry.label} (${entry.substrate}) only reaches ${ratio?.toFixed(2)}:1 against ` +
        `${background}; below 1.5:1 the product edge disappears into the preview`,
    );
  }
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

