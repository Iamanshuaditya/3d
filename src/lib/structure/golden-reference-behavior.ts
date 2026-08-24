export type ReferenceConfidence = "very-high" | "high" | "medium-high" | "medium" | "low-medium" | "low";

export type GoldenReferenceState = Readonly<{
  index: number;
  id: "flat" | "body-forming" | "body-erect" | "secondary-flaps" | "major-closure" | "final-closure";
  description: string;
}>;

export type GoldenReferenceTransition = Readonly<{
  id: string;
  direction: "forward" | "backward";
  fromState: GoldenReferenceState["id"];
  toState: GoldenReferenceState["id"];
  observedStartSeconds: number;
  observedEndSeconds: number;
  movingSemanticGroup: "body" | "secondary-flaps" | "major-closure" | "final-closure";
  approximateRelativeAngleDeg?: Readonly<{ min: number; max: number }>;
  confidence: ReferenceConfidence;
}>;

export const GOLDEN_REFERENCE_RECORDING = Object.freeze({
  durationSeconds: 29.4,
  frameRate: 30,
  frameIntervalMs: 1000 / 30,
  cleanBackwardStartSeconds: 11.2,
  flatHoldStartSeconds: 20.5,
  cleanForwardStartSeconds: 22.2,
  assembledAgainSeconds: 27,
});

export const GOLDEN_REFERENCE_STATES: readonly GoldenReferenceState[] = Object.freeze([
  { index: 0, id: "flat", description: "Completely flat dieline" },
  { index: 1, id: "body-forming", description: "Body panels begin erecting" },
  { index: 2, id: "body-erect", description: "Rectangular tube/body formed" },
  { index: 3, id: "secondary-flaps", description: "Side/dust or secondary top flaps positioned inward" },
  { index: 4, id: "major-closure", description: "Major upper closure flap folded" },
  { index: 5, id: "final-closure", description: "Final top/tuck closure settled" },
] as const);

export const GOLDEN_REFERENCE_TRANSITIONS: readonly GoldenReferenceTransition[] = Object.freeze([
  {
    id: "forward-body",
    direction: "forward",
    fromState: "flat",
    toState: "body-erect",
    observedStartSeconds: 22.2,
    observedEndSeconds: 24.1,
    movingSemanticGroup: "body",
    approximateRelativeAngleDeg: { min: 75, max: 100 },
    confidence: "medium",
  },
  {
    id: "forward-secondary",
    direction: "forward",
    fromState: "body-erect",
    toState: "secondary-flaps",
    observedStartSeconds: 24.1,
    observedEndSeconds: 24.8,
    movingSemanticGroup: "secondary-flaps",
    approximateRelativeAngleDeg: { min: 75, max: 100 },
    confidence: "high",
  },
  {
    id: "forward-major",
    direction: "forward",
    fromState: "secondary-flaps",
    toState: "major-closure",
    observedStartSeconds: 24.8,
    observedEndSeconds: 25.8,
    movingSemanticGroup: "major-closure",
    approximateRelativeAngleDeg: { min: 75, max: 105 },
    confidence: "high",
  },
  {
    id: "forward-final",
    direction: "forward",
    fromState: "major-closure",
    toState: "final-closure",
    observedStartSeconds: 25.8,
    observedEndSeconds: 26.6,
    movingSemanticGroup: "final-closure",
    confidence: "medium",
  },
  {
    id: "backward-major",
    direction: "backward",
    fromState: "final-closure",
    toState: "major-closure",
    observedStartSeconds: 11.2,
    observedEndSeconds: 13.6,
    movingSemanticGroup: "major-closure",
    approximateRelativeAngleDeg: { min: 75, max: 105 },
    confidence: "high",
  },
  {
    id: "backward-secondary",
    direction: "backward",
    fromState: "major-closure",
    toState: "secondary-flaps",
    observedStartSeconds: 13.6,
    observedEndSeconds: 15,
    movingSemanticGroup: "secondary-flaps",
    approximateRelativeAngleDeg: { min: 75, max: 105 },
    confidence: "high",
  },
  {
    id: "backward-body-open",
    direction: "backward",
    fromState: "body-erect",
    toState: "body-forming",
    observedStartSeconds: 15,
    observedEndSeconds: 17.5,
    movingSemanticGroup: "body",
    approximateRelativeAngleDeg: { min: 75, max: 105 },
    confidence: "medium",
  },
  {
    id: "backward-body-flat",
    direction: "backward",
    fromState: "body-forming",
    toState: "flat",
    observedStartSeconds: 17.5,
    observedEndSeconds: 20.5,
    movingSemanticGroup: "body",
    confidence: "medium",
  },
] as const);

/**
 * Per-hinge visual recreation envelope from the supplied motion analysis.
 * These are benchmark ranges, not recovered source constants.
 */
export const GOLDEN_REFERENCE_TWEEN = Object.freeze({
  hingeDurationMs: { min: 450, max: 700 },
  staggerMs: { min: 50, max: 150 },
  preferredEasing: "easeInOutCubic" as const,
  springOrBounceAllowed: false,
  cameraOwnedByFoldState: false,
});

export const GOLDEN_REFERENCE_CERTAINTIES = Object.freeze({
  rigidPanels: "very-high" as ReferenceConfidence,
  creaseAlignedRotation: "very-high" as ReferenceConfidence,
  deterministicTweenedMotion: "very-high" as ReferenceConfidence,
  topClosureUnfoldsBeforeBody: "very-high" as ReferenceConfidence,
  separateDustFlapPhase: "high" as ReferenceConfidence,
  majorAndBodyFoldsApproximatelyQuarterTurn: "high" as ReferenceConfidence,
  reverseUsesSameStateTargets: "medium-high" as ReferenceConfidence,
});

/** Facts the recording explicitly cannot certify and therefore must not be auto-authored. */
export const GOLDEN_REFERENCE_UNRESOLVED = Object.freeze([
  "exact mouse click timestamps",
  "exact animation-library implementation",
  "exact per-hinge numeric duration",
  "exact board thickness in millimetres",
  "exact bottom-lock construction",
  "exact glue-flap behavior",
  "original implementation root panel",
  "exact signed fold direction for every crease",
  "exact tuck/lock destination and collision priority",
] as const);

export function goldenReferenceStateIndex(id: GoldenReferenceState["id"]): number {
  const state = GOLDEN_REFERENCE_STATES.find((candidate) => candidate.id === id);
  if (!state) throw new Error(`Unknown golden reference state ${id}.`);
  return state.index;
}

export function validateGoldenReferenceEvidence(): void {
  const indexes = GOLDEN_REFERENCE_STATES.map((state) => state.index);
  if (indexes.some((value, index) => value !== index)) {
    throw new Error("Golden reference states must use contiguous zero-based indexes.");
  }
  for (const transition of GOLDEN_REFERENCE_TRANSITIONS) {
    if (!(transition.observedEndSeconds > transition.observedStartSeconds)) {
      throw new Error(`Reference transition ${transition.id} has a non-positive time window.`);
    }
    const from = goldenReferenceStateIndex(transition.fromState);
    const to = goldenReferenceStateIndex(transition.toState);
    if (transition.direction === "forward" && to <= from) {
      throw new Error(`Forward reference transition ${transition.id} does not advance state.`);
    }
    if (transition.direction === "backward" && to >= from) {
      throw new Error(`Backward reference transition ${transition.id} does not reverse state.`);
    }
  }
}
