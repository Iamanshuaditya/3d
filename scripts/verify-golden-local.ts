import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { authoredPlan, validateUnfoldPlan } from "../src/lib/configurator/unfold-plan";
import {
  applyLockBottomGoldenSourceProfile,
  buildPlanarGraph,
  certifyLockBottomGoldenBodyTube,
  certifyStructuralFoldRuntime,
  classifyLockBottomGoldenGeometry,
  classifyLockBottomGoldenHinges,
  compileLockBottomGoldenConstruction,
  createStructuralDiagnosticArtwork,
  evaluateLockBottomGoldenAcceptance,
  extractStructuralPanels,
  GOLDEN_REFERENCE_CERTAINTIES,
  GOLDEN_REFERENCE_RECORDING,
  GOLDEN_REFERENCE_STATES,
  GOLDEN_REFERENCE_TRANSITIONS,
  GOLDEN_REFERENCE_TWEEN,
  GOLDEN_REFERENCE_UNRESOLVED,
  importVectorPdfRawAuthority,
  inspectStructuralConstruction,
  resolveStructuralRig,
  validateGoldenReferenceEvidence,
  type GoldenReviewedConstructionInput,
} from "../src/lib/structure";

const DEFAULT_OUTPUT_DIR = ".quality-local/golden";

function usage(): never {
  console.error(
    "Usage: npm run verify:golden-local -- <authorized-reference.pdf> [--construction <reviewed-construction.json>] [--out <local-output-dir>]",
  );
  process.exit(2);
}

function parseArgs(argv: readonly string[]) {
  let pdf: string | null = null;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let constructionPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out" || arg === "--construction") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) usage();
      if (arg === "--out") outputDir = next;
      else constructionPath = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) usage();
    if (pdf) usage();
    pdf = arg;
  }

  if (!pdf) usage();
  return { pdf, outputDir, constructionPath };
}

function asJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseReviewedConstruction(text: string): GoldenReviewedConstructionInput {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Reviewed golden construction JSON must contain one object.");
  }
  const value = parsed as Record<string, unknown>;
  if (value.schemaVersion !== 1) {
    throw new Error("Reviewed golden construction schemaVersion must be 1.");
  }
  if (typeof value.sourceSha256 !== "string") {
    throw new Error("Reviewed golden construction sourceSha256 must be a string.");
  }
  if (typeof value.boardThicknessMm !== "number") {
    throw new Error("Reviewed golden construction boardThicknessMm must be a number.");
  }
  if (value.bodyHandedness !== "negative-depth" && value.bodyHandedness !== "positive-depth") {
    throw new Error("Reviewed golden construction bodyHandedness must be negative-depth or positive-depth.");
  }
  if (value.physicalTop !== "north" && value.physicalTop !== "south") {
    throw new Error("Reviewed golden construction physicalTop must be north or south.");
  }
  if (!value.evidence || typeof value.evidence !== "object" || Array.isArray(value.evidence)) {
    throw new Error("Reviewed golden construction evidence must be an object.");
  }
  if (!Array.isArray(value.flapHinges)) {
    throw new Error("Reviewed golden construction flapHinges must be an array.");
  }
  if (!Array.isArray(value.phases)) {
    throw new Error("Reviewed golden construction phases must be an array.");
  }
  return parsed as GoldenReviewedConstructionInput;
}

const { pdf, outputDir, constructionPath } = parseArgs(process.argv.slice(2));
const bytes = new Uint8Array(await readFile(pdf));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const sourceName = basename(pdf);
const reviewedInput = constructionPath
  ? parseReviewedConstruction(await readFile(constructionPath, "utf8"))
  : null;

validateGoldenReferenceEvidence();

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
const bodyTube = certifyLockBottomGoldenBodyTube(geometryRoles, hingeRoles, "negative-depth");
const mirroredBodyTube = certifyLockBottomGoldenBodyTube(geometryRoles, hingeRoles, "positive-depth");
const diagnosticArtwork = createStructuralDiagnosticArtwork(raw, panels);
const bodyHingeByRole = new Map(bodyTube.hinges.map((hinge) => [hinge.roleId, hinge]));
const bodyRoleIds = new Set(hingeRoles.bodyChainLeftToRight.map((role) => role.id));

const reviewedPipeline = reviewedInput
  ? (() => {
      const compiled = compileLockBottomGoldenConstruction(
        raw.id,
        geometryRoles,
        hingeRoles,
        reviewedInput,
      );
      const rig = resolveStructuralRig(raw, graph, panels, compiled.construction);
      const plan = authoredPlan([...compiled.unfold.steps], [...rig.articulatedHinges]);
      const planErrors = validateUnfoldPlan(plan, [...rig.articulatedHinges]);
      const runtime = certifyStructuralFoldRuntime(raw, panels, rig, 100);
      const passed = plan.reachesFlat && plan.steps.length === 4 && planErrors.length === 0 && runtime.passed;
      return { compiled, rig, plan, planErrors, runtime, passed };
    })()
  : null;

const referenceBehavior = {
  schemaVersion: 1,
  evidenceKind: "VIDEO_OBSERVATION_AND_STRONG_INFERENCE_NOT_SOURCE_CODE",
  recording: GOLDEN_REFERENCE_RECORDING,
  states: GOLDEN_REFERENCE_STATES,
  transitions: GOLDEN_REFERENCE_TRANSITIONS,
  tweenEnvelope: GOLDEN_REFERENCE_TWEEN,
  certainties: GOLDEN_REFERENCE_CERTAINTIES,
  unresolved: GOLDEN_REFERENCE_UNRESOLVED,
};

const constructionTemplate = {
  schemaVersion: 1,
  sourceLock: {
    canonicalSchemaVersion: 2,
    dielineId: raw.id,
    sha256,
  },
  rootPanelId: bodyTube.rootPanelId,
  boardThicknessMm: null,
  geometryRolesFile: "golden-geometry-roles.json",
  hingeRolesFile: "golden-hinge-roles.json",
  bodyTubeFile: "golden-body-tube.json",
  canonicalBodyHandedness: bodyTube.handedness,
  hinges: hingeRoles.roles.map((role) => {
    const bodyHinge = bodyHingeByRole.get(role.id);
    return {
      id: role.id,
      geometryRole: role.kind,
      parentPanelId: bodyHinge?.parentPanelId ?? null,
      childPanelId: bodyHinge?.childPanelId ?? null,
      candidatePanels: [role.panelAId, role.panelBId],
      source: role.source,
      assembledAngleDeg: bodyHinge?.assembledAngleDeg ?? null,
      openAngleDeg: null,
      isPrimary: null,
      evidence: bodyHinge?.evidence ?? "GEOMETRY_PROVES_EXACT_CREASE_ROLE_AND_ADJACENCY_ONLY",
    };
  }),
  unfoldSequence: null,
  unresolvedFacts: [
    "global body handedness relative to printed/exterior side (both certified body mirrors close identically)",
    "flap parent/child direction and signed assembled angles",
    "board thickness",
    "tuck/lock destinations",
    "exact bottom-lock behavior",
    "physical top-vs-bottom assignment of sheet north/south",
    "final reviewed flap fold order and transition grouping",
  ],
};

const reviewedConstructionTemplate = {
  schemaVersion: 1,
  sourceSha256: sha256,
  boardThicknessMm: null,
  bodyHandedness: null,
  physicalTop: null,
  evidence: {
    boardThickness: "",
    bodyHandedness: "",
    physicalTop: "",
    flapConstruction: "",
  },
  flapHinges: hingeRoles.roles
    .filter((role) => !bodyRoleIds.has(role.id))
    .map((role) => ({
      roleId: role.id,
      candidatePanels: [role.panelAId, role.panelBId],
      parentPanelId: null,
      childPanelId: null,
      assembledAngleDeg: null,
      openAngleDeg: null,
      isPrimary: null,
      evidence: "",
    })),
  phases: [
    {
      phase: "final-closure",
      hingeRoleIds: [],
      motion: { durationMs: 575, staggerMs: 90, easing: "easeInOutCubic", hingeOrder: [] },
    },
    {
      phase: "major-closure",
      hingeRoleIds: [],
      motion: { durationMs: 575, staggerMs: 90, easing: "easeInOutCubic", hingeOrder: [] },
    },
    {
      phase: "secondary-flaps",
      hingeRoleIds: [],
      motion: { durationMs: 575, staggerMs: 90, easing: "easeInOutCubic", hingeOrder: [] },
    },
    {
      phase: "body",
      hingeRoleIds: hingeRoles.bodyChainLeftToRight.map((role) => role.id),
      motion: {
        durationMs: 575,
        staggerMs: 90,
        easing: "easeInOutCubic",
        hingeOrder: hingeRoles.bodyChainLeftToRight.map((role) => role.id),
      },
    },
  ],
};

const baseAccepted =
  acceptance.passed &&
  inventory.formsTree &&
  geometryRoles.passed &&
  hingeRoles.passed &&
  bodyTube.passed &&
  mirroredBodyTube.passed;
const reviewedAccepted = reviewedPipeline?.passed ?? false;

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
  geometryRoles: {
    evidenceFile: "golden-geometry-roles.json",
    passed: geometryRoles.passed,
    bodyBand: geometryRoles.bodyBand,
    bodyPanelRolesLeftToRight: geometryRoles.bodyPanelsLeftToRight.map((role) => ({
      panelId: role.panelId,
      role: role.bodyRole,
      widthMm: role.widthMm,
      holeCount: role.holeCount,
    })),
    northFlapCount: geometryRoles.northFlapsLeftToRight.length,
    southFlapCount: geometryRoles.southFlapsLeftToRight.length,
  },
  hingeRoles: {
    evidenceFile: "golden-hinge-roles.json",
    passed: hingeRoles.passed,
    total: hingeRoles.roles.length,
    bodyChainCount: hingeRoles.bodyChainLeftToRight.length,
    northBaseCount: hingeRoles.northBaseLeftToRight.length,
    southBaseCount: hingeRoles.southBaseLeftToRight.length,
    northDiagonalCount: hingeRoles.northDiagonalsLeftToRight.length,
    southDiagonalCount: hingeRoles.southDiagonalsLeftToRight.length,
  },
  bodyTube: {
    evidenceFile: "golden-body-tube.json",
    passed: bodyTube.passed && mirroredBodyTube.passed,
    canonicalHandedness: bodyTube.handedness,
    mirrorAlsoPasses: mirroredBodyTube.passed,
    rootPanelId: bodyTube.rootPanelId,
    dimensionsMm: bodyTube.dimensionsMm,
    closureGapMm: bodyTube.closureGapMm,
    seamLineErrorMm: bodyTube.seamLineErrorMm,
    resolvedBodyHingeCount: bodyTube.hinges.length,
  },
  flat: acceptance.flat,
  gates: acceptance.gates,
  construction: reviewedPipeline
    ? {
        reviewedInputSupplied: true,
        formsTree: inventory.formsTree,
        hingeCandidateCount: inventory.hingeCandidates.length,
        semanticHingeRoleCount: hingeRoles.roles.length,
        bodyTubeResolved: true,
        fullPhysicalFoldSemanticsResolved: true,
        resolvedRigHingeCount: reviewedPipeline.rig.hinges.length,
        unfoldSource: reviewedPipeline.plan.source,
        unfoldStepCount: reviewedPipeline.plan.steps.length,
        unfoldReachesFlat: reviewedPipeline.plan.reachesFlat,
        unfoldValidationErrors: reviewedPipeline.planErrors,
        runtime: reviewedPipeline.runtime,
        modelRotationRad: reviewedPipeline.compiled.modelRotationRad,
        physicalTop: reviewedPipeline.compiled.physicalTop,
        bodyHandedness: reviewedPipeline.compiled.bodyHandedness,
        passed: reviewedPipeline.passed,
      }
    : {
        reviewedInputSupplied: false,
        formsTree: inventory.formsTree,
        hingeCandidateCount: inventory.hingeCandidates.length,
        semanticHingeRoleCount: hingeRoles.roles.length,
        bodyTubeResolved: bodyTube.passed && mirroredBodyTube.passed,
        fullPhysicalFoldSemanticsResolved: false,
        requiredInputTemplate: "golden-reviewed-construction-template.json",
        passed: false,
      },
  mappingEvidence: {
    diagnosticArtwork: "golden-diagnostic-art.svg",
    purpose: [
      "detect mirrored or rotated sheet mapping",
      "detect panel swaps",
      "detect artwork jumps across intended shared creases",
      "make flat-versus-folded orientation visually auditable",
    ],
  },
  referenceBehavior: {
    evidenceFile: "golden-reference-behavior.json",
    stateCount: GOLDEN_REFERENCE_STATES.length,
    observedTransitionCount: GOLDEN_REFERENCE_TRANSITIONS.length,
    hingeDurationEnvelopeMs: GOLDEN_REFERENCE_TWEEN.hingeDurationMs,
    staggerEnvelopeMs: GOLDEN_REFERENCE_TWEEN.staggerMs,
    easing: GOLDEN_REFERENCE_TWEEN.preferredEasing,
    unresolvedFactCount: GOLDEN_REFERENCE_UNRESOLVED.length,
  },
  verdict: !baseAccepted
    ? "FAIL"
    : !reviewedPipeline
      ? "BODY_TUBE_CERTIFIED_REVIEWED_CONSTRUCTION_REQUIRED"
      : reviewedAccepted
        ? "REVIEWED_CONSTRUCTION_RUNTIME_CERTIFIED_VISUAL_EVIDENCE_PENDING"
        : "FAIL",
};

const destination = resolve(outputDir);
await mkdir(destination, { recursive: true });
const writes = [
  writeFile(`${destination}/golden-run-summary.json`, asJson(summary)),
  writeFile(`${destination}/golden-acceptance.json`, asJson(acceptance)),
  writeFile(`${destination}/golden-geometry-roles.json`, asJson(geometryRoles)),
  writeFile(`${destination}/golden-hinge-roles.json`, asJson(hingeRoles)),
  writeFile(`${destination}/golden-body-tube.json`, asJson({ canonical: bodyTube, mirror: mirroredBodyTube })),
  writeFile(`${destination}/golden-diagnostic-art.svg`, diagnosticArtwork),
  writeFile(`${destination}/golden-reference-behavior.json`, asJson(referenceBehavior)),
  writeFile(
    `${destination}/golden-construction-inventory.json`,
    asJson({
      sourceSha256: sha256,
      topologyRepairs: profiled.repairs,
      inventory,
    }),
  ),
  writeFile(`${destination}/golden-construction-template.json`, asJson(constructionTemplate)),
  writeFile(
    `${destination}/golden-reviewed-construction-template.json`,
    asJson(reviewedConstructionTemplate),
  ),
];

if (reviewedPipeline) {
  writes.push(
    writeFile(
      `${destination}/golden-reviewed-construction.json`,
      asJson({ input: reviewedInput, compiled: reviewedPipeline.compiled }),
    ),
    writeFile(`${destination}/golden-resolved-rig.json`, asJson(reviewedPipeline.rig)),
    writeFile(
      `${destination}/golden-unfold-plan.json`,
      asJson({ plan: reviewedPipeline.plan, validationErrors: reviewedPipeline.planErrors }),
    ),
    writeFile(`${destination}/golden-runtime-certificate.json`, asJson(reviewedPipeline.runtime)),
  );
}

await Promise.all(writes);
console.log(asJson({ outputDir: destination, ...summary }));

if (!baseAccepted || (constructionPath && !reviewedAccepted)) process.exitCode = 1;
