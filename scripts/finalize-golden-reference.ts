import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  evaluateGoldenReferenceVisualReview,
  type GoldenReferenceVisualReviewInput,
} from "../src/lib/structure";

type RuntimeSummary = Readonly<{
  verdict?: string;
  selectedCandidate?: { id?: string };
  runtime?: {
    resolvedHingeCount?: number;
    planStepCount?: number;
    reachesFlat?: boolean;
    planErrors?: readonly unknown[];
    certificate?: { passed?: boolean };
  };
  certificationBoundary?: {
    referenceRecreation?: boolean;
    manufacturingConstructionCertified?: boolean;
  };
}>;

function usage(): never {
  console.error(
    "Usage: npm run finalize:golden-reference -- <reference-run-summary.json> <visual-review.json> [--out <reference-final-verdict.json>]",
  );
  process.exit(2);
}

function parseArgs(argv: readonly string[]) {
  let runtimePath: string | null = null;
  let reviewPath: string | null = null;
  let outputPath = ".quality-local/golden-reference/reference-final-verdict.json";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) usage();
      outputPath = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) usage();
    if (!runtimePath) runtimePath = arg;
    else if (!reviewPath) reviewPath = arg;
    else usage();
  }
  if (!runtimePath || !reviewPath) usage();
  return { runtimePath, reviewPath, outputPath };
}

function parseObject(text: string, label: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must contain one JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function asJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const args = parseArgs(process.argv.slice(2));
const runtime = parseObject(await readFile(args.runtimePath, "utf8"), "Golden reference runtime summary") as RuntimeSummary;
const review = parseObject(await readFile(args.reviewPath, "utf8"), "Golden visual review") as unknown as GoldenReferenceVisualReviewInput;
const visual = evaluateGoldenReferenceVisualReview(review);

const runtimeVerdict = runtime.verdict === "REFERENCE_RECREATION_RUNTIME_PASS_NOT_MANUFACTURING_CERTIFICATION";
const candidateMatches =
  typeof runtime.selectedCandidate?.id === "string" &&
  runtime.selectedCandidate.id === visual.candidateId;
const runtimeShape =
  runtime.runtime?.resolvedHingeCount === 16 &&
  runtime.runtime?.planStepCount === 4 &&
  runtime.runtime?.reachesFlat === true &&
  Array.isArray(runtime.runtime?.planErrors) &&
  runtime.runtime.planErrors.length === 0 &&
  runtime.runtime?.certificate?.passed === true;
const boundaryHonest =
  runtime.certificationBoundary?.referenceRecreation === true &&
  runtime.certificationBoundary?.manufacturingConstructionCertified === false;

const gates = {
  runtimeVerdict,
  candidateMatches,
  runtimeShape,
  boundaryHonest,
  visualReference: visual.passed,
} as const;
const passed = Object.values(gates).every(Boolean);
const report = {
  schemaVersion: 1,
  verdict: passed
    ? "REFERENCE_RECREATION_CERTIFIED_NOT_MANUFACTURING_CERTIFICATION"
    : "BLOCKED",
  candidateId: visual.candidateId,
  runtimeSummary: resolve(args.runtimePath),
  visualReview: resolve(args.reviewPath),
  visualScore: visual,
  gates,
  certificationBoundary: {
    referenceRecreationCertified: passed,
    manufacturingConstructionCertified: false,
    manufacturingCertificationRequires: [
      "converter-approved stock/caliper thickness",
      "converter-approved physical top/bottom convention",
      "converter-approved signed bottom-lock diagonal folds",
      "glue/tuck/lock destinations and physical assembly semantics",
    ],
  },
};

const output = resolve(args.outputPath);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, asJson(report));
console.log(asJson({ output, ...report }));
if (!passed) process.exitCode = 1;
