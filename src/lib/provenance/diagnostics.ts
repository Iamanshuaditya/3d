import type { ProductConfig } from "@/types/configurator";
import type { ClaimScope, ProvenanceSummary } from "@/types/provenance";
import { claimsInScope, evaluateClaims, PACKAGING_CLAIMS } from "./claims";
import { assumedParameters, summarizeLedger, unresolvedParameters } from "./ledger";
import { resolveManufacturingProvenance } from "./resolve-provenance";

export type ProvenanceClaimState = "supported" | "refused" | "not-applicable";

export type ProductProvenanceDiagnostics = {
  subjectId: string;
  summary: ProvenanceSummary;
  /** Observations from the source whose manufacturing meaning is still open. */
  unresolved: Array<{ id: string; label: string; needs: string; note: string }>;
  /** Values that exist only to make the preview convincing. */
  assumptions: Array<{
    id: string;
    label: string;
    value: number | null;
    unit: string | null;
    note: string;
  }>;
  claims: Array<{
    id: string;
    label: string;
    scope: ClaimScope;
    state: ProvenanceClaimState;
    reasons: string[];
  }>;
  /** True when production output would assert geometry the source cannot back. */
  productionBlocked: boolean;
};

/**
 * Operator-facing provenance view for one resolved product (#24).
 *
 * Onboarding a product is exactly when unresolved semantics are cheapest to
 * chase down, so the gaps are surfaced here rather than waiting for a refused
 * export weeks later.
 */
export function productProvenanceDiagnostics(
  product: ProductConfig,
): ProductProvenanceDiagnostics {
  const ledger = resolveManufacturingProvenance(product);
  const evaluations = evaluateClaims(ledger, PACKAGING_CLAIMS);
  const blockingIds = new Set(
    claimsInScope(PACKAGING_CLAIMS, "production-output").map((claim) => claim.id),
  );

  return {
    subjectId: ledger.subjectId,
    summary: summarizeLedger(ledger),
    unresolved: unresolvedParameters(ledger).map((record) => ({
      id: record.id,
      label: record.label,
      needs: record.needs,
      note: record.note,
    })),
    assumptions: assumedParameters(ledger).map((record) => ({
      id: record.id,
      label: record.label,
      value: record.value ?? null,
      unit: record.unit ?? null,
      note: record.note,
    })),
    claims: evaluations.map((evaluation) => ({
      id: evaluation.claim.id,
      label: evaluation.claim.label,
      scope: evaluation.claim.scope,
      state: !evaluation.applicable
        ? ("not-applicable" as const)
        : evaluation.supported
          ? ("supported" as const)
          : ("refused" as const),
      reasons: evaluation.blockedBy.map((blocker) => blocker.detail),
    })),
    productionBlocked: evaluations.some(
      (evaluation) =>
        evaluation.applicable && !evaluation.supported && blockingIds.has(evaluation.claim.id),
    ),
  };
}
