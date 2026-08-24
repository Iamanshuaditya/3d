import * as THREE from "three";
import type { HingeAngles } from "@/types/unfold";
import type { CanonicalDieline } from "./vector-domain";
import type { StructuralPanel } from "./topology";
import { createStructuralPanelGeometry } from "./structural-mesh";
import type { ResolvedStructuralHinge, ResolvedStructuralRig } from "./structural-rig";

const DEG = Math.PI / 180;

/** Keep structural packages in the same scene scale as the legacy carton engine. */
export const STRUCTURAL_MM_TO_UNITS = 0.01;

export type StructuralTreeHinge = Readonly<{
  id: string;
  group: THREE.Group;
  parentPanelId: string;
  childPanelId: string;
  start: ResolvedStructuralHinge["start"];
  end: ResolvedStructuralHinge["end"];
  assembledAngleDeg: number;
  flatAngleDeg: 0;
  openAngleDeg?: number;
  isPrimary: boolean;
}>;

export type StructuralTree = Readonly<{
  root: THREE.Group;
  sheetFrame: THREE.Group;
  hinges: readonly StructuralTreeHinge[];
  meshes: Readonly<Record<string, THREE.Mesh>>;
  dispose: () => void;
}>;

function hingeMatrix(hinge: StructuralTreeHinge, angleDeg: number): THREE.Matrix4 {
  const axis = new THREE.Vector3(
    hinge.end.x - hinge.start.x,
    0,
    hinge.end.y - hinge.start.y,
  );
  if (axis.lengthSq() <= Number.EPSILON) {
    throw new Error(`Structural hinge ${hinge.id} has a zero-length rotation axis.`);
  }
  axis.normalize();
  const toAxis = new THREE.Matrix4().makeTranslation(hinge.start.x, 0, hinge.start.y);
  const rotation = new THREE.Matrix4().makeRotationAxis(axis, angleDeg * DEG);
  const fromAxis = new THREE.Matrix4().makeTranslation(-hinge.start.x, 0, -hinge.start.y);
  return toAxis.multiply(rotation).multiply(fromAxis);
}

/**
 * Writes absolute angles onto an immutable structural hierarchy. Geometry is
 * never rebuilt. A zero-degree hinge becomes an identity matrix exactly up to
 * floating-point arithmetic, restoring canonical sheet coordinates.
 */
export function applyStructuralHingeAngles(tree: StructuralTree, angles: HingeAngles): void {
  for (const hinge of tree.hinges) {
    const angleDeg = angles[hinge.id] ?? hinge.assembledAngleDeg;
    if (!Number.isFinite(angleDeg)) throw new RangeError(`Structural hinge ${hinge.id} angle must be finite.`);
    if (angleDeg === 0) hinge.group.matrix.identity();
    else hinge.group.matrix.copy(hingeMatrix(hinge, angleDeg));
    hinge.group.matrixWorldNeedsUpdate = true;
  }
  tree.root.updateMatrixWorld(true);
}

/**
 * Builds the foldable 3D package directly from exact structural panels.
 *
 * Panel geometry remains in canonical sheet millimetres. Hierarchical hinge
 * groups transform those same coordinates, so the folded model and the flat
 * dieline cannot silently diverge into two separately-authored shapes.
 */
export function createStructuralTree(
  dieline: CanonicalDieline,
  panels: readonly StructuralPanel[],
  rig: ResolvedStructuralRig,
  materials: readonly [THREE.Material, THREE.Material, THREE.Material],
): StructuralTree {
  const panelById = new Map(panels.map((panel) => [panel.id, panel]));
  if (!panelById.has(rig.rootPanelId)) throw new Error(`Structural root panel ${rig.rootPanelId} is missing.`);
  if (panelById.size !== panels.length) throw new Error("Structural panel ids must be unique.");

  const rigPanelIds = new Set<string>([rig.rootPanelId]);
  for (const hinge of rig.hinges) {
    rigPanelIds.add(hinge.parentPanelId);
    rigPanelIds.add(hinge.childPanelId);
  }
  for (const panel of panels) {
    if (!rigPanelIds.has(panel.id)) throw new Error(`Structural panel ${panel.id} is not connected to the resolved rig.`);
  }

  const root = new THREE.Group();
  root.name = "STRUCTURAL_PACKAGE_ROOT";
  root.scale.setScalar(STRUCTURAL_MM_TO_UNITS);

  const sheetFrame = new THREE.Group();
  sheetFrame.name = "STRUCTURAL_CANONICAL_SHEET";
  sheetFrame.position.set(-dieline.widthMm / 2, 0, -dieline.heightMm / 2);
  root.add(sheetFrame);

  const geometries: THREE.BufferGeometry[] = [];
  const meshes: Record<string, THREE.Mesh> = {};
  for (const panel of panels) {
    const built = createStructuralPanelGeometry(panel, dieline, rig.boardThicknessMm);
    geometries.push(built.geometry);
    const mesh = new THREE.Mesh(built.geometry, [...materials]);
    mesh.name = panel.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      ...mesh.userData,
      structuralPanelId: panel.id,
      canonicalDielineId: dieline.id,
    };
    meshes[panel.id] = mesh;
  }

  const outgoing = new Map<string, ResolvedStructuralHinge[]>();
  for (const hinge of rig.hinges) {
    outgoing.set(hinge.parentPanelId, [...(outgoing.get(hinge.parentPanelId) ?? []), hinge]);
  }

  const hingeEntries: StructuralTreeHinge[] = [];
  const attachChildren = (panelId: string, container: THREE.Group): void => {
    for (const hinge of outgoing.get(panelId) ?? []) {
      const group = new THREE.Group();
      group.name = `${hinge.id}__structural_hinge`;
      group.matrixAutoUpdate = false;
      group.matrix.identity();
      container.add(group);

      const entry: StructuralTreeHinge = {
        id: hinge.id,
        group,
        parentPanelId: hinge.parentPanelId,
        childPanelId: hinge.childPanelId,
        start: hinge.start,
        end: hinge.end,
        assembledAngleDeg: hinge.assembledAngleDeg,
        flatAngleDeg: 0,
        openAngleDeg: hinge.openAngleDeg,
        isPrimary: hinge.isPrimary,
      };
      hingeEntries.push(entry);
      const childMesh = meshes[hinge.childPanelId];
      if (!childMesh) throw new Error(`Structural hinge ${hinge.id} child mesh ${hinge.childPanelId} is missing.`);
      group.add(childMesh);
      attachChildren(hinge.childPanelId, group);
    }
  };

  sheetFrame.add(meshes[rig.rootPanelId]);
  attachChildren(rig.rootPanelId, sheetFrame);

  const tree: StructuralTree = {
    root,
    sheetFrame,
    hinges: hingeEntries,
    meshes,
    dispose: () => geometries.forEach((geometry) => geometry.dispose()),
  };
  const assembled = Object.fromEntries(rig.hinges.map((hinge) => [hinge.id, hinge.assembledAngleDeg]));
  applyStructuralHingeAngles(tree, assembled);
  return tree;
}

export function structuralFlatPose(rig: ResolvedStructuralRig): HingeAngles {
  return Object.fromEntries(rig.hinges.map((hinge) => [hinge.id, 0]));
}

export function structuralAssembledPose(rig: ResolvedStructuralRig): HingeAngles {
  return Object.fromEntries(rig.hinges.map((hinge) => [hinge.id, hinge.assembledAngleDeg]));
}
