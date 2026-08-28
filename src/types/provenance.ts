/**
 * Provenance vocabulary for packaging parameters (#24).
 *
 * A measured manufacturing fact and a preview assumption can carry the same
 * number, the same unit and the same name while meaning entirely different
 * things: a +110 mm unfolded gusset web is not a 110 mm filled body depth, and
 * a nominal finished width is not a production web width.
 *
 * Recording where every critical value came from is what keeps a convincing 3D
 * preview from silently becoming a manufacturing claim. Nothing here changes
 * geometry — it only makes the difference inspectable and enforceable.
 */

/** Where a packaging parameter's value came from. */
export type ParameterProvenance =
  /** Measured directly from a client/manufacturer source document. */
  | "measured"
  /** Computed exactly from other certifiable parameters. No new information. */
  | "derived"
  /** Chosen and approved by a human against a stated basis. */
  | "authored"
  /** A visual preview assumption. Never a manufacturing fact. */
  | "assumed"
  /** Observed in the source, meaning not yet established. */
  | "unresolved";

/**
 * Provenance levels that may back a manufacturing claim.
 *
 * `assumed` and `unresolved` are deliberately excluded: an assumption is not
 * evidence, and an unresolved observation is not a measurement.
 */
export const CERTIFIABLE_PROVENANCE = ["measured", "derived", "authored"] as const;

export type CertifiableProvenance = (typeof CERTIFIABLE_PROVENANCE)[number];

export type ProvenanceUnit = "mm" | "deg" | "count" | "ratio" | "none";

/** What still has to happen before an unresolved observation can be trusted. */
export type ProvenanceResolutionNeed =
  | "source-review"
  | "source-vector"
  | "converter-confirmation";

type ParameterBase = {
  /** Stable dotted key, e.g. `productionWeb.widthMm`. Unique within a ledger. */
  id: string;
  label: string;
  /** Numeric value where the parameter is dimensional. Semantics carry none. */
  value?: number;
  unit?: ProvenanceUnit;
  note: string;
};

export type MeasuredParameter = ParameterBase & {
  provenance: "measured";
  /** Citation for the client/manufacturer source that establishes the value. */
  source: string;
};

export type DerivedParameter = ParameterBase & {
  provenance: "derived";
  /** Parameter ids this value is computed from; each must be certifiable. */
  derivedFrom: string[];
};

export type AuthoredParameter = ParameterBase & {
  provenance: "authored";
  /** Who approved this value, and against what basis. */
  approvedBy: string;
};

export type AssumedParameter = ParameterBase & {
  provenance: "assumed";
  /** Structural marker: an assumption exists to serve the preview, nothing else. */
  appliesTo: "preview";
};

export type UnresolvedParameter = ParameterBase & {
  provenance: "unresolved";
  /** What the source actually shows, stated without interpreting it. */
  observed: string;
  needs: ProvenanceResolutionNeed;
};

export type ParameterRecord =
  | MeasuredParameter
  | DerivedParameter
  | AuthoredParameter
  | AssumedParameter
  | UnresolvedParameter;

/** The complete provenance position for one product or specification. */
export type ProvenanceLedger = {
  /** Product, SKU or specification id this ledger describes. */
  subjectId: string;
  records: readonly ParameterRecord[];
};

/**
 * A statement that production output would make about a product.
 *
 * A claim is only ever as good as its weakest input, so it names the exact
 * parameters it stands on rather than being asserted directly.
 */
export type ClaimScope =
  /** Asserted by print-ready manufacturing output. Refusal blocks export. */
  | "production-output"
  /** Asserted only by the visual preview. Refusal is recorded, not blocking. */
  | "preview";

export type ManufacturingClaim = {
  id: string;
  label: string;
  scope: ClaimScope;
  /** Every parameter that must be certifiable for the claim to hold. */
  requires: readonly string[];
  /** What production output asserts when this claim is supported. */
  asserts: string;
};

export type ClaimBlocker = {
  parameterId: string;
  reason: "missing" | "assumed" | "unresolved";
  detail: string;
};

export type ClaimEvaluation = {
  claim: ManufacturingClaim;
  /**
   * Whether this product makes the claim at all.
   *
   * A ledger that declares none of a claim's parameters is not hiding an
   * inconvenient fact — the construction simply has no such geometry, as with
   * an apparel GLB and a printed film web. Declaring some but not all of them
   * is a genuine gap and stays applicable so the missing ones block.
   */
  applicable: boolean;
  supported: boolean;
  blockedBy: readonly ClaimBlocker[];
};

export type ProvenanceSummary = Record<ParameterProvenance, number>;
