import type {
  HingeAngles,
  HingeEasing,
  HingeMotion,
  HingeMotionMap,
  UnfoldTransitionSignal,
} from "@/types/unfold";

/**
 * Authored-feeling structural motion shared by cartons and articulated GLBs.
 *
 * The old implementation exponentially chased the latest target forever. That
 * was frame-rate independent, but every hinge had the same anonymous motion
 * curve and there was no real transition duration or stagger. This runtime is
 * still interruption-safe, but transitions now have a finite timeline and
 * snap exactly to their absolute targets at completion.
 */

/** Kept as a compatibility export for older callers; timed motion no longer uses it. */
export const HINGE_TAU = 0.16;
export const DEFAULT_HINGE_DURATION_MS = 575;
export const DEFAULT_HINGE_STAGGER_MS = 90;
export const DEFAULT_HINGE_EASING: HingeEasing = "easeInOutCubic";

/** Below this the joint is snapped, so a pose settles exactly rather than creeping. */
const SETTLE_DEG = 1e-4;

export type PoseJoint = {
  id: string;
  /** Angle used when the requested pose says nothing about this joint. */
  restAngleDeg: number;
};

type ActivePoseTransition = {
  initialized: boolean;
  targetSignature: string;
  signalRevision: number;
  elapsedMs: number;
  starts: Record<string, number>;
  targets: Record<string, number>;
  movingIds: string[];
  motion: Record<string, HingeMotion>;
};

const transitionByPose = new WeakMap<object, ActivePoseTransition>();
const signalByTargets = new WeakMap<object, UnfoldTransitionSignal>();

function initialState(): ActivePoseTransition {
  return {
    initialized: false,
    targetSignature: "",
    signalRevision: -1,
    elapsedMs: 0,
    starts: {},
    targets: {},
    movingIds: [],
    motion: {},
  };
}

/**
 * Associates UI transition intent with an immutable target-angle object without
 * polluting `HingeAngles` with non-angle metadata. The target remains a plain
 * record and existing renderers remain source-compatible.
 */
export function tagPoseTransition(
  targets: HingeAngles,
  signal: UnfoldTransitionSignal,
): HingeAngles {
  signalByTargets.set(targets as object, signal);
  return targets;
}

export function easeHingeProgress(easing: HingeEasing, progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  if (easing === "linear") return t;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function resolvedTargets(
  joints: readonly PoseJoint[],
  targets: HingeAngles,
): Record<string, number> {
  return Object.fromEntries(
    joints.map((joint) => {
      const target = targets[joint.id] ?? joint.restAngleDeg;
      if (!Number.isFinite(target)) throw new RangeError(`Hinge ${joint.id} target angle must be finite.`);
      return [joint.id, target];
    }),
  );
}

function targetSignature(joints: readonly PoseJoint[], targets: Record<string, number>): string {
  return joints.map((joint) => `${joint.id}:${targets[joint.id]}`).join("|");
}

function defaultMotion(index: number): HingeMotion {
  return {
    delayMs: index * DEFAULT_HINGE_STAGGER_MS,
    durationMs: DEFAULT_HINGE_DURATION_MS,
    easing: DEFAULT_HINGE_EASING,
  };
}

function validateMotion(id: string, motion: HingeMotion): HingeMotion {
  if (!Number.isFinite(motion.delayMs) || motion.delayMs < 0) {
    throw new RangeError(`Hinge ${id} delayMs must be finite and non-negative.`);
  }
  if (!Number.isFinite(motion.durationMs) || motion.durationMs <= 0) {
    throw new RangeError(`Hinge ${id} durationMs must be finite and positive.`);
  }
  if (motion.easing !== "linear" && motion.easing !== "easeInOutCubic") {
    throw new Error(`Hinge ${id} uses unsupported easing ${String(motion.easing)}.`);
  }
  return motion;
}

function resolveMotion(
  movingIds: readonly string[],
  authored: HingeMotionMap | undefined,
  direction: "forward" | "backward",
): Record<string, HingeMotion> {
  const forward = Object.fromEntries(
    movingIds.map((id, index) => [id, validateMotion(id, authored?.[id] ?? defaultMotion(index))]),
  ) as Record<string, HingeMotion>;
  if (direction === "forward" || movingIds.length < 2) return forward;

  const delays = movingIds.map((id) => forward[id].delayMs);
  const minDelay = Math.min(...delays);
  const maxDelay = Math.max(...delays);
  return Object.fromEntries(
    movingIds.map((id) => [
      id,
      {
        ...forward[id],
        // Backward traverses the same physical action graph in reverse rather
        // than inventing a second animation sequence.
        delayMs: minDelay + maxDelay - forward[id].delayMs,
      },
    ]),
  );
}

function beginTransition(
  state: ActivePoseTransition,
  pose: Record<string, number>,
  joints: readonly PoseJoint[],
  nextTargets: Record<string, number>,
  signature: string,
  signal: UnfoldTransitionSignal | undefined,
): void {
  const movingIds: string[] = [];
  const starts: Record<string, number> = {};
  for (const joint of joints) {
    const current = pose[joint.id] ?? nextTargets[joint.id];
    starts[joint.id] = current;
    if (Math.abs(nextTargets[joint.id] - current) > SETTLE_DEG) movingIds.push(joint.id);
    else pose[joint.id] = nextTargets[joint.id];
  }

  state.targetSignature = signature;
  state.signalRevision = signal?.revision ?? state.signalRevision + 1;
  state.elapsedMs = 0;
  state.starts = starts;
  state.targets = nextTargets;
  state.movingIds = movingIds;
  state.motion = resolveMotion(movingIds, signal?.motion, signal?.direction ?? "forward");
}

function snapPose(
  pose: Record<string, number>,
  joints: readonly PoseJoint[],
  targets: Record<string, number>,
): void {
  for (const joint of joints) pose[joint.id] = targets[joint.id];
}

/**
 * Advances `pose` toward `targets` and returns how far the furthest joint still
 * has to travel, in degrees.
 *
 * Behavioural guarantees:
 * - first render snaps to the requested pose (no self-assembly on load);
 * - target changes start from the currently visible pose, so interruption is
 *   continuous and cannot accumulate drift;
 * - each hinge has finite delay/duration/easing;
 * - completion snaps to the exact absolute target;
 * - backward mirrors the same stagger order;
 * - reduced motion is immediate.
 */
export function stepPose(
  pose: Record<string, number>,
  joints: readonly PoseJoint[],
  targets: HingeAngles,
  delta: number,
  immediate = false,
): number {
  let state = transitionByPose.get(pose);
  if (!state) {
    state = initialState();
    transitionByPose.set(pose, state);
  }

  const nextTargets = resolvedTargets(joints, targets);
  const signature = targetSignature(joints, nextTargets);
  const signal = signalByTargets.get(targets as object);
  const signalRevision = signal?.revision ?? state.signalRevision;

  if (!state.initialized) {
    state.initialized = true;
    state.targetSignature = signature;
    state.signalRevision = signal?.revision ?? 0;
    state.targets = nextTargets;
    snapPose(pose, joints, nextTargets);
    return 0;
  }

  if (signature !== state.targetSignature || signalRevision !== state.signalRevision) {
    beginTransition(state, pose, joints, nextTargets, signature, signal);
  }

  if (immediate) {
    snapPose(pose, joints, nextTargets);
    state.elapsedMs = Number.POSITIVE_INFINITY;
    state.movingIds = [];
    state.targets = nextTargets;
    return 0;
  }

  if (!Number.isFinite(delta) || delta < 0) throw new RangeError("Animation delta must be finite and non-negative.");
  state.elapsedMs += delta * 1000;

  let maxDeviation = 0;
  const moving = new Set(state.movingIds);
  for (const joint of joints) {
    const id = joint.id;
    const target = state.targets[id] ?? nextTargets[id];
    if (!moving.has(id)) {
      pose[id] = target;
      continue;
    }
    const motion = state.motion[id];
    const local = (state.elapsedMs - motion.delayMs) / motion.durationMs;
    if (local <= 0) {
      pose[id] = state.starts[id];
    } else if (local >= 1) {
      pose[id] = target;
    } else {
      const eased = easeHingeProgress(motion.easing, local);
      pose[id] = state.starts[id] + (target - state.starts[id]) * eased;
    }
    maxDeviation = Math.max(maxDeviation, Math.abs(target - pose[id]));
  }

  if (maxDeviation <= SETTLE_DEG || state.movingIds.every((id) => {
    const motion = state.motion[id];
    return state.elapsedMs >= motion.delayMs + motion.durationMs;
  })) {
    snapPose(pose, joints, state.targets);
    state.movingIds = [];
    return 0;
  }

  return maxDeviation;
}
