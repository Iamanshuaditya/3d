import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  applyLockBottomGoldenSourceProfile,
  buildPlanarGraph,
  evaluateLockBottomGoldenAcceptance,
  extractStructuralPanels,
  importVectorPdfRawAuthority,
  inspectStructuralConstruction,
} from "../src/lib/structure";

const DEFAULT_OUTPUT_DIR = ".quality-local/golden";

function usage(): never {
  console.error(
    "Usage: npm run verify:golden-local -- <authorized-reference.pdf> [--out <local-output-dir>]",
  );
  process.exit(2);
}

function parseArgs(argv: readonly string[]) {
  let pdf: string | null = null;
  let outputDir = DEFAULT_OUTPUT_DIR;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) usage();
      outputDir = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) usage();
    if (pdf) usage();
    pdf = arg;
  }

  if (!pdf) usage();
  return { pdf, outputDir };
}

function asJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const { pdf, outputDir } = parseArgs(process.argv.slice(2));
const bytes = new Uint8Array(await readFile(pdf));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const sourceName = basename(pdf);

const raw = await importVectorPdfRawAuthority(bytes, {
  id: "cloudlab-lock-bottom-window-300x150x200",
  sourceName,
  sourceSha256: sha256,
  rules: [
    { operation: "cut", spotName: "DieCutBlue" },
    { operation: "crease", spotName: "DieCutRed" },
  ],
  ignoredSpotNames: ["DieCutGreen"],
  metadata: {
    productName: "Lock Bottom and top incl. window",
    nominalDimensions: "300 x 150 x 200 mm",
    authority: "authorized-local-vector-pdf",
  },
});

const acceptance = evaluateLockBottomGoldenAcceptance(raw);
const profiled = applyLockBottomGoldenSourceProfile(raw);
const graph = buildPlanarGraph(profiled.topologyDieline);
const panels = extractStructuralPanels(raw, graph);
const inventory = inspectStructuralConstruction(raw, graph, panels);

const constructionTemplate = {
  schemaVersion: 1,
  sourceLock: {
    canonicalSchemaVersion: 2,
    dielineId: raw.id,
    sha256,
  },
  rootPanelId: null,
  boardThicknessMm: null,
  hinges: inventory.hingeCandidates.map((candidate) => ({
    id: candidate.id.replace(/^candidate-/, "hinge-"),
    parentPanelId: null,
    childPanelId: null,
    candidatePanels: [candidate.panelAId, candidate.panelBId],
    source: candidate.source,
    assembledAngleDeg: null,
    openAngleDeg: null,
    isPrimary: null,
    evidence: "GEOMETRY_PROVES_ADJACENCY_ONLY",
  })),
  unfoldSequence: null,
  unresolvedFacts: [
    "root panel",
    "parent/child direction for every crease",
    "mountain/valley sign",
    "assembled target angles",
    "board thickness",
    "glue seam role",
    "tuck/lock destinations",
    "bottom lock behavior",
    "fold order and transition grouping",
  ],
};

const summary = {
  schemaVersion: 1,
  source: {
    name: sourceName,
    sha256,
  },
  acceptancePassed: acceptance.passed,
  topology: {
    panelCount: acceptance.panelCount,
    creaseChainCount: acceptance.creaseChainCount,
    windowOwnerCount: acceptance.windowOwnerCount,
    repairCount: acceptance.profile.actualRepairCount,
    maxRepairDistanceMm: acceptance.profile.maxRepairDistanceMm,
  },
  geometry: {
    outerEnvelopeMm: acceptance.outerEnvelopeMm,
    outerEdgeCount: acceptance.outerEdgeCount,
    windowEdgeCount: acceptance.windowEdgeCount,
    windowAreaMm2: acceptance.windowAreaMm2,
    windowPerimeterMm: acceptance.windowPerimeterMm,
    maxUvRoundTripMm: acceptance.maxUvRoundTripMm,
  },
  flat: acceptance.flat,
  gates: acceptance.gates,
  construction: {
    formsTree: inventory.formsTree,
    hingeCandidateCount: inventory.hingeCandidates.length,
    semanticsResolved: false,
  },
  verdict:
    acceptance.passed && inventory.formsTree
      ? "GEOMETRY_ACCEPTED_CONSTRUCTION_SEMANTICS_STILL_UNRESOLVED"
      : "FAIL",
};

const destination = resolve(outputDir);
await mkdir(destination, { recursive: true });
await Promise.all([
  writeFile(`${destination}/golden-run-summary.json`, asJson(summary)),
  writeFile(`${destination}/golden-acceptance.json`, asJson(acceptance)),
  writeFile(
    `${destination}/golden-construction-inventory.json`,
    asJson({
      sourceSha256: sha256,
      topologyRepairs: profiled.repairs,
      inventory,
    }),
  ),
  writeFile(
    `${destination}/golden-construction-template.json`,
    asJson(constructionTemplate),
  ),
]);

console.log(asJson({ outputDir: destination, ...summary }));

if (!acceptance.passed || !inventory.formsTree) process.exitCode = 1;
