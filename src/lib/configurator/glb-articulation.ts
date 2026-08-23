import * as THREE from "three";
import type {
  ArticulatedHinge,
  GlbArticulationSpec,
  HingeAngles,
  UnfoldPlan,
} from "@/types/unfold";
import { authoredPlan, derivedPlan } from "./unfold-plan";

/**
 * Articulation for prepared GLBs.
 *
 * A mesh file carries no structural information: nothing in a glTF says that
 * one node is a lid and another is the wall it swings on. So mechanical
 * unfolding of an arbitrary model is not a solver problem, it is an authoring
 * problem — the hinge graph has to be declared alongside the model. This
 * module is the runtime for that declaration.
 *
 * Everything downstream is shared with the procedural cartons: the same
 * `UnfoldPlan`, the same stage reducer, the same control. Only the way a pose
 * reaches the geometry differs — a carton owns its hinge tree, whereas here we
 * rig one onto somebody else's scene graph.
 */

const DEG = Math.PI / 180;

export type GlbHingeBinding = {
  id: string;
  /** Group inserted between the node and its parent, rotating about the pivot. */
  group: THREE.Group;
  /** Normalised rotation axis, in the same frame as the node's own position. */
  axis: THREE.Vector3;
  /** Angle used when a pose omits this joint. */
  assembledAngleDeg: number;
};

export type GlbArticulationRig = {
  bindings: GlbHingeBinding[];
  hinges: ArticulatedHinge[];
  /** Restores the scene graph to its original parenting. */
  dispose: () => void;
};

function requireNode(root: THREE.Object3D, name: string): THREE.Object3D {
  const node = root.getObjectByName(name);
  if (!node) {
    const available: string[] = [];
    root.traverse((child) => {
      if (child.name) available.push(child.name);
    });
    throw new Error(
      `GLB articulation names node "${name}", which is not in the model. ` +
        `Available nodes: ${available.slice(0, 24).join(", ")}${available.length > 24 ? ", …" : ""}`,
    );
  }
  return node;
}

function isAncestor(candidate: THREE.Object3D, node: THREE.Object3D): boolean {
  for (let cursor = node.parent; cursor; cursor = cursor.parent) {
    if (cursor === candidate) return true;
  }
  return false;
}

/**
 * The articulation graph declared by a GLB spec.
 *
 * Pure — no scene graph involved — so a plan can be built, validated and
 * tested without loading a model.
 */
export function glbHinges(spec: GlbArticulationSpec): ArticulatedHinge[] {
  const byName = new Map(spec.hinges.map((hinge) => [hinge.nodeName, hinge]));
  const depthOf = (nodeName: string): number => {
    let depth = 1;
    let cursor = byName.get(nodeName)?.parentNodeName ?? null;
    const seen = new Set<string>([nodeName]);
    while (cursor) {
      if (seen.has(cursor)) {
        throw new Error(`GLB articulation has a hinge cycle through "${cursor}".`);
      }
      seen.add(cursor);
      depth += 1;
      cursor = byName.get(cursor)?.parentNodeName ?? null;
    }
    return depth;
  };

  return spec.hinges.map((hinge) => {
    if (hinge.parentNodeName && !byName.has(hinge.parentNodeName)) {
      throw new Error(
        `GLB articulation: hinge "${hinge.nodeName}" names parent ` +
          `"${hinge.parentNodeName}", which is not itself a declared hinge.`,
      );
    }
    return {
      id: hinge.nodeName,
      parentId: hinge.parentNodeName ?? null,
      depth: depthOf(hinge.nodeName),
      assembledAngleDeg: hinge.assembledAngleDeg,
      flatAngleDeg: hinge.flatAngleDeg,
      ...(hinge.openAngleDeg === undefined ? {} : { openAngleDeg: hinge.openAngleDeg }),
      isPrimary: Boolean(hinge.isPrimary),
    } satisfies ArticulatedHinge;
  });
}

/** Whether the declared flat pose actually lays every joint flat. */
export function glbReachesFlat(spec: GlbArticulationSpec): boolean {
  return spec.hinges.some((hinge) => hinge.flatAngleDeg !== hinge.assembledAngleDeg);
}

export function glbUnfoldPlan(spec: GlbArticulationSpec): UnfoldPlan | null {
  const hinges = glbHinges(spec);
  if (!hinges.length) return null;
  return spec.sequence?.length ? authoredPlan(spec.sequence, hinges) : derivedPlan(hinges);
}

/**
 * Inserts a rotating group above each articulated node.
 *
 * `pivot` and `axis` are read in the node's PARENT frame — the same space the
 * node's own position lives in, which is what a modeller reads off a rest-pose
 * model. The node keeps its own transform and is offset by the pivot, so the
 * rest pose is untouched: rigging a model and never moving a joint renders it
 * byte-identically to before.
 *
 * Composition comes from the model's own hierarchy: a flap authored as a child
 * of the wall it hangs off follows that wall for free. The declared
 * `parentNodeName` is the DEPENDENCY graph used for step ordering, and it is
 * checked against the hierarchy rather than trusted — a mismatch means the two
 * would disagree about what moves what, which is exactly the bug this contract
 * exists to prevent.
 */
export function rigGlbArticulation(
  root: THREE.Object3D,
  spec: GlbArticulationSpec,
): GlbArticulationRig {
  const bindings: GlbHingeBinding[] = [];
  const restore: (() => void)[] = [];

  for (const hinge of spec.hinges) {
    const node = requireNode(root, hinge.nodeName);
    const parent = node.parent;
    if (!parent) {
      throw new Error(`GLB articulation: node "${hinge.nodeName}" has no parent to hinge from.`);
    }
    if (hinge.parentNodeName) {
      const declaredParent = requireNode(root, hinge.parentNodeName);
      if (!isAncestor(declaredParent, node)) {
        throw new Error(
          `GLB articulation: "${hinge.nodeName}" declares "${hinge.parentNodeName}" as its ` +
            `hinge parent, but that node is not one of its ancestors in the model. ` +
            `Nest the parts in the GLB so a parent's rotation carries its children.`,
        );
      }
    }

    const axis = new THREE.Vector3(...hinge.axis);
    if (axis.lengthSq() < 1e-12) {
      throw new Error(`GLB articulation: hinge "${hinge.nodeName}" has a zero-length axis.`);
    }
    axis.normalize();

    const pivot = new THREE.Vector3(...hinge.pivot);
    const group = new THREE.Group();
    group.name = `${hinge.nodeName}__hinge`;
    group.position.copy(pivot);

    const originalIndex = parent.children.indexOf(node);
    parent.add(group);
    node.position.sub(pivot);
    group.add(node);

    restore.push(() => {
      group.remove(node);
      node.position.add(pivot);
      parent.add(node);
      // Keep sibling order stable so anything relying on draw order is safe.
      parent.children.splice(parent.children.indexOf(node), 1);
      parent.children.splice(originalIndex, 0, node);
      parent.remove(group);
    });

    bindings.push({
      id: hinge.nodeName,
      group,
      axis,
      assembledAngleDeg: hinge.assembledAngleDeg,
    });
  }

  return {
    bindings,
    hinges: glbHinges(spec),
    dispose: () => restore.reverse().forEach((undo) => undo()),
  };
}

/**
 * Writes an absolute pose onto a rigged GLB. Joints missing from the pose fall
 * back to their assembled angle, matching `applyHingeAngles` for cartons.
 */
export function applyGlbHingeAngles(rig: GlbArticulationRig, angles: HingeAngles) {
  for (const binding of rig.bindings) {
    const degrees = angles[binding.id] ?? binding.assembledAngleDeg;
    binding.group.setRotationFromAxisAngle(binding.axis, degrees * DEG);
  }
}
