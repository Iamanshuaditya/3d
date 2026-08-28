import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPacdoraLabPouchGeometry,
  createPacdoraLabStudioConfig,
  createPacdoraLabStudioDieline,
  getPacdoraLabMaterial,
  getPacdoraLabPouchPanelUv,
  getPacdoraLabStandUpHangHole,
  PACDORA_LAB_EDITOR_PX_PER_MM,
  constrainPouchLabInput,
  getPouchDimensionLimits,
  resolvePacdoraLabBoxFoldPose,
  samplePacdoraLabStandUpSurface,
  solvePacdoraLabBox,
  solvePacdoraLabPouch,
} from "@/lib/pacdora-lab";
import {
  standUpFaceCrownMask,
  standUpLensDepthMask,
} from "@/lib/packaging/stand-up-profile";

function geometryCoversPointInXY(
  geometry: ReturnType<typeof buildPacdoraLabPouchGeometry>,
  x: number,
  y: number,
): boolean {
  const positions = geometry.getAttribute("position");
  const indices = geometry.getIndex();
  if (!indices) return false;
  const signedArea = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    px: number,
    py: number,
  ) => (px - bx) * (ay - by) - (ax - bx) * (py - by);
  for (let index = 0; index < indices.count; index += 3) {
    const a = indices.getX(index);
    const b = indices.getX(index + 1);
    const c = indices.getX(index + 2);
    const d1 = signedArea(
      positions.getX(a), positions.getY(a),
      positions.getX(b), positions.getY(b),
      x, y,
    );
    const d2 = signedArea(
      positions.getX(b), positions.getY(b),
      positions.getX(c), positions.getY(c),
      x, y,
    );
    const d3 = signedArea(
      positions.getX(c), positions.getY(c),
      positions.getX(a), positions.getY(a),
      x, y,
    );
    const hasNegative = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
    const hasPositive = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
    if (!(hasNegative && hasPositive)) return true;
  }
  return false;
}

test("research assets start with neutral white board and film", () => {
  assert.equal(getPacdoraLabMaterial("folding-board", "rigid").color, "#ffffff");
  assert.equal(getPacdoraLabMaterial("matte-film", "film").color, "#ffffff");
  const glossy = getPacdoraLabMaterial("glossy-film", "film");
  assert.equal(glossy.color, "#ffffff");
  assert.ok(glossy.roughness < 0.1);
  assert.equal(glossy.metalness, 0.03);
});

test("stand-up gusset is a sharp-ended lens with one centre crown", () => {
  assert.equal(standUpLensDepthMask(0), 1);
  assert.ok(Math.abs(standUpLensDepthMask(0.5) - Math.SQRT1_2) < 1e-12);
  assert.equal(standUpLensDepthMask(-1), 0);
  assert.equal(standUpLensDepthMask(1), 0);
  assert.equal(standUpFaceCrownMask(0), 1);
  assert.ok(standUpFaceCrownMask(0.25) > standUpFaceCrownMask(0.5));
  assert.ok(standUpFaceCrownMask(0.5) > standUpFaceCrownMask(0.75));
});

test("pouch UI limits clamp coupled dimensions before geometry can collapse", () => {
  const unsafe = {
    style: "stand-up" as const,
    width: -500,
    height: 9999,
    depth: 999,
    materialId: "matte-film",
    inflation: 8,
    endSealMm: 400,
    backSealMm: -3,
    gussetMm: 900,
    zipper: true,
    hangHole: true,
  };
  const safe = constrainPouchLabInput(unsafe);
  const limits = getPouchDimensionLimits(safe);

  assert.equal(safe.width, limits.width.min);
  assert.equal(safe.height, limits.height.max);
  assert.equal(safe.gussetMm, limits.gussetMm.max);
  assert.equal(safe.depth, limits.depth.max);
  assert.equal(safe.endSealMm, limits.endSealMm.max);
  assert.equal(safe.backSealMm, limits.backSealMm.min);
  assert.equal(safe.inflation, 1);
});

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

test("mailer variants share shaped cut profiles between the dieline and 3D model", () => {
  const constructions = ["roll-end", "ear-lock", "display"] as const;
  const signatures = new Set<string>();

  for (const construction of constructions) {
    const solution = solvePacdoraLabBox({
      dimensions: { length: 169, width: 169, height: 117.5 },
      dimensionMode: "manufacture",
      materialId: "folding-board",
      construction,
    });
    const shaped = solution.panels.filter((panel) => panel.outline);
    assert.equal(solution.construction, construction);
    assert.ok(shaped.length >= 9);
    assert.ok(shaped.some((panel) => panel.id === "lid-tuck"));
    assert.ok(shaped.some((panel) => panel.id === "front-lock"));
    for (const panel of shaped) {
      assert.ok(panel.outline && panel.outline.length >= 6);
      for (const point of panel.outline) {
        assert.ok(Number.isFinite(point.x) && point.x >= 0 && point.x <= panel.width);
        assert.ok(Number.isFinite(point.y) && point.y >= 0 && point.y <= panel.height);
      }
    }
    signatures.add(JSON.stringify(shaped.map((panel) => panel.outline)));
  }

  assert.equal(signatures.size, constructions.length);
});

test("mailer flaps stay connected to their crease and cannot extend below the base", () => {
  const solution = solvePacdoraLabBox({
    dimensions: { length: 60, width: 50, height: 20 },
    dimensionMode: "manufacture",
    materialId: "folding-board",
    construction: "ear-lock",
  });
  const lidTuck = solution.panels.find((panel) => panel.id === "lid-tuck")!;
  const backDust = solution.panels.find((panel) => panel.id === "back-left-dust")!;
  const frontDust = solution.panels.find((panel) => panel.id === "front-left-dust")!;
  const frontLock = solution.panels.find((panel) => panel.id === "front-lock")!;
  assert.ok(lidTuck.height < solution.manufacture.height);
  assert.ok(frontLock.height < solution.manufacture.height);
  assert.ok(lidTuck.outline?.some((point) => Math.abs(point.y - lidTuck.height) < 0.001));
  assert.ok(backDust.outline?.some((point) => Math.abs(point.y - backDust.height) < 0.001));
  assert.ok(frontDust.outline?.some((point) => Math.abs(point.y) < 0.001));

  for (const fold of [-1, 0, 0.18, 0.43, 0.72, 1, 2]) {
    const pose = resolvePacdoraLabBoxFoldPose(fold);
    for (const angle of Object.values(pose)) {
      assert.ok(Number.isFinite(angle));
      assert.ok(angle >= 0 && angle <= Math.PI * 0.5);
    }
  }
  assert.ok(Object.values(resolvePacdoraLabBoxFoldPose(0)).every((angle) => angle === 0));
  assert.ok(Object.values(resolvePacdoraLabBoxFoldPose(1)).every((angle) => Math.abs(angle - Math.PI * 0.5) < 1e-12));
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

  assert.ok(Math.abs(lowerBody.z - middleBody.z) < 1e-12);
  assert.ok(fillShoulder.z < lowerBody.z * 0.66);
  assert.ok(headspace.z < lowerBody.z * 0.28);
  assert.ok(lowerBody.z > upperBody.z);
  assert.ok(upperBody.z > topSeal.z);
  assert.ok(Math.abs(bottomSeal.z - middleBody.z) < 1e-12);
  assert.ok(topSeal.z < middleBody.z * 0.05);
  assert.ok(quarterFace.z > middleBody.z * 0.84);
  assert.ok(quarterFace.z < middleBody.z * 0.89);
  assert.ok(sideSeal.z < upperBody.z * 0.1);
  assert.ok(Math.abs(bottomCorner.y - bottomCentre.y) < 1e-12);
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

  const segmentsAcross = 14;
  const segmentsUp = 18;
  const geometry = buildPacdoraLabPouchGeometry(solution, segmentsAcross, segmentsUp);
  assert.equal(geometry.userData.pacdoraLab.kind, "procedural-stand-up-pouch");
  assert.equal(geometry.userData.pacdoraLab.topology, "front-back-bottom-gusset");
  assert.equal(geometry.userData.pacdoraLab.features.hangHole, true);
  assert.equal(geometry.userData.pacdoraLab.features.inflationProfile, "single-centre-crown");
  assert.equal(geometry.userData.pacdoraLab.features.gussetProfile, "sharp-lens-two-facet");
  assert.equal(geometry.userData.pacdoraLab.features.gussetFootprint, "single-clean-perimeter");
  assert.equal(geometry.userData.pacdoraLab.features.sideSealTopology, "single-fused-rail");
  assert.equal(geometry.userData.pacdoraLab.features.hangHoleProfile, "round-triangulated-aperture");
  assert.ok(geometry.getAttribute("position").count > 2 * 15 * 19);
  assert.ok(geometry.boundingBox);
  const sealedWidth = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
  assert.ok(Math.abs(sealedWidth - 1.74) < 0.002);
  assert.ok(Math.abs(geometry.boundingBox.min.y + 1.05) < 0.002);

  // The fused side rails remain exactly vertical through the gusset entry.
  // A reduced final extension would create the visible triangular cutout.
  const positions = geometry.getAttribute("position");
  const row = segmentsAcross + 1;
  const faceVertexCount = row * (segmentsUp + 1);
  const leftRailStart = faceVertexCount * 2;
  const railVertexCount = (segmentsUp + 1) * 2;
  const rightRailStart = leftRailStart + railVertexCount;
  for (let yIndex = 0; yIndex <= segmentsUp; yIndex++) {
    assert.ok(Math.abs(positions.getX(leftRailStart + yIndex * 2 + 1) + 0.87) < 1e-6);
    assert.ok(Math.abs(positions.getX(rightRailStart + yIndex * 2 + 1) - 0.87) < 1e-6);
  }

  const solidGeometry = buildPacdoraLabPouchGeometry(
    solvePacdoraLabPouch({ ...solution.input, hangHole: false }),
    14,
    18,
  );
  const hangHole = getPacdoraLabStandUpHangHole(solution.input);
  const holeCentreX = 0;
  const holeCentreY = hangHole.centreYmm * 0.01;
  assert.equal(geometryCoversPointInXY(geometry, holeCentreX, holeCentreY), false);
  assert.equal(geometryCoversPointInXY(solidGeometry, holeCentreX, holeCentreY), true);
  solidGeometry.dispose();
  geometry.dispose();
});

test("Studio uses one continuous pouch web across Front, gusset, and Back", () => {
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
  const config = createPacdoraLabStudioConfig(solution);
  const surface = config.editableSurfaces[0];
  const dieline = createPacdoraLabStudioDieline(solution);
  const front = surface.sections?.find((section) => section.id === "front-film");
  const gusset = surface.sections?.find((section) => section.id === "bottom-gusset");
  const back = surface.sections?.find((section) => section.id === "back-film");

  assert.equal(config.previewOnly, true);
  assert.equal(config.editableSurfaces.length, 1);
  assert.equal(surface.presentation?.kind, "continuous-web");
  assert.equal(surface.defaultBackground, "#ffffff");
  assert.equal(surface.editorWidth, solution.web.width * PACDORA_LAB_EDITOR_PX_PER_MM);
  assert.equal(surface.editorHeight, solution.web.height * PACDORA_LAB_EDITOR_PX_PER_MM);
  assert.ok(front && gusset && back);
  assert.equal(back.yCm + back.heightCm, gusset.yCm);
  assert.equal(gusset.yCm + gusset.heightCm, front.yCm);
  assert.equal(front.contentRotation, 180);
  assert.equal(back.contentRotation, 0);
  assert.deepEqual(
    surface.sections?.slice(0, 3).map((section) => section.id),
    ["front-film", "bottom-gusset", "back-film"],
  );
  assert.deepEqual(
    dieline.regions?.map((region) => region.id),
    solution.panels.map((panel) => panel.id),
  );
});

test("stand-up bottom perimeter is a centre-driven lens, not a rounded rectangle", () => {
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
  const centre = samplePacdoraLabStandUpSurface(solution, 0.5, 0, 1).z;
  const quarter = samplePacdoraLabStandUpSurface(solution, 0.75, 0, 1).z;
  const nearEdge = samplePacdoraLabStandUpSurface(solution, 0.9, 0, 1).z;
  const edge = samplePacdoraLabStandUpSurface(solution, 1, 0, 1).z;
  const filmHalfScene = Math.max(solution.material.caliperMm * 0.5, 0.035) * 0.01;

  assert.ok(centre > quarter && quarter > nearEdge && nearEdge > edge);
  assert.ok(Math.abs(edge - filmHalfScene) < 1e-12);
  const quarterRatio = (quarter - filmHalfScene) / (centre - filmHalfScene);
  assert.ok(quarterRatio > 0.70 && quarterRatio < 0.715);
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

  // The continuous web must meet at the same UV on both fold boundaries.
  // Mirroring the back face here would split artwork at the gusset seam.
  const lateral = 0.23;
  const backBottom = getPacdoraLabPouchPanelUv(solution, "back-film", lateral, 0);
  const gussetBack = getPacdoraLabPouchPanelUv(solution, "bottom-gusset", lateral, 1);
  const frontBottom = getPacdoraLabPouchPanelUv(solution, "front-film", 1 - lateral, 1);
  const gussetFront = getPacdoraLabPouchPanelUv(solution, "bottom-gusset", 1 - lateral, 0);
  assert.ok(backBottom.distanceTo(gussetBack) < 1e-12);
  assert.ok(frontBottom.distanceTo(gussetFront) < 1e-12);
});

test("custom pouch surface controls are finite and clamped", () => {
  const solution = solvePacdoraLabPouch({
    style: "stand-up",
    width: 150,
    height: 210,
    depth: 42,
    materialId: "glossy-film",
    surface: {
      roughness: -2,
      metalness: 4,
      transmission: Number.NaN,
      opacity: 0.72,
    },
    inflation: 1,
    endSealMm: 12,
    backSealMm: 14,
    gussetMm: 62,
    zipper: true,
    hangHole: true,
  });
  assert.equal(solution.material.roughness, 0);
  assert.equal(solution.material.metalness, 1);
  assert.equal(solution.material.transmission, 0);
  assert.equal(solution.material.opacity, 0.72);
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
  assert.ok(Math.abs(fullBottom.z - fullMiddle.z) < 1e-12);
});
