import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDielinePresentation,
  DEFAULT_DIELINE_GUIDE_VISIBILITY,
  resolveDielineGuideStyle,
  visibleDielinePresentationItems,
} from "@/lib/configurator/dieline-presentation";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import { kraftVisitingCardProduct } from "@/lib/configurator/kraft-visiting-card-spec";
import type { DielinePath, SurfaceDieline } from "@/types/configurator";

const cut: DielinePath = { points: [0, 0, 100, 0, 100, 100, 0, 100], closed: true };
const crease: DielinePath = { points: [50, 0, 50, 100], closed: false };
const bleed: DielinePath = { points: [-3, -3, 103, -3, 103, 103, -3, 103], closed: true };
const safe: DielinePath = { points: [5, 5, 95, 5, 95, 95, 5, 95], closed: true };
const technical: DielinePath = { points: [0, 10, 100, 10], closed: false };

function fixture(): SurfaceDieline {
  return {
    cuts: [cut],
    creases: [crease],
    bleed: [bleed],
    safety: [safe],
    technical: [technical],
    references: [{ id: "source-mark", label: "Source mark", points: [20, 0, 20, 100] }],
    regions: [
      {
        id: "front",
        label: "Front panel",
        role: "artwork",
        x: 10,
        y: 10,
        width: 40,
        height: 80,
      },
      {
        id: "seal",
        label: "Seal band",
        role: "technical",
        x: 0,
        y: 0,
        width: 100,
        height: 10,
      },
    ],
  };
}

test("semantic presentation references exact source paths without rewriting geometry", () => {
  const dieline = fixture();
  const before = JSON.stringify(dieline);
  const items = buildDielinePresentation(dieline);

  const pathByClass = (guideClass: "cut" | "crease" | "bleed" | "safe" | "technical") => {
    const item = items.find(
      (candidate) => candidate.shape === "path" && candidate.guideClass === guideClass,
    );
    assert.ok(item?.shape === "path");
    return item.path;
  };

  assert.equal(pathByClass("cut"), cut);
  assert.equal(pathByClass("crease"), crease);
  assert.equal(pathByClass("bleed"), bleed);
  assert.equal(pathByClass("safe"), safe);
  assert.equal(pathByClass("technical"), technical);
  assert.equal(JSON.stringify(dieline), before, "presentation must not mutate source geometry");
  assert.deepEqual(
    new Set(items.map((item) => item.guideClass)),
    new Set(["cut", "crease", "bleed", "safe", "technical", "panel"]),
  );
});

test("master and per-class toggles only filter the presentation model", () => {
  const items = buildDielinePresentation(fixture());
  assert.equal(visibleDielinePresentationItems(items, false).length, 0);
  assert.equal(
    visibleDielinePresentationItems(items, true).length,
    items.length,
    "all semantic classes are visible by default",
  );

  const withoutTechnical = visibleDielinePresentationItems(items, true, {
    ...DEFAULT_DIELINE_GUIDE_VISIBILITY,
    technical: false,
  });
  assert.ok(withoutTechnical.length < items.length);
  assert.ok(withoutTechnical.every((item) => item.guideClass !== "technical"));
  assert.equal(fixture().technical?.[0], technical, "filtering never edits dieline data");
});

test("guide strokes and dash patterns remain screen-consistent from 25% to 200%", () => {
  for (const guideClass of ["cut", "crease", "bleed", "safe", "technical", "panel"] as const) {
    const at25 = resolveDielineGuideStyle(guideClass, 0.25);
    const at200 = resolveDielineGuideStyle(guideClass, 2);
    assert.ok(Math.abs(at25.strokeWidth * 0.25 - at200.strokeWidth * 2) < 1e-12);
    assert.deepEqual(
      at25.dash?.map((value) => value * 0.25),
      at200.dash?.map((value) => value * 2),
    );
  }
});

test("rectangular print layouts expose separate exact bleed, trim, safe, and technical guides", () => {
  const surface = kraftVisitingCardProduct.editableSurfaces[0];
  const dieline = resolveSurfaceDieline(kraftVisitingCardProduct, surface);
  const layout = surface.rectangularLayout;
  assert.ok(layout);

  assert.deepEqual(dieline.bleed?.[0].points, [
    0, 0,
    surface.editorWidth, 0,
    surface.editorWidth, surface.editorHeight,
    0, surface.editorHeight,
  ]);
  assert.deepEqual(dieline.cuts[0].points, [30, 30, 919, 30, 919, 538, 30, 538]);
  assert.deepEqual(dieline.safety?.[0].points, [60, 60, 889, 60, 889, 508, 60, 508]);
  assert.equal(dieline.technical?.length, 2);
});
