export const GOLDEN_REFERENCE_REQUIRED_CAPTURES = [
  "01-flat-2d",
  "02-flat-3d",
  "03-body-forming-50pct",
  "04-body-erect",
  "05-secondary-flaps",
  "06-major-and-final",
] as const;

export type GoldenReferenceCaptureId = (typeof GOLDEN_REFERENCE_REQUIRED_CAPTURES)[number];

export type GoldenReferenceVisualHardGates = Readonly<{
  canonicalFlatMatchesSource: boolean;
  windowRemainsPhysicalVoid: boolean;
  artworkChiralityCorrect: boolean;
  noPanelSwap: boolean;
  noArtworkJumpAcrossCreases: boolean;
  hingesCoincideWithSourceCreases: boolean;
  cameraStableAcross3dCaptures: boolean;
  forwardBackwardUseSameAbsoluteTargets: boolean;
  noBounceOrSpringOvershoot: boolean;
  manufacturingUsesCanonicalStructuralAuthority: boolean;
}>;

export type GoldenReferenceVisualScores = Readonly<{
  geometryAlignment: number; // 0..10
  mappingContinuity: number; // 0..10
  foldPoseMatch: number; // 0..10
  motionMatch: number; // 0..8
  cadVisualQuality: number; // 0..6
  materialLightingPresentation: number; // 0..6
}>;

export type GoldenReferenceCaptureEvidence = Readonly<{
  id: GoldenReferenceCaptureId;
  evidencePath: string;
  notes: string;
}>;

export type GoldenReferenceVisualReviewInput = Readonly<{
  schemaVersion: 1;
  candidateId: string;
  reviewer: string;
  referenceEvidence: string;
  captures: readonly GoldenReferenceCaptureEvidence[];
  hardGates: GoldenReferenceVisualHardGates;
  scores: GoldenReferenceVisualScores;
  notes?: string;
}>;

export type GoldenReferenceVisualScoreReport = Readonly<{
  schemaVersion: 1;
  candidateId: string;
  score: number;
  scoreOutOf: 50;
  threshold: 45;
  requiredCaptureCount: number;
  suppliedCaptureCount: number;
  missingCaptures: readonly GoldenReferenceCaptureId[];
  duplicateCaptures: readonly GoldenReferenceCaptureId[];
  failedHardGates: readonly (keyof GoldenReferenceVisualHardGates)[];
  gates: Readonly<{
    schemaVersion: boolean;
    candidateId: boolean;
    reviewer: boolean;
    referenceEvidence: boolean;
    completeCaptureSet: boolean;
    captureEvidencePaths: boolean;
    captureNotes: boolean;
    allHardGates: boolean;
    scoreThreshold: boolean;
  }>;
  passed: boolean;
}>;

const SCORE_LIMITS: Readonly<Record<keyof GoldenReferenceVisualScores, number>> = {
  geometryAlignment: 10,
  mappingContinuity: 10,
  foldPoseMatch: 10,
  motionMatch: 8,
  cadVisualQuality: 6,
  materialLightingPresentation: 6,
};

function textPresent(value: string): boolean {
  return value.trim().length > 0;
}

function validateScore(name: keyof GoldenReferenceVisualScores, value: number): void {
  const maximum = SCORE_LIMITS[name];
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`Golden visual score ${name} must be finite in [0, ${maximum}].`);
  }
}

/**
 * Independent visual/reference acceptance for the executable golden recreation.
 *
 * This report intentionally certifies reference reproduction only. It cannot
 * turn visually estimated stock, glue, tuck, or hidden bottom-lock behavior
 * into converter/manufacturer truth.
 */
export function evaluateGoldenReferenceVisualReview(
  review: GoldenReferenceVisualReviewInput,
): GoldenReferenceVisualScoreReport {
  if (review.schemaVersion !== 1) {
    throw new Error("Golden visual review schemaVersion must be 1.");
  }
  for (const [name, value] of Object.entries(review.scores) as [keyof GoldenReferenceVisualScores, number][]) {
    validateScore(name, value);
  }

  const suppliedIds = review.captures.map((capture) => capture.id);
  const suppliedSet = new Set(suppliedIds);
  const duplicates = GOLDEN_REFERENCE_REQUIRED_CAPTURES.filter(
    (id) => suppliedIds.filter((candidate) => candidate === id).length > 1,
  );
  const missing = GOLDEN_REFERENCE_REQUIRED_CAPTURES.filter((id) => !suppliedSet.has(id));
  const failedHardGates = (
    Object.entries(review.hardGates) as [keyof GoldenReferenceVisualHardGates, boolean][]
  )
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const score = (Object.keys(SCORE_LIMITS) as (keyof GoldenReferenceVisualScores)[])
    .reduce((total, name) => total + review.scores[name], 0);

  const gates = {
    schemaVersion: review.schemaVersion === 1,
    candidateId: textPresent(review.candidateId),
    reviewer: textPresent(review.reviewer),
    referenceEvidence: textPresent(review.referenceEvidence),
    completeCaptureSet:
      missing.length === 0 && duplicates.length === 0 && suppliedIds.length === GOLDEN_REFERENCE_REQUIRED_CAPTURES.length,
    captureEvidencePaths: review.captures.every((capture) => textPresent(capture.evidencePath)),
    captureNotes: review.captures.every((capture) => textPresent(capture.notes)),
    allHardGates: failedHardGates.length === 0,
    scoreThreshold: score >= 45,
  } as const;

  return {
    schemaVersion: 1,
    candidateId: review.candidateId,
    score,
    scoreOutOf: 50,
    threshold: 45,
    requiredCaptureCount: GOLDEN_REFERENCE_REQUIRED_CAPTURES.length,
    suppliedCaptureCount: review.captures.length,
    missingCaptures: missing,
    duplicateCaptures: duplicates,
    failedHardGates,
    gates,
    passed: Object.values(gates).every(Boolean),
  };
}

export function createGoldenReferenceVisualReviewTemplate(
  candidateId: string,
): GoldenReferenceVisualReviewInput {
  return {
    schemaVersion: 1,
    candidateId,
    reviewer: "",
    referenceEvidence: "supplied reference video/screenshots",
    captures: GOLDEN_REFERENCE_REQUIRED_CAPTURES.map((id) => ({
      id,
      evidencePath: "",
      notes: "",
    })),
    hardGates: {
      canonicalFlatMatchesSource: false,
      windowRemainsPhysicalVoid: false,
      artworkChiralityCorrect: false,
      noPanelSwap: false,
      noArtworkJumpAcrossCreases: false,
      hingesCoincideWithSourceCreases: false,
      cameraStableAcross3dCaptures: false,
      forwardBackwardUseSameAbsoluteTargets: false,
      noBounceOrSpringOvershoot: false,
      manufacturingUsesCanonicalStructuralAuthority: false,
    },
    scores: {
      geometryAlignment: 0,
      mappingContinuity: 0,
      foldPoseMatch: 0,
      motionMatch: 0,
      cadVisualQuality: 0,
      materialLightingPresentation: 0,
    },
    notes: "Reference recreation only; manufacturer/converter certification remains a separate gate.",
  };
}
