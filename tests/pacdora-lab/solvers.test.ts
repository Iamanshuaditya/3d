import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPacdoraLabPouchGeometry,
  samplePacdoraLabStandUpSurface,
  solvePacdoraLabBox,
  solvePacdoraLabPouch,
} from "@/lib/pacdora-lab";

test("E-flute research profile reproduces the observed Pacdora dimension triplet", () => {
  const solution = solvePacdoraLabBox({
    dimensions: { length: 169, width: 169, height: 117.5 },
    dimensionMode: "manufacture",
    materialId: "e-flute",
  });
  assert.deepEqual(solution.inner, { length: 167, width: 167, height: 115.5 });
  assert.deepEqual(solution.outer, { length: 170, width: 170, height: 120 });
  assert.equal(solution.material.caliperMm, 1.5);
});

test("caliper changes both the dimension conversion and the generated blank", () => {
  const eFlute = solvePacdoraLabBox({
    dimensions: { length: 180, width: 140, height: 60 },
    dimensionMode: "inner",
    materialId: "e-flute",
  });
  const bFlute = solvePacdoraLabBox({
    dimensions: { length: 180, width: 140, height: 60 },
    dimensionMode: "inner",
    materialId: "b-flute",
  });
  assert.ok(bFlute.manufacture.length > eFlute.manufacture.length);
  assert.ok(bFlute.manufacture.height > eFlute.manufacture.height);
  assert.ok(bFlute.blank.width > eFlute.blank.width);
  assert.ok(bFlute.blank.height > eFlute.blank.height);
});

test("center-seal pouch keeps its flat web while inflation changes body depth", () => {
  const base = {
    style: "center-seal" as const,
    width: 130,
    height: 200,
    depth: 58,
    materialId: "matte-film",
    endSealMm: 12,
    backSealMm: 14,
    gussetMm: 58,
    zipper: false,
  };
  const flat = solvePacdoraLabPouch({ ...base, inflation: 0.1 });
  const inflated = solvePacdoraLabPouch({ ...base, inflation: 0.9 });
  assert.deepEqual(flat.web, inflated.web);
  assert.equal(flat.web.width, 274);
  assert.equal(flat.web.height, 224);
  assert.ok(inflated.inflatedDepth > flat.inflatedDepth);
});

test("pouch geometry is regenerated with finite positions and manufacturing metadata", () => {
  const solution = solvePacdoraLabPouch({
    style: "center-seal",
    width: 130,
    height: 200,
    depth: 58,
    materialId: "foil-film",
    inflation: 0.78,
    endSealMm: 12,
    backSealMm: 14,
    gussetMm: 58,
    zipper: false,
  });
  const geometry = buildPacdoraLabPouchGeometry(solution, 12, 16);
  const positions = geometry.getAttribute("position");
  assert.ok(positions.count > 0);
  for (let index = 0; index < positions.count; index++) {
    assert.ok(Number.isFinite(positions.getX(index)));
    assert.ok(Number.isFinite(positions.getY(index)));
    assert.ok(Number.isFinite(positions.getZ(index)));
  }
  assert.equal(geometry.userData.pacdoraLab.kind, "procedural-center-seal-pouch");
  assert.equal(geometry.userData.pacdoraLab.dimensionsMm.depth, solution.inflatedDepth);
  geometry.dispose();
});

test("stand-up surface has Pacdora-like top taper, sealed sides, and lifted gusset corners", () => {
  const solution = solvePacdoraLabPouch({
    style: "stand-up",
    width: 150,
    height: 210,
    depth: 68,
    materialId: "matte-film",
    inflation: 0.82,
    endSealMm: 12,
    backSealMm: 14,
    gussetMm: 62,
    zipper: true,
  });
  const lowerBody = samplePacdoraLabStandUpSurface(solution, 0.5, 0.28, 1);
  const upperBody = samplePacdoraLabStandUpSurface(solution, 0.5, 0.78, 1);
  const topSeal = samplePacdoraLabStandUpSurface(solution, 0.5, 0.98, 1);
  const sideSeal = samplePacdoraLabStandUpSurface(solution, 0.99, 0.5, 1);
  const bottomCentre = samplePacdoraLabStandUpSurface(solution, 0.5, 0, 1);
  const bottomCorner = samplePacdoraLabStandUpSurface(solution, 0.01, 0, 1);

  assert.ok(lowerBody.z > upperBody.z);
  assert.ok(upperBody.z > topSeal.z);
  assert.ok(sideSeal.z < upperBody.z * 0.1);
  assert.ok(bottomCorner.y > bottomCentre.y);
});

test("stand-up pouch has a separate gusset web and generated bottom membrane", () => {
  const solution = solvePacdoraLabPouch({
    style: "stand-up",
    width: 150,
    height: 210,
    depth: 68,
    materialId: "matte-film",
    inflation: 0.84,
    endSealMm: 12,
    backSealMm: 14,
    gussetMm: 62,
    zipper: true,
  });
  assert.deepEqual(solution.web, { width: 174, height: 506 });
  assert.equal(solution.panels.find((panel) => panel.id === "bottom-gusset")?.height, 62);
  assert.ok(solution.lines.some((line) => line.id === "zipper-line"));

  const geometry = buildPacdoraLabPouchGeometry(solution, 14, 18);
  assert.equal(geometry.userData.pacdoraLab.kind, "procedural-stand-up-pouch");
  assert.equal(geometry.userData.pacdoraLab.topology, "front-back-bottom-gusset");
  assert.ok(geometry.getAttribute("position").count > 2 * 15 * 19);
  geometry.dispose();
});
