import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authoredPlan,
  resolveAuthoredStepMotion,
} from "@/lib/configurator/unfold-plan";
import type { ArticulatedHinge } from "@/types/unfold";

const hinges: ArticulatedHinge[] = [
  {
    id: "A",
    parentId: null,
    depth: 1,
    assembledAngleDeg: 90,
    flatAngleDeg: 0,
    isPrimary: false,
  },
  {
    id: "B",
    parentId: "A",
    depth: 2,
    assembledAngleDeg: 90,
    flatAngleDeg: 0,
    isPrimary: false,
  },
];

test("authored motion expands duration, delay, stagger and explicit hinge order", () => {
  const plan = authoredPlan(
    [
      {
        id: "release",
        label: "Release flaps",
        hingeIds: ["A", "B"],
        to: "flat",
        motion: {
          delayMs: 50,
          durationMs: 600,
          staggerMs: 100,
          easing: "easeInOutCubic",
          hingeOrder: ["B", "A"],
        },
      },
    ],
    hinges,
  );
  assert.deepEqual(plan.steps[0].motion, {
    B: { delayMs: 50, durationMs: 600, easing: "easeInOutCubic" },
    A: { delayMs: 150, durationMs: 600, easing: "easeInOutCubic" },
  });
});

test("authored motion refuses an order that omits or invents hinges", () => {
  assert.throws(
    () =>
      resolveAuthoredStepMotion("bad", ["A", "B"], {
        hingeOrder: ["A", "NOT_B"],
      }),
    /must contain exactly the step hingeIds/,
  );
});

test("authored motion refuses duplicate hinge ids and invalid physical timing", () => {
  assert.throws(
    () =>
      resolveAuthoredStepMotion("dup", ["A", "B"], {
        hingeOrder: ["A", "A"],
      }),
    /duplicate hinge ids/,
  );
  assert.throws(
    () => resolveAuthoredStepMotion("negative", ["A"], { staggerMs: -1 }),
    /staggerMs.*non-negative/,
  );
  assert.throws(
    () => resolveAuthoredStepMotion("zero", ["A"], { durationMs: 0 }),
    /durationMs.*positive/,
  );
});
