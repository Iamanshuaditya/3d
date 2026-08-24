import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_HINGE_MOTION,
  GOLDEN_REFERENCE_CERTAINTIES,
  GOLDEN_REFERENCE_RECORDING,
  GOLDEN_REFERENCE_STATES,
  GOLDEN_REFERENCE_TRANSITIONS,
  GOLDEN_REFERENCE_TWEEN,
  GOLDEN_REFERENCE_UNRESOLVED,
  goldenReferenceStateIndex,
  validateGoldenReferenceEvidence,
} from "@/lib/structure";

test("golden reference behavior preserves the observed six-state order", () => {
  validateGoldenReferenceEvidence();
  assert.deepEqual(
    GOLDEN_REFERENCE_STATES.map((state) => state.id),
    ["flat", "body-forming", "body-erect", "secondary-flaps", "major-closure", "final-closure"],
  );
  assert.equal(goldenReferenceStateIndex("flat"), 0);
  assert.equal(goldenReferenceStateIndex("final-closure"), 5);
});

test("reference evidence keeps body, secondary flaps, and major closure as distinct phases", () => {
  const forward = GOLDEN_REFERENCE_TRANSITIONS.filter((transition) => transition.direction === "forward");
  assert.deepEqual(
    forward.map((transition) => transition.movingSemanticGroup),
    ["body", "secondary-flaps", "major-closure", "final-closure"],
  );
  assert.ok(forward[0].observedStartSeconds >= GOLDEN_REFERENCE_RECORDING.cleanForwardStartSeconds);
  assert.ok(forward.at(-1)!.observedEndSeconds <= GOLDEN_REFERENCE_RECORDING.assembledAgainSeconds);
});

test("reference motion envelope contains the production structural hinge default", () => {
  assert.ok(DEFAULT_STRUCTURAL_HINGE_MOTION.durationMs >= GOLDEN_REFERENCE_TWEEN.hingeDurationMs.min);
  assert.ok(DEFAULT_STRUCTURAL_HINGE_MOTION.durationMs <= GOLDEN_REFERENCE_TWEEN.hingeDurationMs.max);
  assert.equal(DEFAULT_STRUCTURAL_HINGE_MOTION.easing, GOLDEN_REFERENCE_TWEEN.preferredEasing);
  assert.equal(GOLDEN_REFERENCE_TWEEN.springOrBounceAllowed, false);
  assert.equal(GOLDEN_REFERENCE_TWEEN.cameraOwnedByFoldState, false);
});

test("high-confidence video facts are separated from construction facts the recording cannot certify", () => {
  assert.equal(GOLDEN_REFERENCE_CERTAINTIES.rigidPanels, "very-high");
  assert.equal(GOLDEN_REFERENCE_CERTAINTIES.creaseAlignedRotation, "very-high");
  assert.equal(GOLDEN_REFERENCE_CERTAINTIES.topClosureUnfoldsBeforeBody, "very-high");
  assert.ok(GOLDEN_REFERENCE_UNRESOLVED.includes("exact board thickness in millimetres"));
  assert.ok(GOLDEN_REFERENCE_UNRESOLVED.includes("exact bottom-lock construction"));
  assert.ok(GOLDEN_REFERENCE_UNRESOLVED.includes("exact signed fold direction for every crease"));
});
