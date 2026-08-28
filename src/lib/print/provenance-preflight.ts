import type { ProductConfig } from "@/types/configurator";
import type { ClaimEvaluation, ProvenanceLedger } from "@/types/provenance";
import {
  certifiedClaimMetadata,
  claimsInScope,
  evaluateClaims,
  PACKAGING_CLAIMS,
  refusedClaims,
} from "@/lib/provenance/claims";
import { assumedParameters, unresolvedParameters } from "@/lib/provenance/ledger";
import { resolveManufacturingProvenance } from "@/lib/provenance/resolve-provenance";
import type { PreflightIssue, PreflightReport } from "./types";

export type ProvenancePreflight = {
  ledger: ProvenanceLedger;
  evaluations: ClaimEvaluation[];
  issues: PreflightIssue[];
  check: PreflightReport["checks"][number];
};

/**
 * Manufacturing-fact provenance gate for production output (#24).
 *
 * Production-output claims fail closed: if the exported sheet would assert a
 * geometry the source does not establish, the export is refused. Preview-scope
 * claims never block — a pouch whose filled depth is an assumption is still
 * perfectly printable, and refusing that export would punish honesty.
 * Assumptions and unresolved observations are always reported so they stay
 * visible and cannot drift into certified metadata unnoticed.
 */
export function provenancePreflight(product: ProductConfig): ProvenancePreflight {
  const ledger = resolveManufacturingProvenance(product);
  const evaluations = evaluateClaims(ledger, PACKAGING_CLAIMS);
  const issues: PreflightIssue[] = [];

  const blockingIds = new Set(
    claimsInScope(PACKAGING_CLAIMS, "production-output").map((claim) => claim.id),
  );
  const refused = refusedClaims(evaluations);
  const blocking = refused.filter((evaluation) => blockingIds.has(evaluation.claim.id));

  for (const evaluation of blocking) {
    issues.push({
      code: "UNSUPPORTED_MANUFACTURING_CLAIM",
      severity: "error",
      message: `${evaluation.claim.label} cannot be certified for ${ledger.subjectId}: ${evaluation.blockedBy
        .map((blocker) => blocker.detail)
        .join(" ")}`,
    });
  }

  for (const evaluation of refused) {
    if (blockingIds.has(evaluation.claim.id)) continue;
    issues.push({
      code: "UNCERTIFIED_PREVIEW_CLAIM",
      severity: "info",
      message: `${evaluation.claim.label} is not certified for ${ledger.subjectId} and is excluded from output metadata. ${evaluation.blockedBy
        .map((blocker) => blocker.detail)
        .join(" ")}`,
    });
  }

  const unresolved = unresolvedParameters(ledger);
  if (unresolved.length) {
    issues.push({
      code: "UNRESOLVED_MANUFACTURING_SEMANTICS",
      severity: "warning",
      message: `${unresolved.length} source observation${unresolved.length === 1 ? "" : "s"} still lack an established manufacturing meaning: ${unresolved
        .map((record) => record.label)
        .join("; ")}.`,
    });
  }

  const assumed = assumedParameters(ledger);
  if (assumed.length) {
    issues.push({
      code: "PREVIEW_ASSUMPTIONS_PRESENT",
      severity: "info",
      message: `${assumed.length} preview assumption${assumed.length === 1 ? "" : "s"} drive the 3D view only and are not manufacturing facts: ${assumed
        .map((record) => record.label)
        .join("; ")}.`,
    });
  }

  return {
    ledger,
    evaluations,
    issues,
    check: {
      name: "Manufacturing fact provenance",
      passed: blocking.length === 0,
      detail: blocking.length
        ? `${blocking.length} production claim${blocking.length === 1 ? "" : "s"} rest on assumed, unresolved or undeclared parameters.`
        : `Every production-output claim is backed by measured, exactly derived or approved parameters. ${refused.length - blocking.length} preview claim${refused.length - blocking.length === 1 ? "" : "s"} remain uncertified and excluded from output metadata.`,
    },
  };
}

/** Folds the provenance gate into an existing preflight report. */
export function withProvenanceCheck(
  report: PreflightReport,
  product: ProductConfig,
): PreflightReport {
  const result = provenancePreflight(product);
  return {
    ...report,
    passed: report.passed && result.check.passed,
    issues: [...report.issues, ...result.issues],
    checks: [...report.checks, result.check],
    provenance: certifiedClaimMetadata(result.ledger, PACKAGING_CLAIMS),
  };
}
