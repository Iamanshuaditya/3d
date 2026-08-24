import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  applyLockBottomGoldenSourceProfile,
  buildPlanarGraph,
  evaluateLockBottomGoldenAcceptance,
  extractStructuralPanels,
  importVectorPdfRawAuthority,
  inspectStructuralConstruction,
} from "../src/lib/structure";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/inspect-golden-construction.ts <authorized-reference.pdf>");
  process.exit(2);
}

const bytes = new Uint8Array(await readFile(file));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const raw = await importVectorPdfRawAuthority(bytes, {
  id: "cloudlab-lock-bottom-window-300x150x200",
  sourceName: file.split(/[\\/]/).pop(),
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

const sourceAcceptance = evaluateLockBottomGoldenAcceptance(raw);
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

console.log(
  JSON.stringify(
    {
      sourceAcceptance,
      topologyRepairs: profiled.repairs,
      inventory,
      constructionTemplate,
    },
    null,
    2,
  ),
);

if (!sourceAcceptance.passed || !inventory.formsTree) process.exitCode = 1;
