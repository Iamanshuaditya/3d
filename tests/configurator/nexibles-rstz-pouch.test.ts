import assert from "node:assert/strict";
import test from "node:test";
import {
  NEXIBLES_RSTZ_DIMENSIONS,
  NEXIBLES_RSTZ_POUCH_ID,
  nexiblesRstzPouchSpec,
} from "@/lib/configurator/nexibles-rstz-pouch";
import { buildPouchGeometry } from "@/lib/configurator/pouch-geometry";
import {
  pouchRegionCentreUv,
  pouchRegionUv,
  pouchWebMmToUv,
  resolvePouchProductionWeb,
} from "@/lib/configurator/pouch-production-web";
import { PRODUCTS } from "@/lib/configurator/product-config";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import { createEmptyDocument } from "@/lib/configurator/design-state";
import { normalizePrintJob } from "@/lib/print/normalize-job";

const spec = nexiblesRstzPouchSpec;
const layout = resolvePouchProductionWeb(spec);
if (!layout) throw new Error("Measured Nexibles web did not resolve.");
const product = PRODUCTS[NEXIBLES_RSTZ_POUCH_ID];
const surface = product.editableSurfaces[0];

const closeTo = (actual: number, expected: number, tolerance = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("Nexibles nominal pouch and production-web dimensions stay distinct and exact", () => {
  const d = NEXIBLES_RSTZ_DIMENSIONS;
  assert.equal(spec.width, 190);
  assert.equal(spec.height, 265);
  assert.equal(spec.gusset, 110);
  assert.equal(layout.widthMm, 191.5);
  assert.equal(layout.repeatMm, 684);
  assert.equal(layout.laneCount, 1);
  assert.notEqual(spec.width, layout.widthMm);
  assert.equal(
    d.terminalTechnicalBandMm + d.frontLengthMm
      + d.transitionBandMm + d.transitionBandMm + d.gussetWebMm
      + d.transitionBandMm + d.transitionBandMm + d.backLengthMm
      + d.terminalTechnicalBandMm,
    684,
  );
});

test("every longitudinal region begins and ends at its measured millimetre position", () => {
  assert.deepEqual(
    layout.segments.map(({ id, role, lengthMm, startMm, endMm }) => ({
      id,
      role,
      lengthMm,
      startMm,
      endMm,
    })),
    [
      { id: "technical-leading", role: "technical", lengthMm: 14, startMm: 0, endMm: 14 },
      { id: "front", role: "front", lengthMm: 265, startMm: 14, endMm: 279 },
      { id: "front-transition-a", role: "technical", lengthMm: 4, startMm: 279, endMm: 283 },
      { id: "front-transition-b", role: "technical", lengthMm: 4, startMm: 283, endMm: 287 },
      { id: "gusset", role: "gusset", lengthMm: 110, startMm: 287, endMm: 397 },
      { id: "back-transition-a", role: "technical", lengthMm: 4, startMm: 397, endMm: 401 },
      { id: "back-transition-b", role: "technical", lengthMm: 4, startMm: 401, endMm: 405 },
      { id: "back", role: "back", lengthMm: 265, startMm: 405, endMm: 670 },
      { id: "technical-trailing", role: "technical", lengthMm: 14, startMm: 670, endMm: 684 },
    ],
  );
});

test("the Studio editor and print job use the complete 191.5 by 684 mm web", () => {
  assert.equal(product.pouchSpecId, NEXIBLES_RSTZ_POUCH_ID);
  assert.equal(surface.editorWidth, 766);
  assert.equal(surface.editorHeight, 2736);
  assert.equal(surface.physicalWidthCm * 10, 191.5);
  assert.equal(surface.physicalHeightCm * 10, 684);
  assert.equal(surface.displayUnit, "mm");
  assert.deepEqual(surface.presentation, { kind: "continuous-web", order: 1 });
  assert.deepEqual(
    surface.sections?.map(({ id, yCm, widthCm, heightCm, contentRotation }) => ({
      id,
      yMm: yCm * 10,
      widthMm: widthCm * 10,
      heightMm: heightCm * 10,
      contentRotation,
    })),
    [
      { id: "front", yMm: 14, widthMm: 191.5, heightMm: 265, contentRotation: 0 },
      { id: "gusset", yMm: 287, widthMm: 191.5, heightMm: 110, contentRotation: 0 },
      { id: "back", yMm: 405, widthMm: 191.5, heightMm: 265, contentRotation: 180 },
    ],
  );

  const job = normalizePrintJob(product, createEmptyDocument(product));
  assert.equal(job.surfaces[0].surface.physicalWidthCm * 10, 191.5);
  assert.equal(job.surfaces[0].surface.physicalHeightCm * 10, 684);
});

test("editor region centres map deterministically to front, gusset, and back centres", () => {
  const expectedY = { front: 146.5, gusset: 342, back: 537.5 } as const;
  for (const role of ["front", "gusset", "back"] as const) {
    const expected = pouchWebMmToUv(layout, { xMm: 95.75, yMm: expectedY[role] });
    const actual = pouchRegionCentreUv(spec, role);
    closeTo(actual.u, expected.u);
    closeTo(actual.v, expected.v);
    closeTo(actual.u, 0.5);
  }
});

test("asymmetric FRONT artwork remains upright and unmirrored", () => {
  // Diagnostic source: FRONT / ↑ TOP / L ... R.
  const topLeft = pouchRegionUv(spec, "front", 0, 1);
  const topRight = pouchRegionUv(spec, "front", 1, 1);
  const bottomLeft = pouchRegionUv(spec, "front", 0, 0);
  assert.deepEqual(topLeft, pouchWebMmToUv(layout, { xMm: 0, yMm: 14 }));
  assert.deepEqual(topRight, pouchWebMmToUv(layout, { xMm: 191.5, yMm: 14 }));
  assert.deepEqual(bottomLeft, pouchWebMmToUv(layout, { xMm: 0, yMm: 279 }));
  assert.ok(topRight.u > topLeft.u, "FRONT L/R must not be mirrored");
  assert.ok(topLeft.v > bottomLeft.v, "FRONT top must remain top");
});

test("asymmetric BACK source stays 180 degrees flat but assembles upright without mirroring", () => {
  // Diagnostic finished face: BACK / ↑ TOP / L ... R. The source is rotated 180°.
  const topLeft = pouchRegionUv(spec, "back", 0, 1);
  const topRight = pouchRegionUv(spec, "back", 1, 1);
  const bottomLeft = pouchRegionUv(spec, "back", 0, 0);
  assert.deepEqual(topLeft, pouchWebMmToUv(layout, { xMm: 191.5, yMm: 670 }));
  assert.deepEqual(topRight, pouchWebMmToUv(layout, { xMm: 0, yMm: 670 }));
  assert.deepEqual(bottomLeft, pouchWebMmToUv(layout, { xMm: 191.5, yMm: 405 }));
  assert.ok(topRight.u < topLeft.u, "BACK finished L/R requires the source's horizontal half-turn");
  assert.ok(topLeft.v < bottomLeft.v, "BACK finished top requires the source's vertical half-turn");
  const signedOrientation = (topRight.u - topLeft.u) * (topLeft.v - bottomLeft.v);
  assert.ok(signedOrientation > 0, "rotating both axes must preserve chirality, not mirror artwork");
  assert.equal(surface.sections?.find((section) => section.id === "back")?.contentRotation, 180);
});

test("surface UV ranges stay inside their own production-web regions", () => {
  const bounds = {
    front: [14, 279],
    gusset: [287, 397],
    back: [405, 670],
  } as const;
  for (const role of ["front", "gusset", "back"] as const) {
    const regionV = bounds[role].map((yMm) => 1 - yMm / 684);
    const low = Math.min(...regionV);
    const high = Math.max(...regionV);
    for (const lateral of [0, 0.17, 0.5, 0.83, 1]) {
      for (const progress of [0, 0.23, 0.5, 0.79, 1]) {
        const uv = pouchRegionUv(spec, role, lateral, progress);
        assert.ok(uv.u >= 0 && uv.u <= 1);
        assert.ok(uv.v >= low - 1e-12 && uv.v <= high + 1e-12);
      }
    }
  }
});

test("3D geometry uses nominal proportions and exposes logical flexible-film surfaces", () => {
  const mesh = buildPouchGeometry(spec);
  closeTo(mesh.size.width / mesh.size.height, 190 / 265);
  closeTo(mesh.size.width, 1.9);
  closeTo(mesh.size.height, 2.65);
  assert.deepEqual(mesh.surfaceGroups?.map((group) => group.id), [
    "front",
    "back",
    "side-seals",
    "bottom-gusset",
    "top-seal",
  ]);
  for (const group of mesh.surfaceGroups ?? []) assert.ok(group.count > 0);
  assert.deepEqual(mesh.geometry.userData.productionSurfaces, mesh.surfaceGroups);
  const uv = mesh.geometry.getAttribute("uv");
  for (let index = 0; index < uv.count; index++) {
    assert.ok(Number.isFinite(uv.getX(index)) && Number.isFinite(uv.getY(index)));
  }
  mesh.geometry.dispose();
});

test("production guides remain editor-only and retain all measured boundaries", () => {
  const dieline = resolveSurfaceDieline(product, surface);
  const mmPerEditorPxY = 684 / surface.editorHeight;
  const regions = dieline.regions ?? [];
  assert.equal(regions.length, layout.segments.length);
  regions.forEach((region, index) => {
    const segment = layout.segments[index];
    assert.equal(region.id, segment.id);
    assert.equal(region.role, segment.role === "technical" ? "technical" : "artwork");
    assert.equal(region.artworkOrientationDeg, segment.artworkOrientationDeg);
    closeTo(region.y * mmPerEditorPxY, segment.startMm);
    closeTo(region.height * mmPerEditorPxY, segment.lengthMm);
  });
  const boundaryPositions = [14, 279, 283, 287, 397, 401, 405, 670];
  dieline.references?.slice(0, -1).forEach((reference, index) => {
    closeTo(reference.points[1] * mmPerEditorPxY, boundaryPositions[index]);
  });
  const rightReference = dieline.references?.at(-1);
  assert.equal(rightReference?.id, "right-reference-10.75");
  closeTo((rightReference?.points[0] ?? 0) * (191.5 / surface.editorWidth), 180.75);

  const job = normalizePrintJob(product, createEmptyDocument(product));
  assert.equal("regions" in job.surfaces[0], false);
  assert.equal("references" in job.surfaces[0], false);
});

test("uncertain manufacturing semantics are explicit source-review metadata", () => {
  assert.deepEqual(
    layout.sourceReview.map((item) => item.id),
    ["right-reference-10.75", "hatched-zones", "circular-marks", "slitting-mark"],
  );
  assert.equal(layout.referenceGuides?.[0].meaning, "unconfirmed");
  assert.ok(layout.previewAssumptions.some((item) => item.id === "opened-body-depth"));
  assert.equal(spec.resealableZip, false);
  assert.equal(spec.notchSize, 0);
});
