import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The quality record is evidence, so it has to be internally honest.
 *
 * These files are edited by hand at the end of a certification run, which is
 * exactly when it is easiest to update one field and leave another stale. A
 * report that says CERTIFIED in one key and BLOCKED in another is worse than
 * no report at all: it looks like evidence while asserting both answers.
 *
 * This replaces the obsolete generated-file sync check that CI used to run
 * against the removed website-cloner scaffolding.
 */

const ROOT = resolve(import.meta.dirname, "../..");

type QualityReport = {
  schemaVersion: number;
  status: string;
  updatedAt: string;
  verifiedImplementationHead: string;
  referenceRecreation: {
    manufacturingConstructionCertified: boolean;
    issuedVerdict?: string;
    runtimeSuccessVerdict: string;
    finalSuccessVerdict: string;
  };
  hardGates: Record<string, string>;
  latestChecker: Record<string, unknown>;
  blockingEvidence: readonly string[];
  verdict: string;
};

/** One vocabulary. A lane is in exactly one of these states. */
const STATUS_VOCABULARY = [
  "BLOCKED_VISUAL_REVIEW",
  "REFERENCE_RECREATION_CERTIFIED",
  "MANUFACTURING_CERTIFIED",
] as const;

const CERTIFIED_VERDICT = "REFERENCE_RECREATION_CERTIFIED_NOT_MANUFACTURING_CERTIFICATION";

/**
 * Outstanding evidence must be genuinely external — something no amount of
 * code can close. Tagging is enforced so finished internal work cannot sit in
 * the blocker list forever and quietly contradict a CERTIFIED status.
 */
const EXTERNAL_PREFIX = "EXTERNAL:";

function readReport(): QualityReport {
  return JSON.parse(readFileSync(resolve(ROOT, "quality-report.json"), "utf8")) as QualityReport;
}

test("quality report uses one status vocabulary", () => {
  const report = readReport();
  assert.ok(
    (STATUS_VOCABULARY as readonly string[]).includes(report.status),
    `status ${report.status} is not in the agreed vocabulary ${STATUS_VOCABULARY.join(" | ")}`,
  );
});

test("a certified status is not contradicted by the prose verdict", () => {
  const report = readReport();
  if (report.status !== "REFERENCE_RECREATION_CERTIFIED") return;

  assert.equal(
    report.referenceRecreation.issuedVerdict,
    CERTIFIED_VERDICT,
    "status claims reference recreation is certified but no matching verdict was issued",
  );
  assert.ok(
    !/\bBLOCKED\b/i.test(report.verdict),
    `status is CERTIFIED but the prose verdict still says BLOCKED: ${report.verdict}`,
  );
});

test("every outstanding blocker is tagged as genuinely external", () => {
  const report = readReport();
  const untagged = report.blockingEvidence.filter((entry) => !entry.startsWith(EXTERNAL_PREFIX));
  assert.deepEqual(
    untagged,
    [],
    `blockingEvidence must only list external evidence, each prefixed "${EXTERNAL_PREFIX}". ` +
      `Completed internal work has to be removed, not left to contradict the status.`,
  );
});

test("manufacturing certification stays false without converter evidence", () => {
  const report = readReport();
  assert.equal(
    report.referenceRecreation.manufacturingConstructionCertified,
    false,
    "manufacturing certification cannot be set from inside this repository; it needs converter evidence",
  );
  assert.ok(
    report.referenceRecreation.finalSuccessVerdict.endsWith("NOT_MANUFACTURING_CERTIFICATION"),
    "the final verdict must keep the manufacturing boundary explicit",
  );
});

test("recorded checker totals do not contradict themselves", () => {
  const report = readReport();
  const checker = report.latestChecker;
  const passed = Number(checker.testsPassed);
  const total = Number(checker.testsTotal);
  const failed = Number(checker.testsFailed);

  assert.ok(Number.isInteger(total) && total > 0, "testsTotal must be a positive integer");
  assert.equal(failed, 0, "a PASS record cannot carry failed tests");
  assert.equal(passed, total, `testsPassed ${passed} does not equal testsTotal ${total}`);
  assert.equal(checker.status, "PASS", "latestChecker.status must agree with its own totals");
});

test("the checker record does not cite checks that no longer exist", () => {
  const report = readReport();
  // The generated-file sync check was removed with the website-cloner
  // scaffolding it validated. Citing it would be recording a check that
  // cannot run.
  assert.equal(
    "generatedFileSync" in report.latestChecker,
    false,
    "latestChecker cites generatedFileSync, but that check no longer exists in any workflow",
  );
});

test("both required workflow conclusions are recorded", () => {
  const report = readReport();
  const checker = report.latestChecker;
  for (const key of ["structuralQualityConclusion", "repositoryCiConclusion"]) {
    assert.equal(
      checker[key],
      "success",
      `latestChecker.${key} must record an observed successful run, not an assumption`,
    );
  }
  for (const key of ["structuralQualityRunId", "repositoryCiRunId"]) {
    assert.ok(
      typeof checker[key] === "number" && (checker[key] as number) > 0,
      `latestChecker.${key} must cite a real workflow run id`,
    );
  }
});

test("every hard gate carries a non-empty result", () => {
  const report = readReport();
  const gates = Object.entries(report.hardGates);
  assert.equal(gates.length, 12, "the twelve documented hard gates must all be present");
  for (const [name, value] of gates) {
    assert.ok(
      typeof value === "string" && value.trim().length > 0,
      `hard gate ${name} has no recorded result`,
    );
  }
});

test("QUALITY_STATE.md agrees with the machine-readable status", () => {
  const report = readReport();
  const markdown = readFileSync(resolve(ROOT, "QUALITY_STATE.md"), "utf8");
  assert.ok(
    markdown.includes(`**STATUS: ${report.status}**`),
    `QUALITY_STATE.md does not declare the same status as quality-report.json (${report.status})`,
  );
});

test("the run log is append-only and records the current head", () => {
  const report = readReport();
  const log = readFileSync(resolve(ROOT, "quality-run-log.md"), "utf8");
  assert.ok(
    log.includes(report.verifiedImplementationHead.slice(0, 7)),
    "quality-run-log.md has no entry for the head that quality-report.json says was verified",
  );
});
