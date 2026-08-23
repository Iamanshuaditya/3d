"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { HingeAngles, UnfoldPlan } from "@/types/unfold";
import { anglesAtStage } from "./unfold-plan";
import {
  INITIAL_UNFOLD_STATE,
  unfoldReducer,
  unfoldStatus,
  type UnfoldAction,
  type UnfoldState,
} from "./unfold-state";

/**
 * React binding for the structural state machine. Holds nothing but the stage
 * index; the pose is derived, so the component tree can never disagree with
 * the plan.
 */
export function useUnfold(plan: UnfoldPlan | null) {
  const stepCount = plan?.steps.length ?? 0;
  const [state, dispatch] = useReducer(
    (current: UnfoldState, action: UnfoldAction) => unfoldReducer(current, action, stepCount),
    INITIAL_UNFOLD_STATE,
  );

  // Switching product (or spec) must not leave a stale stage behind.
  useEffect(() => {
    dispatch({ type: "reset" });
  }, [plan]);

  const next = useCallback(() => dispatch({ type: "next" }), []);
  const previous = useCallback(() => dispatch({ type: "previous" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const status = useMemo(
    () => (plan ? unfoldStatus(plan, state) : null),
    [plan, state],
  );

  const angles = useMemo<HingeAngles>(
    () => (plan ? anglesAtStage(plan, state.stage) : {}),
    [plan, state.stage],
  );

  return { status, angles, next, previous, reset };
}
