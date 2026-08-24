import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  anglesAtStage,
  authoredPlan,
  validateUnfoldPlan,
} from "../src/lib/configurator/unfold-plan";
import {
  applyLockBottomGoldenSourceProfile,
  buildPlanarGraph,
  certifyStructuralFoldRuntime,
  classifyLockBottomGoldenGeometry,
  classifyLockBottomGoldenHinges,
  compileLockBottomGoldenConstruction,
  createGoldenReferenceRecreationCandidate,
  evaluateLockBottomGoldenAcceptance,
  extractStructuralPanels,
  importVectorPdfRawAuthority,
  inspectStructuralConstruction,
  listGoldenReferenceRecreationCandidates,
  resolveStructuralRig,
  type GoldenReferenceClosureVariant,
  type GoldenReferenceTopSide,
  type HingeAngles,
} from "../src/lib/structure";

const DEFAULT_OUTPUT_DIR = ".quality-local/golden-reference";
const DEFAULT_THICKNESS_MM = 0.6;

type Args = {
  pdf: string;
  outputDir: string;
  physicalTop: GoldenReferenceTopSide;
  closureVariant: GoldenReferenceClosureVariant;
  boardThicknessMm: number;
};

function usage(): never {
  console.error(
    [
      "Usage: npm run verify:golden-reference -- <authorized-reference.pdf>",
      "  [--top north|south]",
      "  [--closure plain-final|window-final]",
      "  [--thickness <mm>]",
      "  [--out <local-output-dir>]",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv: readonly string[]): Args {
  let pdf: string | null = null;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let physicalTop: GoldenReferenceTopSide = "north";
  let closureVariant: GoldenReferenceClosureVariant = "plain-final";
  let boardThicknessMm = DEFAULT_THICKNESS_MM;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out" || arg === "--top" || arg === "--closure" || arg === "--thickness") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) usage();
      if (arg === "--out") outputDir = next;
      if (arg === "--top") {
        if (next !== "north" && next !== "south") usage();
        physicalTop = next;
      }
      if (arg === "--closure") {
        if (next !== "plain-final" && next !== "window-final") usage();
        closureVariant = next;
      }
      if (arg === "--thickness") {
        boardThicknessMm = Number(next);
        if (!Number.isFinite(boardThicknessMm) || boardThicknessMm <= 0) usage();
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) usage();
    if (pdf) usage();
    pdf = arg;
  }

  if (!pdf) usage();
  return { pdf, outputDir, physicalTop, closureVariant, boardThicknessMm };
}

function asJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function midpointPose(start: HingeAngles, end: HingeAngles, hingeIds: readonly string[]): HingeAngles {
  const pose: Record<string, number> = { ...start };
  for (const hingeId of hingeIds) {
    const a = start[hingeId] ?? 0;
    const b = end[hingeId] ?? 0;
    pose[hingeId] = a + (b - a) * 0.5;
  }
  return pose;
}

const args = parseArgs(process.argv.slice(2));
const bytes = new Uint8Array(await readFile(args.pdf));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const sourceName = basename(args.pdf);

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
const geometryRoles = classifyLockBottomGoldenGeometry(raw, panels);
const hingeRoles = classifyLockBottomGoldenHinges(geometryRoles, inventory);

const candidates = listGoldenReferenceRecreationCandidates(
  geometryRoles,
  hingeRoles,
  args.boardThicknessMm,
);
const selected = createGoldenReferenceRecreationCandidate(geometryRoles, hingeRoles, {
  physicalTop: args.physicalTop,
  closureVariant: args.closureVariant,
  boardThicknessMm: args.boardThicknessMm,
});
const compiled = compileLockBottomGoldenConstruction(
  raw.id,
  geometryRoles,
  hingeRoles,
  selected.input,
);
const rig = resolveStructuralRig(raw, graph, panels, compiled.construction);
const plan = authoredPlan([...compiled.unfold.steps], [...rig.articulatedHinges]);
const planErrors = validateUnfoldPlan(plan, [...rig.articulatedHinges]);
const runtime = certifyStructuralFoldRuntime(raw, panels, rig, 100);

const assembledPose = anglesAtStage(plan, 0);
const majorClosurePose = anglesAtStage(plan, 1);
const secondaryPose = anglesAtStage(plan, 2);
const bodyPose = anglesAtStage(plan, 3);
const flatPose = anglesAtStage(plan, 4);
const bodyStep = compiled.unfold.steps.find((step) => step.id === "body");
if (!bodyStep) throw new Error("Golden reference recreation has no body phase.");
const bodyFormingPose = midpointPose(bodyPose, flatPose, bodyStep.hingeIds);

const captureManifest = {
  schemaVersion: 1,
  evidenceKind: "REFERENCE_RECREATION_VISUAL_CHECK_NOT_MANUFACTURING_CERTIFICATION",
  cameraRule:
    "Choose one camera before capture 01 and do not change position, target, FOV, zoom, orbit or model presentation rotation through captures 01-06.",
  diagnosticArtworkRule:
    "Use the same generated asymmetric diagnostic artwork for every 2D/3D capture. Do not rotate, mirror or replace per-panel textures to hide mapping errors.",
  modelRotationRad: compiled.modelRotationRad,
  captures: [
    {
      id: "01-flat-2d",
      kind: "canonical-2d",
      pose: "flat",
      requiredChecks: ["cut/crease source alignment", "real window", "corner markers", "sheet chirality"],
    },
    {
      id: "02-flat-3d",
      kind: "structural-3d",
      pose: flatPose,
      requiredChecks: ["3D flat boundary equals 2D", "window remains empty", "artwork orientation matches 2D"],
    },
    {
      id: "03-body-forming-50pct",
      kind: "structural-3d",
      pose: bodyFormingPose,
      interpolation: "50% of body phase angle delta; capture helper should use the same ease curve when sampling animation time",
      requiredChecks: ["rigid panels", "crease pivots", "no geometry rebuild", "no camera movement"],
    },
    {
      id: "04-body-erect",
      kind: "structural-3d",
      pose: bodyPose,
      requiredChecks: ["200x150 rectangular tube", "window broad wall opposite plain broad wall", "side walls upright"],
    },
    {
      id: "05-secondary-flaps",
      kind: "structural-3d",
      pose: secondaryPose,
      requiredChecks: ["narrow top dust flaps opened/positioned consistently", "hidden lower-lock estimate labelled reference-only"],
    },
    {
      id: "06-major-and-final",
      kind: "structural-3d-pair",
      majorPose: majorClosurePose,
      finalPose: assembledPose,
      requiredChecks: ["major closure precedes final closure", "same camera", "no bounce", "artwork does not jump"],
    },
  ],
};

const basePassed =
  acceptance.passed &&
  inventory.formsTree &&
  geometryRoles.passed &&
  hingeRoles.passed;
const compiledPassed =
  rig.hinges.length === 16 &&
  panels.length === 17 &&
  plan.source === "authored" &&
  plan.steps.length === 4 &&
  plan.reachesFlat &&
  planErrors.length === 0 &&
  runtime.passed;
const passed = basePassed && compiledPassed;

const summary = {
  schemaVersion: 1,
  verdict: passed
    ? "REFERENCE_RECREATION_RUNTIME_PASS_NOT_MANUFACTURING_CERTIFICATION"
    : "FAIL",
  source: { name: sourceName, sha256 },
  selectedCandidate: {
    id: selected.id,
    confidence: selected.confidence,
    physicalTop: selected.input.physicalTop,
    closureVariant: args.closureVariant,
    boardThicknessMm: selected.input.boardThicknessMm,
    assumptions: selected.assumptions,
  },
  candidateMatrix: candidates.map((candidate) => ({
    id: candidate.id,
    physicalTop: candidate.input.physicalTop,
    boardThicknessMm: candidate.input.boardThicknessMm,
    assumptions: candidate.assumptions,
  })),
  geometry: {
    acceptancePassed: acceptance.passed,
    panelCount: panels.length,
    hingeRoleCount: hingeRoles.roles.length,
    topologyRepairCount: profiled.repairs.length,
    windowOwnerCount: acceptance.windowOwnerCount,
    maxUvRoundTripMm: acceptance.maxUvRoundTripMm,
  },
  runtime: {
    resolvedHingeCount: rig.hinges.length,
    planSource: plan.source,
    planStepCount: plan.steps.length,
    reachesFlat: plan.reachesFlat,
    planErrors,
    certificate: runtime,
  },
  certificationBoundary: {
    referenceRecreation: passed,
    manufacturingConstructionCertified: false,
    stillRequiresConverterEvidence: [
      "actual stock/caliper thickness",
      "converter-approved physical top/bottom convention",
      "independent signed bottom-lock diagonal folds",
      "glue/tuck/lock destinations and collision/assembly semantics",
    ],
  },
};

const destination = resolve(args.outputDir);
await mkdir(destination, { recursive: true });
await Promise.all([
  writeFile(`${destination}/reference-run-summary.json`, asJson(summary)),
  writeFile(`${destination}/reference-candidate-matrix.json`, asJson(candidates)),
  writeFile(`${destination}/reference-selected-candidate.json`, asJson(selected)),
  writeFile(`${destination}/reference-compiled-construction.json`, asJson(compiled.construction)),
  writeFile(`${destination}/reference-unfold-spec.json`, asJson(compiled.unfold)),
  writeFile(`${destination}/reference-resolved-rig.json`, asJson(rig)),
  writeFile(`${destination}/reference-runtime-certificate.json`, asJson(runtime)),
  writeFile(`${destination}/reference-terminal-poses.json`, asJson({
    assembled: assembledPose,
    majorClosure: majorClosurePose,
    secondaryFlaps: secondaryPose,
    bodyErect: bodyPose,
    bodyForming50Percent: bodyFormingPose,
    flat: flatPose,
  })),
  writeFile(`${destination}/reference-capture-manifest.json`, asJson(captureManifest)),
]);

console.log(asJson({ outputDir: destination, ...summary }));
if (!passed) process.exitCode = 1;
