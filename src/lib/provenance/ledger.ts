import {
  CERTIFIABLE_PROVENANCE,
  type CertifiableProvenance,
  type ParameterProvenance,
  type ParameterRecord,
  type ProvenanceLedger,
  type ProvenanceSummary,
} from "@/types/provenance";

/** A ledger that cannot be trusted is worse than no ledger, so this throws. */
export class ProvenanceLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvenanceLedgerError";
  }
}

const CERTIFIABLE = new Set<ParameterProvenance>(CERTIFIABLE_PROVENANCE);

export function isCertifiable(
  record: ParameterRecord,
): record is Extract<ParameterRecord, { provenance: CertifiableProvenance }> {
  return CERTIFIABLE.has(record.provenance);
}

function assertUniqueIds(subjectId: string, records: readonly ParameterRecord[]) {
  const seen = new Set<string>();
  for (const record of records) {
    if (!record.id.trim()) {
      throw new ProvenanceLedgerError(`${subjectId} has a parameter with an empty id.`);
    }
    if (seen.has(record.id)) {
      throw new ProvenanceLedgerError(
        `${subjectId} declares parameter ${record.id} more than once.`,
      );
    }
    seen.add(record.id);
  }
}

/**
 * A derived value carries no information of its own, so it inherits the
 * standing of its inputs. Allowing it to reference an assumption would let a
 * preview number re-enter the ledger wearing a certifiable label — exactly the
 * blurring this module exists to prevent.
 */
function assertDerivationsAreSound(subjectId: string, records: readonly ParameterRecord[]) {
  const byId = new Map(records.map((record) => [record.id, record]));

  for (const record of records) {
    if (record.provenance !== "derived") continue;
    if (!record.derivedFrom.length) {
      throw new ProvenanceLedgerError(
        `${subjectId} parameter ${record.id} is derived but names no source parameters.`,
      );
    }
    for (const sourceId of record.derivedFrom) {
      const source = byId.get(sourceId);
      if (!source) {
        throw new ProvenanceLedgerError(
          `${subjectId} parameter ${record.id} derives from unknown parameter ${sourceId}.`,
        );
      }
      if (!isCertifiable(source)) {
        throw new ProvenanceLedgerError(
          `${subjectId} parameter ${record.id} derives from ${sourceId}, which is ${source.provenance}. A derived value may not launder an assumption or an unresolved observation.`,
        );
      }
    }
  }

  assertNoDerivationCycles(subjectId, records, byId);
}

function assertNoDerivationCycles(
  subjectId: string,
  records: readonly ParameterRecord[],
  byId: ReadonlyMap<string, ParameterRecord>,
) {
  const resolved = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string, trail: string[]) => {
    const record = byId.get(id);
    if (!record || record.provenance !== "derived") return;
    if (resolved.has(id)) return;
    if (visiting.has(id)) {
      throw new ProvenanceLedgerError(
        `${subjectId} has a circular derivation: ${[...trail, id].join(" -> ")}.`,
      );
    }
    visiting.add(id);
    for (const sourceId of record.derivedFrom) visit(sourceId, [...trail, id]);
    visiting.delete(id);
    resolved.add(id);
  };

  for (const record of records) visit(record.id, []);
}

/** Builds a validated ledger. Ordering of records is preserved for display. */
export function createProvenanceLedger(
  subjectId: string,
  records: readonly ParameterRecord[],
): ProvenanceLedger {
  if (!subjectId.trim()) {
    throw new ProvenanceLedgerError("A provenance ledger needs a subject id.");
  }
  assertUniqueIds(subjectId, records);
  assertDerivationsAreSound(subjectId, records);
  return Object.freeze({ subjectId, records: Object.freeze([...records]) });
}

export function findParameter(
  ledger: ProvenanceLedger,
  parameterId: string,
): ParameterRecord | null {
  return ledger.records.find((record) => record.id === parameterId) ?? null;
}

export function parametersWithProvenance(
  ledger: ProvenanceLedger,
  provenance: ParameterProvenance,
): ParameterRecord[] {
  return ledger.records.filter((record) => record.provenance === provenance);
}

/** Observations whose manufacturing meaning is still open. */
export function unresolvedParameters(ledger: ProvenanceLedger) {
  return ledger.records.filter((record) => record.provenance === "unresolved");
}

/** Values that exist only to make the 3D preview convincing. */
export function assumedParameters(ledger: ProvenanceLedger) {
  return ledger.records.filter((record) => record.provenance === "assumed");
}

export function certifiableParameterIds(ledger: ProvenanceLedger): Set<string> {
  return new Set(ledger.records.filter(isCertifiable).map((record) => record.id));
}

export function summarizeLedger(ledger: ProvenanceLedger): ProvenanceSummary {
  const summary: ProvenanceSummary = {
    measured: 0,
    derived: 0,
    authored: 0,
    assumed: 0,
    unresolved: 0,
  };
  for (const record of ledger.records) summary[record.provenance] += 1;
  return summary;
}

/** Merges ledgers that describe the same subject from different sources. */
export function mergeLedgers(
  subjectId: string,
  ledgers: readonly ProvenanceLedger[],
): ProvenanceLedger {
  return createProvenanceLedger(
    subjectId,
    ledgers.flatMap((ledger) => [...ledger.records]),
  );
}
