import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GOLDEN_REFERENCE_REQUIRED_CAPTURES,
  createGoldenReferenceVisualReviewTemplate,
  evaluateGoldenReferenceVisualReview,
  type GoldenReferenceVisualReviewInput,
} from "@/lib/structure";

function passingReview(): GoldenReferenceVisualReviewInput {
  return {
    schemaVersion: 1,
    candidateId: "north-plain-final-0.600mm",
    reviewer: "independent-checker",
    referenceEvidence: "supplied reference video/screenshots",
    captures: GOLDEN_REFERENCE_REQUIRED_CAPTURES.map((id) => ({
      id,
      evidencePath: `.quality-local/golden-reference/captures/${id}.png`,
      notes: `reviewed ${id}`,
    })),
    hardGates: {
      canonicalFlatMatchesSource: true,
      windowRemainsPhysicalVoid: true,
      artworkChiralityCorrect: true,
      noPanelSwap: true,
      noArtworkJumpAcrossCreases: true,
      hingesCoincideWithSourceCreases: true,
      cameraStableAcross3dCaptures: true,
      forwardBackwardUseSameAbsoluteTargets: true,
      noBounceOrSpringOvershoot: true,
      manufacturingUsesCanonicalStructuralAuthority: true,
    },
    scores: {
      geometryAlignment: 10,
      mappingContinuity: 10,
      foldPoseMatch: 9,
      motionMatch: 7,
      cadVisualQuality: 5,
      materialLightingPresentation: 5,
    },
  };
}

test("golden visual reference passes only with complete hard gates and >=45/50", () => {
  const report = evaluateGoldenReferenceVisualReview(passingReview());
  assert.equal(report.score, 46);
  assert.equal(report.scoreOutOf, 50);
  assert.equal(report.threshold, 45);
  assert.deepEqual(report.missingCaptures, []);
  assert.deepEqual(report.failedHardGates, []);
  assert.equal(report.passed, true);
});

test("one failed visual hard gate blocks a high-scoring review", () => {
  const base = passingReview();
  const report = evaluateGoldenReferenceVisualReview({
    ...base,
    hardGates: { ...base.hardGates, artworkChiralityCorrect: false },
    scores: {
      geometryAlignment: 10,
      mappingContinuity: 10,
      foldPoseMatch: 10,
      motionMatch: 8,
      cadVisualQuality: 6,
      materialLightingPresentation: 6,
    },
  });
  assert.equal(report.score, 50);
  assert.deepEqual(report.failedHardGates, ["artworkChiralityCorrect"]);
  assert.equal(report.passed, false);
});

test("missing or duplicate required captures block visual acceptance", () => {
  const base = passingReview();
  const missing = evaluateGoldenReferenceVisualReview({ ...base, captures: base.captures.slice(1) });
  assert.deepEqual(missing.missingCaptures, ["01-flat-2d"]);
  assert.equal(missing.passed, false);

  const duplicate = evaluateGoldenReferenceVisualReview({
    ...base,
    captures: [...base.captures, base.captures[0]],
  });
  assert.deepEqual(duplicate.duplicateCaptures, ["01-flat-2d"]);
  assert.equal(duplicate.passed, false);
});

test("44/50 is still a fail", () => {
  const base = passingReview();
  const report = evaluateGoldenReferenceVisualReview({
    ...base,
    scores: {
      geometryAlignment: 9,
      mappingContinuity: 9,
      foldPoseMatch: 9,
      motionMatch: 7,
      cadVisualQuality: 5,
      materialLightingPresentation: 5,
    },
  });
  assert.equal(report.score, 44);
  assert.equal(report.gates.scoreThreshold, false);
  assert.equal(report.passed, false);
});

test("score values cannot exceed their category maxima", () => {
  const base = passingReview();
  assert.throws(
    () => evaluateGoldenReferenceVisualReview({
      ...base,
      scores: { ...base.scores, motionMatch: 9 },
    }),
    /motionMatch must be finite in \[0, 8\]/,
  );
});

test("visual review template is deliberately fail-closed", () => {
  const template = createGoldenReferenceVisualReviewTemplate("north-plain-final-0.600mm");
  const report = evaluateGoldenReferenceVisualReview(template);
  assert.equal(template.captures.length, 6);
  assert.equal(report.score, 0);
  assert.equal(report.passed, false);
  assert.ok(report.failedHardGates.length > 0);
});
