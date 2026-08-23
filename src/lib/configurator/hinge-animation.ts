import type { HingeAngles } from "@/types/unfold";

/**
 * Frame-rate independent easing toward a target pose.
 *
 * Shared by every articulated product family, so a carton and an authored GLB
 * move with exactly the same feel and neither can drift from the other.
 *
 * The animation holds NO state of its own: the current pose is the caller's,
 * the target is a prop, and each frame simply moves one toward the other.
 * That is what makes re-targeting mid-flight safe — there is no transition
 * object to interrupt and no accumulated value to corrupt.
 */

/** Time constant in seconds. At 30fps and at 144fps a joint arrives together. */
export const HINGE_TAU = 0.16;

/** Below this the joint is snapped, so a pose settles exactly rather than creeping. */
const SETTLE_DEG = 1e-4;

export type PoseJoint = {
  id: string;
  /** Angle used when the requested pose says nothing about this joint. */
  restAngleDeg: number;
};

/**
 * Advances `pose` toward `targets` and returns how far the furthest joint
 * still has to travel, in degrees — which callers use to decide when a
 * structural change has visually completed.
 *
 * A joint seen for the first time snaps to its target: a product must appear
 * assembled on load, not animate itself together.
 */
export function stepPose(
  pose: Record<string, number>,
  joints: readonly PoseJoint[],
  targets: HingeAngles,
  delta: number,
  immediate = false,
): number {
  const alpha = immediate ? 1 : 1 - Math.exp(-delta / HINGE_TAU);
  let maxDeviation = 0;

  for (const joint of joints) {
    const target = targets[joint.id] ?? joint.restAngleDeg;
    const current = pose[joint.id] ?? target;
    const stepped = current + (target - current) * alpha;
    pose[joint.id] = Math.abs(target - stepped) < SETTLE_DEG ? target : stepped;
    maxDeviation = Math.max(maxDeviation, Math.abs(target - pose[joint.id]));
  }

  return maxDeviation;
}
