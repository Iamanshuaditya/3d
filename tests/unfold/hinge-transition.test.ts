import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_HINGE_DURATION_MS,
  stepPose,
  tagPoseTransition,
} from "@/lib/configurator/hinge-animation";
import type { HingeAngles, HingeMotionMap } from "@/types/unfold";

const joints = [
  { id: "A", restAngleDeg: 90 },
  { id: "B", restAngleDeg: 90 },
] as const;

function tagged(
  values: Record<string, number>,
  revision: number,
  direction: "forward" | "backward",
  motion?: HingeMotionMap,
): HingeAngles {
  return tagPoseTransition(values, { revision, direction, motion });
}

test("timed pose starts assembled, reaches cubic midpoint, then snaps exactly to target", () => {
  const pose: Record<string, number> = {};
  stepPose(pose, [joints[0]], tagged({ A: 90 }, 0, "forward"), 0);
  assert.equal(pose.A, 90);

  const flat = tagged({ A: 0 }, 1, "forward");
  stepPose(pose, [joints[0]], flat, DEFAULT_HINGE_DURATION_MS / 2000);
  assert.ok(Math.abs(pose.A - 45) < 1e-9, `expected cubic midpoint 45°, got ${pose.A}`);
  const deviation = stepPose(pose, [joints[0]], flat, DEFAULT_HINGE_DURATION_MS / 2000);
  assert.equal(pose.A, 0);
  assert.equal(deviation, 0);
});

test("default forward motion staggers hinges instead of moving every panel at once", () => {
  const pose: Record<string, number> = {};
  stepPose(pose, joints, tagged({ A: 90, B: 90 }, 0, "forward"), 0);
  const flat = tagged({ A: 0, B: 0 }, 1, "forward");
  stepPose(pose, joints, flat, 0.045);
  assert.ok(pose.A < 90, "first hinge should have started");
  assert.equal(pose.B, 90, "second hinge should still be inside the default 90ms stagger");
});

test("backward traversal mirrors the same stagger order", () => {
  const pose: Record<string, number> = {};
  stepPose(pose, joints, tagged({ A: 0, B: 0 }, 0, "forward"), 0);
  const assembled = tagged({ A: 90, B: 90 }, 1, "backward");
  stepPose(pose, joints, assembled, 0.045);
  assert.equal(pose.A, 0, "first forward hinge should be delayed when traversing backward");
  assert.ok(pose.B > 0, "last forward hinge should move first when traversing backward");
});

test("authored per-hinge delay and duration control the finite transition", () => {
  const pose: Record<string, number> = {};
  stepPose(pose, joints, tagged({ A: 90, B: 90 }, 0, "forward"), 0);
  const motion: HingeMotionMap = {
    A: { delayMs: 100, durationMs: 500, easing: "linear" },
    B: { delayMs: 250, durationMs: 500, easing: "linear" },
  };
  const flat = tagged({ A: 0, B: 0 }, 1, "forward", motion);
  stepPose(pose, joints, flat, 0.2);
  assert.ok(Math.abs(pose.A - 72) < 1e-9);
  assert.equal(pose.B, 90);
  stepPose(pose, joints, flat, 0.55);
  assert.equal(pose.A, 0);
  assert.equal(pose.B, 0);
});

test("rapid retargeting starts from the currently visible pose without teleport or drift", () => {
  const pose: Record<string, number> = {};
  stepPose(pose, [joints[0]], tagged({ A: 90 }, 0, "forward"), 0);
  const flat = tagged({ A: 0 }, 1, "forward");
  stepPose(pose, [joints[0]], flat, 0.2);
  const visible = pose.A;
  assert.ok(visible > 0 && visible < 90);

  const assembled = tagged({ A: 90 }, 2, "backward");
  stepPose(pose, [joints[0]], assembled, 0);
  assert.equal(pose.A, visible, "retarget must begin from the rendered angle");
  stepPose(pose, [joints[0]], assembled, 1);
  assert.equal(pose.A, 90);
});

test("reduced-motion path snaps immediately to the exact absolute target", () => {
  const pose: Record<string, number> = {};
  stepPose(pose, [joints[0]], tagged({ A: 90 }, 0, "forward"), 0);
  const flat = tagged({ A: 0 }, 1, "forward");
  assert.equal(stepPose(pose, [joints[0]], flat, 0, true), 0);
  assert.equal(pose.A, 0);
});
