import type { CartonSpec } from "@/types/carton";
import type {
  ArticulatedHinge,
  AuthoredUnfoldMotion,
  AuthoredUnfoldStep,
  HingeAngles,
  HingeMotionMap,
  UnfoldPlan,
  UnfoldStep,
} from "@/types/unfold";
import { cartonCanFlatten, cartonHinges } from "./carton-topology";
import {
  DEFAULT_HINGE_DURATION_MS,
  DEFAULT_HINGE_EASING,
  DEFAULT_HINGE_STAGGER_MS,
} from "./hinge-animation";

/**
 * Turns an articulation graph into an ordered, dependency-aware unfolding
 * sequence.
 *
 * Two sources, one output shape:
 *   - authored  a `spec.unfold` sequence, because packaging construction order
 *               is a manufacturing fact and not something to infer;
 *   - derived   a fallback built from tree topology, so any new carton spec
 *               unfolds sensibly the day it is added, with no UI changes.
 *
 * Nothing here knows about three.js or React: a plan is data, and the pose at
 * any stage is a pure function of it.
 */

function angleFor(hinge: ArticulatedHinge, to: AuthoredUnfoldStep["to"]): number {
  if (typeof to === "number") return to;
  if (to === "flat") return hinge.flatAngleDeg;
  if (to === "assembled") return hinge.assembledAngleDeg;
  if (hinge.openAngleDeg === undefined) {
    throw new Error(
      `Unfold step targets "open" on hinge "${hinge.id}", which has no open angle. ` +
        `Only the primary articulation can open.`,
    );
  }
  return hinge.openAngleDeg;
}

function assembledPose(hinges: ArticulatedHinge[]): HingeAngles {
  return Object.fromEntries(hinges.map((h) => [h.id, h.assembledAngleDeg]));
}

function flatPose(hinges: ArticulatedHinge[]): HingeAngles {
  return Object.fromEntries(hinges.map((h) => [h.id, h.flatAngleDeg]));
}

/** Absolute hinge angles after `stage` steps. Stage 0 is the assembled pose. */
export function anglesAtStage(plan: UnfoldPlan, stage: number): HingeAngles {
  const clamped = Math.max(0, Math.min(plan.steps.length, Math.round(stage)));
  const pose: Record<string, number> = { ...plan.assembled };
  for (let index = 0; index < clamped; index += 1) {
    Object.assign(pose, plan.steps[index].targets);
  }
  return pose;
}

function poseReachesFlat(plan: Omit<UnfoldPlan, "reachesFlat">, hinges: ArticulatedHinge[]) {
  const final = anglesAtStage({ ...plan, reachesFlat: false }, plan.steps.length);
  return hinges.every((hinge) => Math.abs((final[hinge.id] ?? 0) - hinge.flatAngleDeg) < 1e-6);
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative.`);
  return value;
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive.`);
  return value;
}

/** Expands compact authored timing into exact per-hinge timing. */
export function resolveAuthoredStepMotion(
  stepId: string,
  hingeIds: readonly string[],
  motion: AuthoredUnfoldMotion | undefined,
): HingeMotionMap | undefined {
  if (!motion) return undefined;

  const delayMs = finiteNonNegative(motion.delayMs ?? 0, `Step "${stepId}" delayMs`);
  const durationMs = finitePositive(
    motion.durationMs ?? DEFAULT_HINGE_DURATION_MS,
    `Step "${stepId}" durationMs`,
  );
  const staggerMs = finiteNonNegative(
    motion.staggerMs ?? DEFAULT_HINGE_STAGGER_MS,
    `Step "${stepId}" staggerMs`,
  );
  const easing = motion.easing ?? DEFAULT_HINGE_EASING;
  if (easing !== "linear" && easing !== "easeInOutCubic") {
    throw new Error(`Step "${stepId}" uses unsupported easing ${String(easing)}.`);
  }

  const order = motion.hingeOrder ? [...motion.hingeOrder] : [...hingeIds];
  if (new Set(order).size !== order.length) {
    throw new Error(`Step "${stepId}" motion hingeOrder contains duplicate hinge ids.`);
  }
  const expected = [...hingeIds].sort();
  const actual = [...order].sort();
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
    throw new Error(`Step "${stepId}" motion hingeOrder must contain exactly the step hingeIds.`);
  }

  return Object.fromEntries(
    order.map((hingeId, index) => [
      hingeId,
      { delayMs: delayMs + staggerMs * index, durationMs, easing },
    ]),
  );
}

// ------------------------------------------------------------------ authored

export function authoredPlan(
  steps: AuthoredUnfoldStep[],
  hinges: ArticulatedHinge[],
): UnfoldPlan {
  const byId = new Map(hinges.map((hinge) => [hinge.id, hinge]));
  const resolved: UnfoldStep[] = steps.map((step) => {
    const targets: Record<string, number> = {};
    for (const hingeId of step.hingeIds) {
      const hinge = byId.get(hingeId);
      if (!hinge) {
        throw new Error(
          `Unfold step "${step.id}" names hinge "${hingeId}", which is not in the articulation graph.`,
        );
      }
      targets[hingeId] = angleFor(hinge, step.to);
    }
    const motion = resolveAuthoredStepMotion(step.id, step.hingeIds, step.motion);
    return {
      id: step.id,
      label: step.label,
      reverseLabel: step.reverseLabel,
      targets,
      ...(motion ? { motion } : {}),
    };
  });

  const draft = { assembled: assembledPose(hinges), steps: resolved, source: "authored" as const };
  return { ...draft, reachesFlat: poseReachesFlat(draft, hinges) };
}

// ------------------------------------------------------------------- derived

/**
 * Topological fallback ordering.
 *
 * Packaging comes apart from the outside in: the primary articulation opens
 * first, then the joints furthest from the root, then their parents, until the
 * root's own walls lie down. Grouping by depth keeps the number of clicks
 * proportional to the construction rather than to the panel count.
 */
export function derivedPlan(hinges: ArticulatedHinge[]): UnfoldPlan {
  const steps: UnfoldStep[] = [];
  const primary = hinges.filter((hinge) => hinge.isPrimary && hinge.openAngleDeg !== undefined);

  if (primary.length) {
    steps.push({
      id: "open",
      label: "Open lid",
      reverseLabel: "Close lid",
      targets: Object.fromEntries(primary.map((hinge) => [hinge.id, hinge.openAngleDeg!])),
    });
  }

  // Split into the primary articulation's subtree and everything else, so the
  // lid assembly folds down before the tray it sits on is disturbed.
  const primaryIds = new Set(primary.map((hinge) => hinge.id));
  const parentOf = new Map(hinges.map((hinge) => [hinge.id, hinge.parentId]));
  const inPrimarySubtree = (hinge: ArticulatedHinge) => {
    let cursor: string | null = hinge.id;
    while (cursor) {
      if (primaryIds.has(cursor)) return true;
      cursor = parentOf.get(cursor) ?? null;
    }
    return false;
  };

  const sections: { hinges: ArticulatedHinge[]; deepLabel: string; lastLabel: string }[] = [
    {
      hinges: hinges.filter(inPrimarySubtree),
      deepLabel: "Unfold lid flaps",
      lastLabel: "Lay the lid flat",
    },
    {
      hinges: hinges.filter((hinge) => !inPrimarySubtree(hinge)),
      deepLabel: "Unfold inner flaps",
      lastLabel: "Lay the walls flat",
    },
  ];

  for (const section of sections) {
    const depths = [...new Set(section.hinges.map((hinge) => hinge.depth))].sort((a, b) => b - a);
    depths.forEach((depth, index) => {
      const group = section.hinges.filter((hinge) => hinge.depth === depth);
      const isLast = index === depths.length - 1;
      steps.push({
        id: `flatten-d${depth}-${isLast ? "last" : index}`,
        label: isLast ? section.lastLabel : section.deepLabel,
        targets: Object.fromEntries(group.map((hinge) => [hinge.id, hinge.flatAngleDeg])),
      });
    });
  }

  const draft = { assembled: assembledPose(hinges), steps, source: "derived" as const };
  if (steps.length && !poseReachesFlat(draft, hinges)) {
    // Safety net: a derived sequence must always terminate at the dieline.
    steps.push({ id: "flat", label: "Lay flat", targets: flatPose(hinges) });
  }
  return { ...draft, reachesFlat: poseReachesFlat(draft, hinges) };
}

// --------------------------------------------------------------- validation

/**
 * Structural sanity checks for an unfolding sequence. Run by the tests for
 * every registered carton, so a bad authored sequence cannot ship.
 */
export function validateUnfoldPlan(plan: UnfoldPlan, hinges: ArticulatedHinge[]): string[] {
  const errors: string[] = [];
  const byId = new Map(hinges.map((hinge) => [hinge.id, hinge]));
  const seenStepIds = new Set<string>();

  for (const step of plan.steps) {
    if (seenStepIds.has(step.id)) errors.push(`Duplicate step id "${step.id}".`);
    seenStepIds.add(step.id);
    if (!Object.keys(step.targets).length) errors.push(`Step "${step.id}" moves no hinges.`);
    for (const hingeId of Object.keys(step.targets)) {
      if (!byId.has(hingeId)) errors.push(`Step "${step.id}" targets unknown hinge "${hingeId}".`);
    }
    if (step.motion) {
      for (const [hingeId, motion] of Object.entries(step.motion)) {
        if (!(hingeId in step.targets)) errors.push(`Step "${step.id}" times hinge "${hingeId}" but does not move it.`);
        if (!Number.isFinite(motion.delayMs) || motion.delayMs < 0) errors.push(`Step "${step.id}" has invalid delay for "${hingeId}".`);
        if (!Number.isFinite(motion.durationMs) || motion.durationMs <= 0) errors.push(`Step "${step.id}" has invalid duration for "${hingeId}".`);
      }
    }
  }

  // Dependency rule: a joint must reach flat no later than its parent, so a
  // wall never lies down while carrying a flap that is still standing.
  const flatAt = new Map<string, number>();
  for (const hinge of hinges) {
    for (let index = plan.steps.length - 1; index >= 0; index -= 1) {
      const target = plan.steps[index].targets[hinge.id];
      if (target === undefined) continue;
      if (Math.abs(target - hinge.flatAngleDeg) < 1e-6) flatAt.set(hinge.id, index);
      break;
    }
  }
  for (const hinge of hinges) {
    if (!hinge.parentId) continue;
    const childStage = flatAt.get(hinge.id);
    const parentStage = flatAt.get(hinge.parentId);
    if (childStage === undefined || parentStage === undefined) continue;
    if (childStage > parentStage) {
      errors.push(
        `Hinge "${hinge.id}" flattens at step ${childStage + 1} but its parent ` +
          `"${hinge.parentId}" already flattened at step ${parentStage + 1}.`,
      );
    }
  }

  return errors;
}

// ------------------------------------------------------------------- cartons

/** The unfolding plan for a carton spec, or null when nothing articulates. */
export function cartonUnfoldPlan(spec: CartonSpec): UnfoldPlan | null {
  const hinges = cartonHinges(spec);
  if (!hinges.length) return null;

  if (spec.unfold) {
    if (!cartonCanFlatten(spec)) {
      throw new Error(
        `Carton spec "${spec.id}" authors an unfold sequence but its construction ` +
          `cannot reach a flat dieline (generated shell geometry, not folding panels).`,
      );
    }
    return authoredPlan(spec.unfold.steps, hinges);
  }

  if (!cartonCanFlatten(spec)) {
    // Honest capability: this construction opens, it does not flatten.
    const primary = hinges.filter((hinge) => hinge.openAngleDeg !== undefined);
    if (!primary.length) return null;
    return {
      assembled: assembledPose(hinges),
      steps: [
        {
          id: "open",
          label: "Open lid",
          reverseLabel: "Close lid",
          targets: Object.fromEntries(primary.map((h) => [h.id, h.openAngleDeg!])),
        },
      ],
      reachesFlat: false,
      source: "derived",
    };
  }

  return derivedPlan(hinges);
}
