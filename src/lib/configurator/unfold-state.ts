import type { UnfoldPlan } from "@/types/unfold";

/**
 * The structural state machine.
 *
 * Stage is a plain integer index into the plan's steps, which is what makes
 * rapid clicking safe: every transition is a clamped integer step, and the
 * pose is recomputed from the plan rather than accumulated. An animation that
 * is still in flight cannot corrupt state because it holds no state.
 */
export type UnfoldState = { stage: number };

export type UnfoldAction =
  | { type: "next" }
  | { type: "previous" }
  | { type: "reset" }
  | { type: "goTo"; stage: number };

export const INITIAL_UNFOLD_STATE: UnfoldState = { stage: 0 };

export function unfoldReducer(
  state: UnfoldState,
  action: UnfoldAction,
  stepCount: number,
): UnfoldState {
  const clamp = (stage: number) => Math.max(0, Math.min(stepCount, stage));
  switch (action.type) {
    case "next":
      return { stage: clamp(state.stage + 1) };
    case "previous":
      return { stage: clamp(state.stage - 1) };
    case "reset":
      return INITIAL_UNFOLD_STATE;
    case "goTo":
      return { stage: clamp(Math.round(action.stage)) };
  }
}

export type UnfoldStatus = {
  stage: number;
  stepCount: number;
  atStart: boolean;
  atEnd: boolean;
  /** True only when the plan genuinely terminates flat AND we are there. */
  isFlat: boolean;
  /** Label of the step the primary action would perform next, if any. */
  nextLabel: string | null;
  /** Label of the step that produced the current pose. */
  currentLabel: string | null;
  /** Label for stepping back out of the current pose. */
  reverseLabel: string | null;
};

export function unfoldStatus(plan: UnfoldPlan, state: UnfoldState): UnfoldStatus {
  const stepCount = plan.steps.length;
  const atEnd = state.stage >= stepCount;
  return {
    stage: state.stage,
    stepCount,
    atStart: state.stage === 0,
    atEnd,
    isFlat: atEnd && plan.reachesFlat,
    nextLabel: atEnd ? null : plan.steps[state.stage].label,
    currentLabel: state.stage > 0 ? plan.steps[state.stage - 1].label : null,
    reverseLabel: state.stage > 0 ? (plan.steps[state.stage - 1].reverseLabel ?? null) : null,
  };
}
