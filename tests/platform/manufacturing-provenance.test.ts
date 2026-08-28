import assert from "node:assert/strict";
import test from "node:test";
import {
  NEXIBLES_RSTZ_DIMENSIONS,
  NEXIBLES_RSTZ_POUCH_ID,
  nexiblesRstzPouchSpec,
} from "@/lib/configurator/nexibles-rstz-pouch";
import { PRODUCTS } from "@/lib/configurator/product-config";
import { buildPouchGeometry } from "@/lib/configurator/pouch-geometry";
import { normalizePrintJob } from "@/lib/print/normalize-job";
import { preflightPrintJob } from "@/lib/print/preflight";
import { provenancePreflight, withProvenanceCheck } from "@/lib/print/provenance-preflight";
import {
  certifiedClaimMetadata,
  evaluateClaim,
  evaluateClaims,
  PACKAGING_CLAIMS,
  refusedClaims,
} from "@/lib/provenance/claims";
import { productProvenanceDiagnostics } from "@/lib/provenance/diagnostics";
import {
  assumedParameters,
  createProvenanceLedger,
  findParameter,
  ProvenanceLedgerError,
  summarizeLedger,
  unresolvedParameters,
} from "@/lib/provenance/ledger";
import { pouchProvenanceLedger } from "@/lib/provenance/pouch-ledger";
import { resolveManufacturingProvenance } from "@/lib/provenance/resolve-provenance";
import { createEmptyDocument } from "@/lib/configurator/design-state";
import type { ParameterRecord } from "@/types/provenance";

const ledger = pouchProvenanceLedger(nexiblesRstzPouchSpec);

test("the measured Nexibles web is recorded separately from the visual pouch depth", () => {
  const webWidth = findParameter(ledger, "productionWeb.widthMm");
  const webRepeat = findParameter(ledger, "productionWeb.repeatMm");
  const nominalWidth = findParameter(ledger, "nominal.widthMm");
  const gussetWeb = findParameter(ledger, "nominal.gussetWebMm");
  const openedDepth = findParameter(ledger, "body.openedDepthMm");

  assert.equal(webWidth?.provenance, "measured");
  assert.equal(webWidth?.value, NEXIBLES_RSTZ_DIMENSIONS.productionWebWidthMm);
  assert.equal(webRepeat?.provenance, "measured");
  assert.equal(webRepeat?.value, NEXIBLES_RSTZ_DIMENSIONS.productionRepeatMm);

  // The nominal finished width and the production web width are different
  // facts that happen to look alike; the ledger must never merge them.
  assert.equal(nominalWidth?.provenance, "measured");
  assert.equal(nominalWidth?.value, NEXIBLES_RSTZ_DIMENSIONS.nominalWidthMm);
  assert.notEqual(nominalWidth?.value, webWidth?.value);

  // The +110 mm unfolded gusset is measured; the opened body depth it is
  // routinely confused with is a preview assumption and nothing more.
  assert.equal(gussetWeb?.provenance, "measured");
  assert.equal(gussetWeb?.value, NEXIBLES_RSTZ_DIMENSIONS.gussetWebMm);
  assert.equal(openedDepth?.provenance, "assumed");
  assert.notEqual(openedDepth?.value, gussetWeb?.value);
});

test("unknown slits, notches and technical marks are never silently guessed", () => {
  const unresolved = unresolvedParameters(ledger);
  const ids = unresolved.map((record) => record.id);

  assert.ok(ids.includes("sourceReview.right-reference-10.75"));
  assert.ok(ids.includes("sourceReview.circular-marks"));
  assert.ok(ids.includes("sourceReview.slitting-mark"));
  assert.ok(ids.includes("sourceReview.hatched-zones"));
  assert.ok(ids.includes("productionWeb.technicalBandMeaning"));

  // Every unresolved record must say what it needs, so it is actionable rather
  // than a permanent shrug.
  for (const record of unresolved) {
    assert.ok(record.provenance === "unresolved" && record.needs.length > 0);
    assert.ok(record.note.length > 0);
  }

  const guide = findParameter(ledger, "productionWeb.referenceGuide.right-reference-10.75");
  assert.equal(guide?.provenance, "unresolved");
  assert.equal(
    guide?.value,
    NEXIBLES_RSTZ_DIMENSIONS.productionWebWidthMm - NEXIBLES_RSTZ_DIMENSIONS.rightReferenceMm,
  );
});

test("a derived value may not launder an assumption or an unresolved observation", () => {
  const records: ParameterRecord[] = [
    {
      id: "body.openedDepthMm",
      label: "Opened body depth",
      provenance: "assumed",
      appliesTo: "preview",
      value: 78,
      note: "Preview only.",
    },
    {
      id: "productionWeb.widthMm",
      label: "Web width",
      provenance: "derived",
      derivedFrom: ["body.openedDepthMm"],
      note: "Attempts to promote an assumption into a manufacturing fact.",
    },
  ];
  assert.throws(
    () => createProvenanceLedger("laundering-attempt", records),
    ProvenanceLedgerError,
  );
});

test("a ledger rejects duplicate ids, dangling derivations and circular derivations", () => {
  assert.throws(
    () =>
      createProvenanceLedger("duplicate", [
        { id: "a", label: "A", provenance: "measured", source: "s", note: "n" },
        { id: "a", label: "A again", provenance: "measured", source: "s", note: "n" },
      ]),
    ProvenanceLedgerError,
  );
  assert.throws(
    () =>
      createProvenanceLedger("dangling", [
        { id: "a", label: "A", provenance: "derived", derivedFrom: ["missing"], note: "n" },
      ]),
    ProvenanceLedgerError,
  );
  assert.throws(
    () =>
      createProvenanceLedger("cycle", [
        { id: "a", label: "A", provenance: "derived", derivedFrom: ["b"], note: "n" },
        { id: "b", label: "B", provenance: "derived", derivedFrom: ["a"], note: "n" },
      ]),
    ProvenanceLedgerError,
  );
});

test("production output claims stand on measured geometry while preview claims stay refused", () => {
  const evaluations = evaluateClaims(ledger, PACKAGING_CLAIMS);
  const byId = new Map(evaluations.map((evaluation) => [evaluation.claim.id, evaluation]));

  assert.equal(byId.get("production-web-geometry")?.supported, true);
  assert.equal(byId.get("artwork-region-mapping")?.supported, true);

  // These are exactly the facts the source does not establish. Claiming them
  // would be the failure mode this issue exists to prevent.
  assert.equal(byId.get("technical-band-semantics")?.supported, false);
  assert.equal(byId.get("finished-body-form")?.supported, false);
  assert.equal(byId.get("seal-and-closure-construction")?.supported, false);

  for (const evaluation of refusedClaims(evaluations)) {
    assert.equal(evaluation.claim.scope, "preview");
    assert.ok(evaluation.blockedBy.length > 0);
  }
});

test("unresolved manufacturing facts cannot reach certified output metadata", () => {
  const metadata = certifiedClaimMetadata(ledger, PACKAGING_CLAIMS);
  const certifiedIds = metadata.claims.map((claim) => claim.id);

  assert.deepEqual(certifiedIds.sort(), ["artwork-region-mapping", "production-web-geometry"]);
  assert.ok(!certifiedIds.includes("technical-band-semantics"));
  assert.ok(!certifiedIds.includes("finished-body-form"));

  const serialized = JSON.stringify(metadata.claims);
  for (const record of [...unresolvedParameters(ledger), ...assumedParameters(ledger)]) {
    assert.ok(
      !serialized.includes(record.id),
      `${record.id} is ${record.provenance} and must not appear in certified metadata.`,
    );
  }
  assert.ok(metadata.refused.length > 0, "Refusals must stay recorded, not dropped.");
});

test("the print job for the measured pouch passes the provenance gate and carries its metadata", () => {
  const product = PRODUCTS[NEXIBLES_RSTZ_POUCH_ID];
  const design = createEmptyDocument(product);
  const report = withProvenanceCheck(
    preflightPrintJob(normalizePrintJob(product, design), "2026-08-29T00:00:00.000Z"),
    product,
  );

  const check = report.checks.find((entry) => entry.name === "Manufacturing fact provenance");
  assert.equal(check?.passed, true);
  assert.equal(report.provenance?.subjectId, NEXIBLES_RSTZ_POUCH_ID);
  assert.ok(report.provenance?.refused.some((claim) => claim.id === "finished-body-form"));

  // Preview assumptions must remain visible in the report without blocking a
  // perfectly printable sheet.
  const codes = report.issues.map((issue) => issue.code);
  assert.ok(codes.includes("PREVIEW_ASSUMPTIONS_PRESENT"));
  assert.ok(codes.includes("UNRESOLVED_MANUFACTURING_SEMANTICS"));
  assert.ok(!codes.includes("UNSUPPORTED_MANUFACTURING_CLAIM"));
});

test("a production-output claim resting on an unresolved dimension fails the export closed", () => {
  const brokenLedger = createProvenanceLedger("unresolved-web-fixture", [
    {
      id: "productionWeb.widthMm",
      label: "Production web width",
      provenance: "unresolved",
      observed: "Two conflicting across-web dimensions in the supplied sources",
      needs: "source-review",
      note: "The client sources disagree, so no web width is established.",
    },
    {
      id: "productionWeb.repeatMm",
      label: "Production web repeat",
      provenance: "measured",
      value: 684,
      unit: "mm",
      source: "Client web drawing",
      note: "Repeat is unambiguous.",
    },
    {
      id: "productionWeb.laneCount",
      label: "Lane count",
      provenance: "measured",
      value: 1,
      unit: "count",
      source: "Client web drawing",
      note: "Single lane.",
    },
  ]);

  const evaluation = evaluateClaim(
    brokenLedger,
    PACKAGING_CLAIMS.find((claim) => claim.id === "production-web-geometry")!,
  );
  assert.equal(evaluation.applicable, true);
  assert.equal(evaluation.supported, false);
  assert.equal(evaluation.blockedBy[0]?.reason, "unresolved");

  const product = {
    ...PRODUCTS[NEXIBLES_RSTZ_POUCH_ID],
    id: "unresolved-web-fixture",
    manufacturingProvenance: brokenLedger,
  };
  const result = provenancePreflight(product);
  assert.equal(result.check.passed, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.code === "UNSUPPORTED_MANUFACTURING_CLAIM" && issue.severity === "error",
    ),
  );

  // ProductionService throws ProductionPreflightError on any failed report, so
  // flipping `passed` here is what actually refuses the export.
  const clean = preflightPrintJob(
    normalizePrintJob(PRODUCTS[NEXIBLES_RSTZ_POUCH_ID], createEmptyDocument(PRODUCTS[NEXIBLES_RSTZ_POUCH_ID])),
    "2026-08-29T00:00:00.000Z",
  );
  assert.equal(withProvenanceCheck({ ...clean, passed: true }, product).passed, false);
});

test("a refused preview claim never blocks 3D preview geometry", () => {
  // The Nexibles pouch cannot certify its filled body depth, and it must still
  // build a complete preview mesh — refusing that would punish honesty.
  const diagnostics = productProvenanceDiagnostics(PRODUCTS[NEXIBLES_RSTZ_POUCH_ID]);
  assert.equal(diagnostics.productionBlocked, false);
  assert.ok(
    diagnostics.claims.some(
      (claim) => claim.id === "finished-body-form" && claim.state === "refused",
    ),
  );

  const geometry = buildPouchGeometry(nexiblesRstzPouchSpec);
  assert.ok(geometry, "A refused preview claim must not suppress preview geometry.");
});

test("a construction with no printed web makes no web claim at all", () => {
  // An apparel GLB has no production web. Refusing its export for a claim it
  // never makes would be a false positive, not caution.
  const apparel = PRODUCTS["tshirt"];
  const evaluations = evaluateClaims(resolveManufacturingProvenance(apparel), PACKAGING_CLAIMS);
  assert.ok(evaluations.every((evaluation) => !evaluation.applicable));
  assert.equal(provenancePreflight(apparel).check.passed, true);
});

test("a parametric SKU declares authored values rather than borrowing measured status", () => {
  const parametric = pouchProvenanceLedger({
    ...nexiblesRstzPouchSpec,
    id: "parametric-fixture",
    productionWeb: undefined,
  });
  assert.equal(findParameter(parametric, "productionWeb.widthMm")?.provenance, "authored");
  assert.equal(findParameter(parametric, "nominal.widthMm")?.provenance, "authored");
  assert.equal(summarizeLedger(parametric).measured, 0);

  // Authored values are certifiable, so an honest parametric product still exports.
  const evaluations = evaluateClaims(parametric, PACKAGING_CLAIMS);
  const webGeometry = evaluations.find((entry) => entry.claim.id === "production-web-geometry");
  assert.equal(webGeometry?.supported, true);
});
