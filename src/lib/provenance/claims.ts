import type {
  ClaimBlocker,
  ClaimEvaluation,
  ManufacturingClaim,
  ProvenanceLedger,
} from "@/types/provenance";
import { findParameter, isCertifiable } from "./ledger";

/**
 * The claims a production export would make about a packaging product (#24).
 *
 * These are stated once, centrally, so that adding an export path cannot
 * quietly introduce a new assertion that nothing checks. A claim is refused
 * when any parameter it stands on is missing, assumed or unresolved.
 */
export const PACKAGING_CLAIMS: readonly ManufacturingClaim[] = Object.freeze([
  Object.freeze({
    id: "production-web-geometry",
    label: "Production web geometry",
    scope: "production-output",
    requires: ["productionWeb.widthMm", "productionWeb.repeatMm", "productionWeb.laneCount"],
    asserts:
      "The exported sheet reproduces the source-measured production web width and repeat exactly.",
  }),
  Object.freeze({
    id: "artwork-region-mapping",
    label: "Printable region mapping",
    scope: "production-output",
    requires: ["productionWeb.segmentBoundaries", "productionWeb.printableRegions"],
    asserts:
      "Customer artwork lands on the measured printable regions and not on technical bands.",
  }),
  Object.freeze({
    id: "technical-band-semantics",
    label: "Technical band semantics",
    scope: "preview",
    requires: ["productionWeb.technicalBandMeaning"],
    asserts:
      "The non-printing bands are identified by their actual converting operation.",
  }),
  Object.freeze({
    id: "finished-body-form",
    label: "Finished filled body form",
    scope: "preview",
    requires: ["body.openedDepthMm"],
    asserts: "The depicted filled body matches the finished product.",
  }),
  Object.freeze({
    id: "seal-and-closure-construction",
    label: "Seal and closure construction",
    scope: "preview",
    requires: ["closure.sealConstruction"],
    asserts: "Seal, notch and zipper construction match the converter's specification.",
  }),
]);

function blockerFor(ledger: ProvenanceLedger, parameterId: string): ClaimBlocker | null {
  const record = findParameter(ledger, parameterId);
  if (!record) {
    return {
      parameterId,
      reason: "missing",
      detail: `${ledger.subjectId} records no provenance for ${parameterId}.`,
    };
  }
  if (isCertifiable(record)) return null;
  return {
    parameterId,
    reason: record.provenance === "assumed" ? "assumed" : "unresolved",
    detail:
      record.provenance === "assumed"
        ? `${record.label} is a preview assumption: ${record.note}`
        : `${record.label} is unresolved: ${record.note}`,
  };
}

export function evaluateClaim(
  ledger: ProvenanceLedger,
  claim: ManufacturingClaim,
): ClaimEvaluation {
  const applicable = claim.requires.some(
    (parameterId) => findParameter(ledger, parameterId) !== null,
  );
  if (!applicable) return { claim, applicable: false, supported: false, blockedBy: [] };
  const blockedBy = claim.requires
    .map((parameterId) => blockerFor(ledger, parameterId))
    .filter((blocker): blocker is ClaimBlocker => blocker !== null);
  return { claim, applicable: true, supported: blockedBy.length === 0, blockedBy };
}

export function evaluateClaims(
  ledger: ProvenanceLedger,
  claims: readonly ManufacturingClaim[] = PACKAGING_CLAIMS,
): ClaimEvaluation[] {
  return claims.map((claim) => evaluateClaim(ledger, claim));
}

export function claimsInScope(
  claims: readonly ManufacturingClaim[],
  scope: ManufacturingClaim["scope"],
) {
  return claims.filter((claim) => claim.scope === scope);
}

export function supportedClaims(evaluations: readonly ClaimEvaluation[]) {
  return evaluations.filter((evaluation) => evaluation.supported);
}

/** Claims the product makes but cannot back. Inapplicable claims are not refusals. */
export function refusedClaims(evaluations: readonly ClaimEvaluation[]) {
  return evaluations.filter((evaluation) => evaluation.applicable && !evaluation.supported);
}

/**
 * Certified metadata is the one place where a mistake becomes a durable,
 * shippable falsehood, so it is built by filter rather than by hand: only
 * supported claims can appear, and each one names the parameters backing it.
 */
export type CertifiedClaimMetadata = {
  subjectId: string;
  claims: Array<{ id: string; label: string; asserts: string; backedBy: string[] }>;
  refused: Array<{ id: string; label: string; reasons: string[] }>;
};

export function certifiedClaimMetadata(
  ledger: ProvenanceLedger,
  claims: readonly ManufacturingClaim[] = PACKAGING_CLAIMS,
): CertifiedClaimMetadata {
  const evaluations = evaluateClaims(ledger, claims);
  return {
    subjectId: ledger.subjectId,
    claims: supportedClaims(evaluations).map((evaluation) => ({
      id: evaluation.claim.id,
      label: evaluation.claim.label,
      asserts: evaluation.claim.asserts,
      backedBy: [...evaluation.claim.requires],
    })),
    refused: refusedClaims(evaluations).map((evaluation) => ({
      id: evaluation.claim.id,
      label: evaluation.claim.label,
      reasons: evaluation.blockedBy.map((blocker) => blocker.detail),
    })),
  };
}
