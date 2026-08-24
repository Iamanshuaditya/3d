import * as THREE from "three";
import type { CanonicalDieline } from "./vector-domain";
import type { StructuralPanel } from "./topology";
import type { ResolvedStructuralRig } from "./structural-rig";
import {
  applyStructuralHingeAngles,
  createStructuralTree,
  structuralAssembledPose,
  structuralFlatPose,
} from "./structural-tree";

export type StructuralRuntimeCertificate = Readonly<{
  cycleCount: number;
  panelCount: number;
  hingeCount: number;
  geometryIdentityStable: boolean;
  maxFlatHingeMatrixError: number;
  maxFlatWorldMatrixDrift: number;
  allMatricesFinite: boolean;
  gates: Readonly<{
    cycleCount: boolean;
    geometryIdentityStable: boolean;
    hingeIdentityAtFlat: boolean;
    flatWorldPoseStable: boolean;
    allMatricesFinite: boolean;
  }>;
  passed: boolean;
}>;

const MIN_TORTURE_CYCLES = 100;
const HINGE_IDENTITY_TOLERANCE = 1e-14;
const WORLD_MATRIX_DRIFT_TOLERANCE = 1e-13;

function maxMatrixDifference(left: THREE.Matrix4, right: THREE.Matrix4): number {
  let maximum = 0;
  for (let index = 0; index < 16; index += 1) {
    maximum = Math.max(maximum, Math.abs(left.elements[index] - right.elements[index]));
  }
  return maximum;
}

function finiteMatrix(matrix: THREE.Matrix4): boolean {
  return matrix.elements.every(Number.isFinite);
}

/**
 * Torture-tests one already-resolved structural rig without rebuilding geometry.
 *
 * The certificate snapshots exact BufferGeometry identities and the canonical
 * flat world pose, then alternates absolute assembled/flat targets repeatedly.
 * The terminal flat pose must restore identity hinge matrices and the exact same
 * mesh world transforms. This is deliberately independent from frame animation:
 * it certifies the structural transform model itself cannot accumulate drift.
 */
export function certifyStructuralFoldRuntime(
  dieline: CanonicalDieline,
  panels: readonly StructuralPanel[],
  rig: ResolvedStructuralRig,
  cycleCount = MIN_TORTURE_CYCLES,
): StructuralRuntimeCertificate {
  if (!Number.isInteger(cycleCount) || cycleCount < MIN_TORTURE_CYCLES) {
    throw new RangeError(`Structural runtime certificate requires at least ${MIN_TORTURE_CYCLES} integer cycles.`);
  }

  const materials = [
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial(),
  ] as const;
  const tree = createStructuralTree(dieline, panels, rig, materials);

  try {
    const meshEntries = Object.entries(tree.meshes).sort(([left], [right]) => left.localeCompare(right));
    const geometryUuids = new Map(meshEntries.map(([id, mesh]) => [id, mesh.geometry.uuid]));
    const identity = new THREE.Matrix4();
    const flat = structuralFlatPose(rig);
    const assembled = structuralAssembledPose(rig);

    applyStructuralHingeAngles(tree, flat);
    const baselineWorld = new Map(
      meshEntries.map(([id, mesh]) => [id, mesh.matrixWorld.clone()]),
    );

    for (let cycle = 0; cycle < cycleCount; cycle += 1) {
      applyStructuralHingeAngles(tree, assembled);
      applyStructuralHingeAngles(tree, flat);
    }

    const geometryIdentityStable = meshEntries.every(
      ([id, mesh]) => mesh.geometry.uuid === geometryUuids.get(id),
    );
    const maxFlatHingeMatrixError = tree.hinges.reduce(
      (maximum, hinge) => Math.max(maximum, maxMatrixDifference(hinge.group.matrix, identity)),
      0,
    );
    const maxFlatWorldMatrixDrift = meshEntries.reduce((maximum, [id, mesh]) => {
      const baseline = baselineWorld.get(id);
      if (!baseline) return Number.POSITIVE_INFINITY;
      return Math.max(maximum, maxMatrixDifference(mesh.matrixWorld, baseline));
    }, 0);
    const allMatricesFinite =
      finiteMatrix(tree.root.matrixWorld) &&
      finiteMatrix(tree.sheetFrame.matrixWorld) &&
      tree.hinges.every((hinge) => finiteMatrix(hinge.group.matrix) && finiteMatrix(hinge.group.matrixWorld)) &&
      meshEntries.every(([, mesh]) => finiteMatrix(mesh.matrixWorld));

    const gates = {
      cycleCount: cycleCount >= MIN_TORTURE_CYCLES,
      geometryIdentityStable,
      hingeIdentityAtFlat: maxFlatHingeMatrixError <= HINGE_IDENTITY_TOLERANCE,
      flatWorldPoseStable: maxFlatWorldMatrixDrift <= WORLD_MATRIX_DRIFT_TOLERANCE,
      allMatricesFinite,
    };

    return {
      cycleCount,
      panelCount: panels.length,
      hingeCount: rig.hinges.length,
      geometryIdentityStable,
      maxFlatHingeMatrixError,
      maxFlatWorldMatrixDrift,
      allMatricesFinite,
      gates,
      passed: Object.values(gates).every(Boolean),
    };
  } finally {
    tree.dispose();
    materials.forEach((material) => material.dispose());
  }
}
