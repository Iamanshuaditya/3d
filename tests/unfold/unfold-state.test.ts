import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_UNFOLD_STATE,
  unfoldReducer,
  unfoldStatus,
  type UnfoldAction,
  type UnfoldState,
} from "@/lib/configurator/unfold-state";
import type { UnfoldPlan } from "@/types/unfold";

const PLAN: UnfoldPlan = {
  assembled: { A: 90, B: 90 },
  steps: [
    { id: "open", label: "Open lid", reverseLabel: "Close lid", targets: { A: -50 } },
    { id: "flatten-a", label: "Lay the lid flat", targets: { A: 0 } },
    { id: "flatten-b", label: "Lay the walls flat", targets: { B: 0 } },
  ],
  reachesFlat: true,
  source: "authored",
};

const run = (actions: UnfoldAction[], steps = PLAN.steps.length): UnfoldState =>
  actions.reduce((state, action) => unfoldReducer(state, action, steps), INITIAL_UNFOLD_STATE);

test("starts assembled", () => {
  assert.equal(INITIAL_UNFOLD_STATE.stage, 0);
  const status = unfoldStatus(PLAN, INITIAL_UNFOLD_STATE);
  assert.equal(status.atStart, true);
  assert.equal(status.atEnd, false);
  assert.equal(status.isFlat, false);
  assert.equal(status.nextLabel, "Open lid");
});

test("next advances exactly one stage at a time", () => {
  assert.equal(run([{ type: "next" }]).stage, 1);
  assert.equal(run([{ type: "next" }, { type: "next" }]).stage, 2);
});

test("previous reverses and reset returns to assembled", () => {
  assert.equal(run([{ type: "next" }, { type: "next" }, { type: "previous" }]).stage, 1);
  assert.equal(run([{ type: "next" }, { type: "next" }, { type: "reset" }]).stage, 0);
});

test("the final stage cannot overflow however fast it is clicked", () => {
  const spam = Array.from({ length: 40 }, () => ({ type: "next" }) as const);
  assert.equal(run(spam).stage, PLAN.steps.length);
});

test("stage cannot go below assembled", () => {
  const spam = Array.from({ length: 12 }, () => ({ type: "previous" }) as const);
  assert.equal(run(spam).stage, 0);
});

test("interleaved rapid clicks stay deterministic", () => {
  // Mimics a user hammering forward/back mid-animation: state is a clamped
  // integer, so the outcome depends only on the click sequence.
  const sequence: UnfoldAction[] = [
    { type: "next" }, { type: "next" }, { type: "previous" },
    { type: "next" }, { type: "next" }, { type: "next" },
    { type: "previous" }, { type: "next" }, { type: "next" },
  ];
  assert.equal(run(sequence).stage, 3);
  assert.equal(run(sequence).stage, run(sequence).stage);
});

test("goTo clamps and rounds", () => {
  assert.equal(run([{ type: "goTo", stage: 99 }]).stage, 3);
  assert.equal(run([{ type: "goTo", stage: -4 }]).stage, 0);
  assert.equal(run([{ type: "goTo", stage: 1.6 }]).stage, 2);
});

test("isFlat is only reported when the plan genuinely terminates flat", () => {
  const openOnly: UnfoldPlan = { ...PLAN, steps: [PLAN.steps[0]], reachesFlat: false };
  const atEnd = unfoldStatus(openOnly, { stage: 1 });
  assert.equal(atEnd.atEnd, true);
  assert.equal(atEnd.isFlat, false);
  assert.equal(atEnd.reverseLabel, "Close lid");
  assert.equal(unfoldStatus(PLAN, { stage: 3 }).isFlat, true);
});
