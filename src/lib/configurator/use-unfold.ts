"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import type { HingeAngles, UnfoldPlan, UnfoldTransitionSignal } from "@/types/unfold";
import { anglesAtStage } from "./unfold-plan";
import { tagPoseTransition } from "./hinge-animation";
import {
  INITIAL_UNFOLD_STATE,
  unfoldReducer,
  unfoldStatus,
  type UnfoldAction,
  type UnfoldState,
} from "./unfold-state";

/**
 * React binding for the structural state machine. Structural state remains only
 * the integer stage; transition intent is attached to the derived pose as
 * ephemeral presentation metadata, so animation can never become product data.
 */
export function useUnfold(plan: UnfoldPlan | null) {
  const stepCount = plan?.steps.length ?? 0;
  const [state, dispatch] = useReducer(
    (current: UnfoldState, action: UnfoldAction) => unfoldReducer(current, action, stepCount),
    INITIAL_UNFOLD_STATE,
  );
  const transitionRef = useRef<UnfoldTransitionSignal>({ revision: 0, direction: "forward" });

  // Switching product (or spec) must not leave a stale stage behind.
  useEffect(() => {
    dispatch({ type: "reset" });
  }, [plan]);

  const next = useCallback(() => {
    if (!plan || state.stage >= plan.steps.length) return;
    const step = plan.steps[state.stage];
    transitionRef.current = {
      revision: transitionRef.current.revision + 1,
      direction: "forward",
      motion: step.motion,
    };
    dispatch({ type: "next" });
  }, [plan, state.stage]);

  const previous = useCallback(() => {
    if (!plan || state.stage <= 0) return;
    const step = plan.steps[state.stage - 1];
    transitionRef.current = {
      revision: transitionRef.current.revision + 1,
      direction: "backward",
      motion: step.motion,
    };
    dispatch({ type: "previous" });
  }, [plan, state.stage]);

  const reset = useCallback(() => {
    transitionRef.current = {
      revision: transitionRef.current.revision + 1,
      direction: "backward",
    };
    dispatch({ type: "reset" });
  }, []);

  const status = useMemo(
    () => (plan ? unfoldStatus(plan, state) : null),
    [plan, state],
  );

  const angles = useMemo<HingeAngles>(
    () => (plan ? anglesAtStage(plan, state.stage) : {}),
    [plan, state.stage],
  );

  // WeakMap metadata is registered after render rather than mutating external
  // state inside useMemo. The Three/R3F frame loop sees it before animation.
  useLayoutEffect(() => {
    tagPoseTransition(angles, transitionRef.current);
  }, [angles]);

  return { status, angles, next, previous, reset };
}
