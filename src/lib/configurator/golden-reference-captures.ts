import type { ArticulatedHinge, HingeAngles, UnfoldPlan, UnfoldSpec } from "@/types/unfold";
import {
  GOLDEN_REFERENCE_REQUIRED_CAPTURES,
  type GoldenReferenceCaptureId,
} from "@/lib/structure/golden-visual-score";
import { anglesAtStage, authoredPlan, validateUnfoldPlan } from "./unfold-plan";

/**
 * Shared definition of the six fixed-camera reference captures.
 *
 * The runtime verifier writes these poses into `reference-capture-manifest.json`
 * and the private capture route renders them. Both read this module so a capture
 * can never drift away from the pose the manifest claims it shows.
 */
export type GoldenReferenceCaptureKind =
  | "canonical-2d"
  | "structural-3d"
  | "structural-3d-pair";

export type GoldenReferenceCapture = Readonly<{
  id: GoldenReferenceCaptureId;
  kind: GoldenReferenceCaptureKind;
  /** Absolute hinge angles rendered for this capture. */
  pose: HingeAngles;
  /** Second pose of a paired capture, rendered beside `pose` on one camera. */
  pairedPose?: HingeAngles;
  interpolation?: string;
  requiredChecks: readonly string[];
}>;

export type GoldenReferenceTerminalPoses = Readonly<{
  assembled: HingeAngles;
  majorClosure: HingeAngles;
  secondaryFlaps: HingeAngles;
  bodyErect: HingeAngles;
  bodyForming50Percent: HingeAngles;
  flat: HingeAngles;
}>;

export type GoldenReferenceCapturePlan = Readonly<{
  plan: UnfoldPlan;
  planErrors: readonly string[];
  terminalPoses: GoldenReferenceTerminalPoses;
  captures: readonly GoldenReferenceCapture[];
}>;

const BODY_PHASE_ID = "body";

/** Assembled -> flat stage indexes produced by the four authored phases. */
const STAGE = Object.freeze({
  assembled: 0,
  majorClosure: 1,
  secondaryFlaps: 2,
  bodyErect: 3,
  flat: 4,
});

export function midpointPose(
  start: HingeAngles,
  end: HingeAngles,
  hingeIds: readonly string[],
): HingeAngles {
  const pose: Record<string, number> = { ...start };
  for (const hingeId of hingeIds) {
    const from = start[hingeId] ?? 0;
    const to = end[hingeId] ?? 0;
    pose[hingeId] = from + (to - from) * 0.5;
  }
  return pose;
}

export function buildGoldenReferenceCapturePlan(
  unfold: UnfoldSpec,
  articulatedHinges: readonly ArticulatedHinge[],
): GoldenReferenceCapturePlan {
  const plan = authoredPlan([...unfold.steps], [...articulatedHinges]);
  const planErrors = validateUnfoldPlan(plan, [...articulatedHinges]);

  const assembledPose = anglesAtStage(plan, STAGE.assembled);
  const majorClosurePose = anglesAtStage(plan, STAGE.majorClosure);
  const secondaryPose = anglesAtStage(plan, STAGE.secondaryFlaps);
  const bodyPose = anglesAtStage(plan, STAGE.bodyErect);
  const flatPose = anglesAtStage(plan, STAGE.flat);

  const bodyStep = unfold.steps.find((step) => step.id === BODY_PHASE_ID);
  if (!bodyStep) throw new Error("Golden reference recreation has no body phase.");
  const bodyFormingPose = midpointPose(bodyPose, flatPose, bodyStep.hingeIds);

  const captures: readonly GoldenReferenceCapture[] = [
    {
      id: "01-flat-2d",
      kind: "canonical-2d",
      pose: flatPose,
      requiredChecks: [
        "cut/crease source alignment",
        "real window",
        "corner markers",
        "sheet chirality",
      ],
    },
    {
      id: "02-flat-3d",
      kind: "structural-3d",
      pose: flatPose,
      requiredChecks: [
        "3D flat boundary equals 2D",
        "window remains empty",
        "artwork orientation matches 2D",
      ],
    },
    {
      id: "03-body-forming-50pct",
      kind: "structural-3d",
      pose: bodyFormingPose,
      interpolation:
        "50% of body phase angle delta; capture helper should use the same ease curve when sampling animation time",
      requiredChecks: [
        "rigid panels",
        "crease pivots",
        "no geometry rebuild",
        "no camera movement",
      ],
    },
    {
      id: "04-body-erect",
      kind: "structural-3d",
      pose: bodyPose,
      requiredChecks: [
        "200x150 rectangular tube",
        "window broad wall opposite plain broad wall",
        "side walls upright",
      ],
    },
    {
      id: "05-secondary-flaps",
      kind: "structural-3d",
      pose: secondaryPose,
      requiredChecks: [
        "narrow top dust flaps opened/positioned consistently",
        "hidden lower-lock estimate labelled reference-only",
      ],
    },
    {
      id: "06-major-and-final",
      kind: "structural-3d-pair",
      pose: majorClosurePose,
      pairedPose: assembledPose,
      requiredChecks: [
        "major closure precedes final closure",
        "same camera",
        "no bounce",
        "artwork does not jump",
      ],
    },
  ];

  const declared = captures.map((capture) => capture.id).join(",");
  const required = GOLDEN_REFERENCE_REQUIRED_CAPTURES.join(",");
  if (declared !== required) {
    throw new Error("Golden reference capture plan does not match the required capture set.");
  }

  const terminalPoses: GoldenReferenceTerminalPoses = {
    assembled: assembledPose,
    majorClosure: majorClosurePose,
    secondaryFlaps: secondaryPose,
    bodyErect: bodyPose,
    bodyForming50Percent: bodyFormingPose,
    flat: flatPose,
  };

  return { plan, planErrors, terminalPoses, captures };
}

export function findGoldenReferenceCapture(
  plan: GoldenReferenceCapturePlan,
  captureId: string,
): GoldenReferenceCapture | null {
  return plan.captures.find((capture) => capture.id === captureId) ?? null;
}
