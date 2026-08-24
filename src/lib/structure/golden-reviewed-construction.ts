import type { AuthoredUnfoldMotion, UnfoldSpec } from "@/types/unfold";
import { certifyLockBottomGoldenBodyTube, type GoldenBodyHandedness } from "./golden-body-tube";
import type { GoldenGeometryRoleReport } from "./golden-geometry-roles";
import type { GoldenHingeRole, GoldenHingeRoleReport } from "./golden-hinge-roles";
import {
  type StructuralConstructionSpec,
  type StructuralHingeDefinition,
} from "./structural-rig";
import { GOLDEN_REFERENCE_TWEEN } from "./golden-reference-behavior";

export type GoldenConstructionPhase =
  | "final-closure"
  | "major-closure"
  | "secondary-flaps"
  | "body";

export type GoldenReviewedEvidence = Readonly<{
  boardThickness: string;
  bodyHandedness: string;
  physicalTop: string;
  flapConstruction: string;
}>;

export type GoldenReviewedFlapHinge = Readonly<{
  roleId: string;
  parentPanelId: string;
  childPanelId: string;
  assembledAngleDeg: number;
  openAngleDeg?: number;
  isPrimary?: boolean;
  evidence: string;
}>;

export type GoldenReviewedPhase = Readonly<{
  phase: GoldenConstructionPhase;
  hingeRoleIds: readonly string[];
  motion?: AuthoredUnfoldMotion;
}>;

export type GoldenReviewedConstructionInput = Readonly<{
  schemaVersion: 1;
  sourceSha256: string;
  boardThicknessMm: number;
  bodyHandedness: GoldenBodyHandedness;
  physicalTop: "north" | "south";
  evidence: GoldenReviewedEvidence;
  flapHinges: readonly GoldenReviewedFlapHinge[];
  /** Assembled -> flat order. Forward-from-flat traverses these in reverse. */
  phases: readonly GoldenReviewedPhase[];
}>;

export type CompiledGoldenConstruction = Readonly<{
  construction: StructuralConstructionSpec;
  unfold: UnfoldSpec;
  modelRotationRad: readonly [number, number, number];
  physicalTop: GoldenReviewedConstructionInput["physicalTop"];
  bodyHandedness: GoldenBodyHandedness;
  evidence: GoldenReviewedEvidence;
}>;

const REQUIRED_PHASE_ORDER: readonly GoldenConstructionPhase[] = [
  "final-closure",
  "major-closure",
  "secondary-flaps",
  "body",
] as const;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function requireEvidence(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} evidence cannot be empty.`);
}

function samePair(role: GoldenHingeRole, parentPanelId: string, childPanelId: string): boolean {
  const actual = [role.panelAId, role.panelBId].sort();
  const reviewed = [parentPanelId, childPanelId].sort();
  return actual[0] === reviewed[0] && actual[1] === reviewed[1];
}

function validateDirectedTree(
  panelIds: readonly string[],
  rootPanelId: string,
  hinges: readonly StructuralHingeDefinition[],
): void {
  if (hinges.length !== panelIds.length - 1) {
    throw new Error(`Golden reviewed hierarchy needs ${panelIds.length - 1} hinges; found ${hinges.length}.`);
  }
  const incoming = new Map<string, string>();
  const outgoing = new Map<string, string[]>();
  for (const hinge of hinges) {
    if (hinge.childPanelId === rootPanelId) {
      throw new Error(`Golden root panel ${rootPanelId} cannot have an incoming hinge.`);
    }
    if (incoming.has(hinge.childPanelId)) {
      throw new Error(`Golden panel ${hinge.childPanelId} has more than one reviewed parent.`);
    }
    incoming.set(hinge.childPanelId, hinge.id);
    outgoing.set(hinge.parentPanelId, [
      ...(outgoing.get(hinge.parentPanelId) ?? []),
      hinge.childPanelId,
    ]);
  }
  for (const panelId of panelIds) {
    if (panelId !== rootPanelId && !incoming.has(panelId)) {
      throw new Error(`Golden panel ${panelId} has no reviewed parent hinge.`);
    }
  }

  const seen = new Set<string>();
  const queue = [rootPanelId];
  while (queue.length > 0) {
    const panelId = queue.shift()!;
    if (seen.has(panelId)) throw new Error(`Golden reviewed hierarchy contains a cycle at ${panelId}.`);
    seen.add(panelId);
    queue.push(...(outgoing.get(panelId) ?? []));
  }
  if (seen.size !== panelIds.length) {
    throw new Error(`Golden reviewed hierarchy reaches ${seen.size}/${panelIds.length} panels from ${rootPanelId}.`);
  }
}

function normalizeMotion(
  phase: GoldenConstructionPhase,
  hingeRoleIds: readonly string[],
  motion: AuthoredUnfoldMotion | undefined,
): AuthoredUnfoldMotion {
  const durationMs = finite(
    motion?.durationMs ?? 575,
    `Golden phase ${phase} durationMs`,
  );
  const staggerMs = finite(
    motion?.staggerMs ?? 90,
    `Golden phase ${phase} staggerMs`,
  );
  const delayMs = finite(motion?.delayMs ?? 0, `Golden phase ${phase} delayMs`);
  if (
    durationMs < GOLDEN_REFERENCE_TWEEN.hingeDurationMs.min ||
    durationMs > GOLDEN_REFERENCE_TWEEN.hingeDurationMs.max
  ) {
    throw new RangeError(
      `Golden phase ${phase} duration ${durationMs} ms is outside the reviewed ${GOLDEN_REFERENCE_TWEEN.hingeDurationMs.min}-${GOLDEN_REFERENCE_TWEEN.hingeDurationMs.max} ms envelope.`,
    );
  }
  if (
    hingeRoleIds.length > 1 &&
    (staggerMs < GOLDEN_REFERENCE_TWEEN.staggerMs.min || staggerMs > GOLDEN_REFERENCE_TWEEN.staggerMs.max)
  ) {
    throw new RangeError(
      `Golden phase ${phase} stagger ${staggerMs} ms is outside the reviewed ${GOLDEN_REFERENCE_TWEEN.staggerMs.min}-${GOLDEN_REFERENCE_TWEEN.staggerMs.max} ms envelope.`,
    );
  }
  if (delayMs < 0) throw new RangeError(`Golden phase ${phase} delayMs cannot be negative.`);
  const easing = motion?.easing ?? GOLDEN_REFERENCE_TWEEN.preferredEasing;
  if (easing !== "easeInOutCubic") {
    throw new Error(`Golden phase ${phase} must use the reviewed easeInOutCubic motion envelope.`);
  }
  const order = motion?.hingeOrder ? [...motion.hingeOrder] : [...hingeRoleIds];
  const expected = [...hingeRoleIds].sort();
  const actual = [...order].sort();
  if (
    new Set(order).size !== order.length ||
    expected.length !== actual.length ||
    expected.some((id, index) => id !== actual[index])
  ) {
    throw new Error(`Golden phase ${phase} hingeOrder must contain exactly that phase's hinge role ids.`);
  }
  return { delayMs, durationMs, staggerMs, easing, hingeOrder: order };
}

function phaseLabels(phase: GoldenConstructionPhase): { label: string; reverseLabel: string } {
  switch (phase) {
    case "final-closure":
      return { label: "Release final closure", reverseLabel: "Set final closure" };
    case "major-closure":
      return { label: "Open major closure", reverseLabel: "Fold major closure" };
    case "secondary-flaps":
      return { label: "Open secondary flaps", reverseLabel: "Fold secondary flaps" };
    case "body":
      return { label: "Lay body flat", reverseLabel: "Form body" };
  }
}

/**
 * Compiles only explicitly reviewed physical facts into runtime construction.
 * Geometry-proven body topology is generated from the source-locked certificate;
 * every non-body hinge must be supplied with evidence. Nothing is guessed from
 * panel shape or filename.
 */
export function compileLockBottomGoldenConstruction(
  dielineId: string,
  geometry: GoldenGeometryRoleReport,
  hingeRoles: GoldenHingeRoleReport,
  reviewed: GoldenReviewedConstructionInput,
): CompiledGoldenConstruction {
  if (reviewed.schemaVersion !== 1) throw new Error("Unsupported golden reviewed-construction schema version.");
  if (!/^[a-f0-9]{64}$/i.test(reviewed.sourceSha256)) {
    throw new Error("Golden reviewed construction sourceSha256 must be a 64-character hexadecimal digest.");
  }
  if (reviewed.sourceSha256.toLowerCase() !== geometry.sourceSha256.toLowerCase()) {
    throw new Error("Golden reviewed construction does not match the geometry source hash.");
  }
  if (geometry.sourceSha256.toLowerCase() !== hingeRoles.sourceSha256.toLowerCase()) {
    throw new Error("Golden geometry and hinge-role evidence do not share a source hash.");
  }
  finite(reviewed.boardThicknessMm, "Golden boardThicknessMm");
  if (reviewed.boardThicknessMm <= 0 || reviewed.boardThicknessMm > 10) {
    throw new RangeError("Golden boardThicknessMm must be greater than 0 and no more than 10 mm.");
  }
  requireEvidence(reviewed.evidence.boardThickness, "Golden board thickness");
  requireEvidence(reviewed.evidence.bodyHandedness, "Golden body handedness");
  requireEvidence(reviewed.evidence.physicalTop, "Golden physical top");
  requireEvidence(reviewed.evidence.flapConstruction, "Golden flap construction");

  const bodyTube = certifyLockBottomGoldenBodyTube(
    geometry,
    hingeRoles,
    reviewed.bodyHandedness,
  );
  if (!bodyTube.passed) throw new Error("Golden body-tube certificate failed; reviewed construction cannot compile.");

  const bodyRoleIds = new Set(bodyTube.hinges.map((hinge) => hinge.roleId));
  const flapRoles = hingeRoles.roles.filter((role) => !bodyRoleIds.has(role.id));
  const flapRoleById = new Map(flapRoles.map((role) => [role.id, role]));
  if (reviewed.flapHinges.length !== flapRoles.length) {
    throw new Error(`Golden reviewed construction requires ${flapRoles.length} non-body hinges; found ${reviewed.flapHinges.length}.`);
  }

  const seenFlapRoles = new Set<string>();
  const flapDefinitions: StructuralHingeDefinition[] = reviewed.flapHinges.map((reviewedHinge) => {
    const role = flapRoleById.get(reviewedHinge.roleId);
    if (!role) throw new Error(`Golden reviewed flap hinge names unknown or body role ${reviewedHinge.roleId}.`);
    if (seenFlapRoles.has(role.id)) throw new Error(`Golden reviewed flap hinge ${role.id} is duplicated.`);
    seenFlapRoles.add(role.id);
    if (!samePair(role, reviewedHinge.parentPanelId, reviewedHinge.childPanelId)) {
      throw new Error(`Golden flap hinge ${role.id} parent/child panels do not match its exact geometry adjacency.`);
    }
    finite(reviewedHinge.assembledAngleDeg, `Golden flap hinge ${role.id} assembledAngleDeg`);
    if (Math.abs(reviewedHinge.assembledAngleDeg) > 180) {
      throw new RangeError(`Golden flap hinge ${role.id} assembledAngleDeg must be within [-180, 180].`);
    }
    if (reviewedHinge.openAngleDeg !== undefined) {
      finite(reviewedHinge.openAngleDeg, `Golden flap hinge ${role.id} openAngleDeg`);
      if (Math.abs(reviewedHinge.openAngleDeg) > 180) {
        throw new RangeError(`Golden flap hinge ${role.id} openAngleDeg must be within [-180, 180].`);
      }
    }
    requireEvidence(reviewedHinge.evidence, `Golden flap hinge ${role.id}`);
    return {
      id: role.id,
      parentPanelId: reviewedHinge.parentPanelId,
      childPanelId: reviewedHinge.childPanelId,
      source: role.source,
      assembledAngleDeg: reviewedHinge.assembledAngleDeg,
      ...(reviewedHinge.openAngleDeg !== undefined ? { openAngleDeg: reviewedHinge.openAngleDeg } : {}),
      ...(reviewedHinge.isPrimary ? { isPrimary: true } : {}),
    };
  });

  if (seenFlapRoles.size !== flapRoles.length) {
    const missing = flapRoles.filter((role) => !seenFlapRoles.has(role.id)).map((role) => role.id);
    throw new Error(`Golden reviewed construction is missing flap hinge roles: ${missing.join(", ")}.`);
  }

  const bodyDefinitions: StructuralHingeDefinition[] = bodyTube.hinges.map((hinge) => ({
    id: hinge.roleId,
    parentPanelId: hinge.parentPanelId,
    childPanelId: hinge.childPanelId,
    source: hinge.source,
    assembledAngleDeg: hinge.assembledAngleDeg,
  }));
  const allHinges = [...bodyDefinitions, ...flapDefinitions];
  const panelIds = geometry.roles.map((role) => role.panelId);
  validateDirectedTree(panelIds, bodyTube.rootPanelId, allHinges);

  if (reviewed.phases.length !== REQUIRED_PHASE_ORDER.length) {
    throw new Error(`Golden reviewed construction requires ${REQUIRED_PHASE_ORDER.length} ordered phases.`);
  }
  reviewed.phases.forEach((phase, index) => {
    if (phase.phase !== REQUIRED_PHASE_ORDER[index]) {
      throw new Error(
        `Golden phase ${index + 1} must be ${REQUIRED_PHASE_ORDER[index]}, not ${phase.phase}.`,
      );
    }
    if (phase.hingeRoleIds.length === 0) throw new Error(`Golden phase ${phase.phase} cannot be empty.`);
  });

  const allRoleIds = new Set(hingeRoles.roles.map((role) => role.id));
  const flattenedRoleIds = reviewed.phases.flatMap((phase) => [...phase.hingeRoleIds]);
  if (new Set(flattenedRoleIds).size !== flattenedRoleIds.length) {
    throw new Error("Golden construction phases assign at least one hinge role more than once.");
  }
  if (
    flattenedRoleIds.length !== allRoleIds.size ||
    flattenedRoleIds.some((roleId) => !allRoleIds.has(roleId))
  ) {
    throw new Error("Golden construction phases must assign every physical hinge role exactly once.");
  }
  const bodyPhase = reviewed.phases[3];
  const expectedBody = [...bodyRoleIds].sort();
  const actualBody = [...bodyPhase.hingeRoleIds].sort();
  if (
    expectedBody.length !== actualBody.length ||
    expectedBody.some((id, index) => id !== actualBody[index])
  ) {
    throw new Error("Golden body phase must contain exactly the four certified body-tube hinges.");
  }
  for (const phase of reviewed.phases.slice(0, 3)) {
    if (phase.hingeRoleIds.some((roleId) => bodyRoleIds.has(roleId))) {
      throw new Error(`Golden ${phase.phase} phase cannot flatten a body-tube hinge.`);
    }
  }

  const unfold: UnfoldSpec = {
    mode: "hinge-graph",
    steps: reviewed.phases.map((phase) => {
      const labels = phaseLabels(phase.phase);
      return {
        id: phase.phase,
        label: labels.label,
        reverseLabel: labels.reverseLabel,
        hingeIds: [...phase.hingeRoleIds],
        to: "flat" as const,
        motion: normalizeMotion(phase.phase, phase.hingeRoleIds, phase.motion),
      };
    }),
  };

  const construction: StructuralConstructionSpec = {
    schemaVersion: 1,
    sourceLock: {
      canonicalSchemaVersion: 2,
      dielineId,
      sha256: geometry.sourceSha256,
    },
    rootPanelId: bodyTube.rootPanelId,
    boardThicknessMm: reviewed.boardThicknessMm,
    hinges: allHinges,
  };

  // Product presentation orientation is independent from fold state and camera.
  // The certified broad body root is an upright wall in the assembled carton;
  // the reviewed physical-top convention selects which sheet side points up.
  const modelRotationRad: readonly [number, number, number] = [
    reviewed.physicalTop === "north" ? Math.PI / 2 : -Math.PI / 2,
    0,
    0,
  ];

  return {
    construction,
    unfold,
    modelRotationRad,
    physicalTop: reviewed.physicalTop,
    bodyHandedness: reviewed.bodyHandedness,
    evidence: reviewed.evidence,
  };
}
