import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPacdoraLabPouchGeometry,
  getPacdoraLabPouchPanelUv,
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
    hangHole: false,
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
    hangHole: false,
  });
  const geometry = buildPacdoraLabPouchGeometry(solution, 12, 16);
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  assert.ok(positions.count > 0);
  assert.equal(uvs.count, positions.count);
  for (let index = 0; index < positions.count; index++) {
    assert.ok(Number.isFinite(positions.getX(index)));
    assert.ok(Number.isFinite(positions.getY(index)));
    assert.ok(Number.isFinite(positions.getZ(index)));
    assert.ok(Number.isFinite(uvs.getX(index)));
    assert.ok(Number.isFinite(uvs.getY(index)));
    assert.ok(uvs.getX(index) >= 0 && uvs.getX(index) <= 1);
    assert.ok(uvs.getY(index) >= 0 && uvs.getY(index) <= 1);
  }
  assert.equal(geometry.userData.pacdoraLab.kind, "procedural-center-seal-pouch");
  assert.equal(geometry.userData.pacdoraLab.dimensionsMm.depth, solution.inflatedDepth);
  geometry.dispose();
});

test("stand-up surface keeps an open lower body and pinches only the top seal", () => {
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
    hangHole: true,
  });
  const bottomSeal = samplePacdoraLabStandUpSurface(solution, 0.5, 0, 1);
  const lowerBody = samplePacdoraLabStandUpSurface(solution, 0.5, 0.28, 1);
  const middleBody = samplePacdoraLabStandUpSurface(solution, 0.5, 0.5, 1);
  const fillShoulder = samplePacdoraLabStandUpSurface(solution, 0.5, 0.6, 1);
  const headspace = samplePacdoraLabStandUpSurface(solution, 0.5, 0.72, 1);
  const quarterFace = samplePacdoraLabStandUpSurface(solution, 0.25, 0.5, 1);
  const upperBody = samplePacdoraLabStandUpSurface(solution, 0.5, 0.78, 1);
  const topSeal = samplePacdoraLabStandUpSurface(solution, 0.5, 0.98, 1);
  const sideSeal = samplePacdoraLabStandUpSurface(solution, 0.99, 0.5, 1);
  const bottomCentre = samplePacdoraLabStandUpSurface(solution, 0.5, 0, 1);
  const bottomCorner = samplePacdoraLabStandUpSurface(solution, 0.01, 0, 1);
  const leftBottomEdge = samplePacdoraLabStandUpSurface(solution, 0, 0, 1);
  const leftLowerEdge = samplePacdoraLabStandUpSurface(solution, 0, 0.18, 1);
  const leftMiddleEdge = samplePacdoraLabStandUpSurface(solution, 0, 0.5, 1);

  assert.ok(lowerBody.z > middleBody.z * 0.98);
  assert.ok(fillShoulder.z < lowerBody.z * 0.62);
  assert.ok(headspace.z < lowerBody.z * 0.28);
  assert.ok(lowerBody.z > upperBody.z);
  assert.ok(upperBody.z > topSeal.z);
  assert.ok(bottomSeal.z > middleBody.z * 1.05);
  assert.ok(bottomSeal.z < lowerBody.z * 0.93);
  assert.ok(topSeal.z < middleBody.z * 0.05);
  assert.ok(quarterFace.z > middleBody.z * 0.94);
  assert.ok(sideSeal.z < upperBody.z * 0.1);
  assert.ok(bottomCorner.y > bottomCentre.y);
  assert.ok(Math.abs(leftBottomEdge.x - leftLowerEdge.x) < 1e-12);
  assert.ok(Math.abs(leftLowerEdge.x - leftMiddleEdge.x) < 1e-12);
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
    hangHole: true,
  });
  assert.deepEqual(solution.web, { width: 174, height: 506 });
  assert.equal(solution.panels.find((panel) => panel.id === "bottom-gusset")?.height, 62);
  assert.ok(solution.lines.some((line) => line.id === "zipper-line"));

  const geometry = buildPacdoraLabPouchGeometry(solution, 14, 18);
  assert.equal(geometry.userData.pacdoraLab.kind, "procedural-stand-up-pouch");
  assert.equal(geometry.userData.pacdoraLab.topology, "front-back-bottom-gusset");
  assert.equal(geometry.userData.pacdoraLab.features.hangHole, true);
  assert.ok(geometry.getAttribute("position").count > 2 * 15 * 19);
  assert.ok(geometry.boundingBox);
  const sealedWidth = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
  assert.ok(Math.abs(sealedWidth - 1.74) < 0.002);
  assert.ok(Math.abs(geometry.boundingBox.min.y + 1.05) < 0.002);

  const solidGeometry = buildPacdoraLabPouchGeometry(
    solvePacdoraLabPouch({ ...solution.input, hangHole: false }),
    14,
    18,
  );
  assert.ok(geometry.getIndex()!.count < solidGeometry.getIndex()!.count);
  solidGeometry.dispose();
  geometry.dispose();
});

test("stand-up requested depth is capped by the gusset and package proportions", () => {
  const solution = solvePacdoraLabPouch({
    style: "stand-up",
    width: 50,
    height: 80,
    depth: 180,
    materialId: "matte-film",
    inflation: 1,
    endSealMm: 6,
    backSealMm: 14,
    gussetMm: 20,
    zipper: true,
    hangHole: false,
  });
  assert.equal(solution.inflatedDepth, 17.6);
  assert.ok(solution.assumptions.some((item) => item.includes("resolves to 17.6 mm")));
  const geometry = buildPacdoraLabPouchGeometry(solution, 12, 16);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    assert.ok(Number.isFinite(positions.getX(index)));
    assert.ok(Number.isFinite(positions.getY(index)));
    assert.ok(Number.isFinite(positions.getZ(index)));
  }
  geometry.dispose();
});

test("stand-up face UVs address the same canonical web shown by the dieline", () => {
  const solution = solvePacdoraLabPouch({
    style: "stand-up",
    width: 150,
    height: 210,
    depth: 42,
    materialId: "matte-film",
    inflation: 1,
    endSealMm: 12,
    backSealMm: 14,
    gussetMm: 62,
    zipper: true,
    hangHole: true,
  });
  const frontCentre = getPacdoraLabPouchPanelUv(
    solution,
    "front-film",
    0.5,
    0.5,
  );
  const backCentre = getPacdoraLabPouchPanelUv(
    solution,
    "back-film",
    0.5,
    0.5,
  );
  assert.ok(Math.abs(frontCentre.x - 0.5) < 1e-12);
  assert.ok(Math.abs(frontCentre.y - (1 - 389 / 506)) < 1e-12);
  assert.ok(Math.abs(backCentre.x - 0.5) < 1e-12);
  assert.ok(Math.abs(backCentre.y - (1 - 117 / 506)) < 1e-12);
});

test("stand-up inflation opens the lower gusset while preserving the flat web", () => {
  const base = {
    style: "stand-up" as const,
    width: 150,
    height: 210,
    depth: 42,
    materialId: "matte-film",
    endSealMm: 12,
    backSealMm: 14,
    gussetMm: 62,
    zipper: true,
    hangHole: true,
  };
  const flat = solvePacdoraLabPouch({ ...base, inflation: 0.1 });
  const full = solvePacdoraLabPouch({ ...base, inflation: 1 });
  const flatMiddle = samplePacdoraLabStandUpSurface(flat, 0.5, 0.5, 1);
  const fullMiddle = samplePacdoraLabStandUpSurface(full, 0.5, 0.5, 1);
  const flatBottom = samplePacdoraLabStandUpSurface(flat, 0.5, 0, 1);
  const fullBottom = samplePacdoraLabStandUpSurface(full, 0.5, 0, 1);

  assert.deepEqual(flat.web, full.web);
  assert.ok(fullMiddle.z > flatMiddle.z * 8);
  assert.ok(fullBottom.z > flatBottom.z * 8);
  assert.ok(fullBottom.z > fullMiddle.z * 1.05);
  assert.ok(fullBottom.z < fullMiddle.z * 1.15);
});
