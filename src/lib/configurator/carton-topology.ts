import type { CartonPanel, CartonSpec } from "@/types/carton";
import type { ArticulatedHinge } from "@/types/unfold";
import { resolveStructuralCarton } from "./structural-carton";

/**
 * Pure dieline topology: which panel folds against which, where the crease
 * runs, and where each panel lands when the carton is laid flat.
 *
 * Legacy specs use rectangle adjacency here. Exact structural specs bypass
 * that inference and return their source-validated crease graph instead.
 */

export const MM_TO_UNITS = 0.01;

export type HingeGeometry = {
  axis: "x" | "z";
  sign: 1 | -1;
  /** Crease position in dieline millimetres. */
  hx: number;
  hy: number;
};

/**
 * Which edge the child shares with its parent, and therefore which way it
 * folds. Direction is inferred from the panels' relative dieline positions, so
 * specs stay declarative. Production structural cartons do not use this
 * inference; their crease axes are bound to canonical source spans.
 */
export function resolveHinge(parent: CartonPanel, child: CartonPanel): HingeGeometry {
  const p = parent.rect;
  const c = child.rect;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.51;

  if (near(c.y, p.y + p.h)) {
    return { axis: "x", sign: -1, hx: c.x + c.w / 2, hy: c.y };
  }
  if (near(c.y + c.h, p.y)) {
    return { axis: "x", sign: 1, hx: c.x + c.w / 2, hy: p.y };
  }
  if (near(c.x, p.x + p.w)) {
    return { axis: "z", sign: 1, hx: c.x, hy: c.y + c.h / 2 };
  }
  if (near(c.x + c.w, p.x)) {
    return { axis: "z", sign: -1, hx: p.x, hy: c.y + c.h / 2 };
  }
  throw new Error(
    `Carton spec "${child.id}" does not share an edge with its parent "${parent.id}".`,
  );
}

export type CartonTopology = {
  root: CartonPanel;
  byId: Map<string, CartonPanel>;
  childrenOf: Map<string, CartonPanel[]>;
  /** Hinge count from the root. The root panel itself is 0. */
  depthOf: Map<string, number>;
  /** Every panel that folds, in breadth-first order. */
  articulated: CartonPanel[];
};

/** Rectangle-only compatibility topology. Exact structural cartons use resolveStructuralCarton(). */
export function cartonTopology(spec: CartonSpec): CartonTopology {
  const byId = new Map(spec.panels.map((panel) => [panel.id, panel]));
  const childrenOf = new Map<string, CartonPanel[]>();
  let root: CartonPanel | null = null;

  for (const panel of spec.panels) {
    if (!panel.parent) {
      if (root) {
        throw new Error(
          `Carton spec "${spec.id}" has more than one root panel ("${root.id}", "${panel.id}").`,
        );
      }
      root = panel;
      continue;
    }
    if (!byId.has(panel.parent)) {
      throw new Error(
        `Carton spec "${spec.id}": panel "${panel.id}" names a missing parent "${panel.parent}".`,
      );
    }
    const list = childrenOf.get(panel.parent) ?? [];
    list.push(panel);
    childrenOf.set(panel.parent, list);
  }
  if (!root) throw new Error(`Carton spec "${spec.id}" has no root panel.`);

  const depthOf = new Map<string, number>([[root.id, 0]]);
  const articulated: CartonPanel[] = [];
  const queue: CartonPanel[] = [root];
  while (queue.length) {
    const panel = queue.shift()!;
    const depth = depthOf.get(panel.id)!;
    for (const child of childrenOf.get(panel.id) ?? []) {
      depthOf.set(child.id, depth + 1);
      articulated.push(child);
      queue.push(child);
    }
  }
  if (articulated.length !== spec.panels.length - 1) {
    throw new Error(
      `Carton spec "${spec.id}" has panels detached from the root panel tree.`,
    );
  }

  return { root, byId, childrenOf, depthOf, articulated };
}

/**
 * The articulation graph of a carton. Exact structural authority wins over
 * every inferred/legacy construction path.
 */
export function cartonHinges(spec: CartonSpec): ArticulatedHinge[] {
  if (spec.structural) {
    return [...resolveStructuralCarton(spec)!.rig.articulatedHinges];
  }

  if (spec.clamshell) {
    return [
      {
        id: "LID_ASSEMBLY",
        parentId: null,
        depth: 1,
        assembledAngleDeg: spec.lidClosedAngle,
        // The clamshell's trays are assembled shells, not folding panels; the
        // lid joint has no flat pose that corresponds to the dieline.
        flatAngleDeg: spec.lidClosedAngle,
        openAngleDeg: spec.lidOpenAngle,
        isPrimary: true,
      },
    ];
  }

  const topology = cartonTopology(spec);
  return topology.articulated.map((panel) => {
    const isPrimary = panel.hinge === "lid";
    const parent = topology.byId.get(panel.parent!)!;
    // Every hinge must be geometrically resolvable, or the mesh builder would
    // throw later at render time instead of here at plan time.
    resolveHinge(parent, panel);
    return {
      id: panel.id,
      parentId: parent.parent ? parent.id : null,
      depth: topology.depthOf.get(panel.id)!,
      assembledAngleDeg: isPrimary ? spec.lidClosedAngle : (panel.angle ?? 0),
      flatAngleDeg: 0,
      ...(isPrimary ? { openAngleDeg: spec.lidOpenAngle } : {}),
      isPrimary,
    } satisfies ArticulatedHinge;
  });
}

/** Whether this construction can genuinely reach its printed dieline. */
export function cartonCanFlatten(spec: CartonSpec): boolean {
  if (spec.structural) return resolveStructuralCarton(spec)!.panels.length > 1;
  return !spec.clamshell && spec.panels.length > 1;
}

/**
 * Where a legacy rectangular panel's centre sits, in scene units relative to
 * the carton root once every hinge is flat. Exact structural callers should
 * use canonical panel coordinates directly instead of reducing polygons to a
 * rectangle centre.
 */
export function flatPanelOffset(spec: CartonSpec, panelId: string): { x: number; z: number } {
  if (spec.structural) {
    throw new Error(
      `flatPanelOffset() is a legacy rectangle helper and cannot represent exact structural panel ${panelId}.`,
    );
  }
  const topology = cartonTopology(spec);
  const panel = topology.byId.get(panelId);
  if (!panel) throw new Error(`Carton spec "${spec.id}" has no panel "${panelId}".`);
  const centre = (p: CartonPanel) => ({
    x: p.rect.x + p.rect.w / 2,
    y: p.rect.y + p.rect.h / 2,
  });
  const here = centre(panel);
  const rootCentre = centre(topology.root);
  return {
    x: (here.x - rootCentre.x) * MM_TO_UNITS,
    z: (here.y - rootCentre.y) * MM_TO_UNITS,
  };
}
