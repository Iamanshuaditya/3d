/**
 * Articulation contracts.
 *
 * A product's *structural* state is a set of hinge angles — never one global
 * scalar. Everything that moves (a carton lid, a flap, a future authored GLB
 * node) is described by the same three types so the UI, the animation loop and
 * the tests share one vocabulary.
 */

/** Absolute rotation, in degrees, keyed by hinge id. */
export type HingeAngles = Readonly<Record<string, number>>;

/** One rotational joint in a product's articulation graph. */
export type ArticulatedHinge = {
  id: string;
  /** Parent hinge id, or null when the joint hangs directly off the root. */
  parentId: string | null;
  /** Hinge count between this joint and the root (root's children = 1). */
  depth: number;
  /** Angle in the assembled / at-rest pose. */
  assembledAngleDeg: number;
  /** Angle when the product lies completely flat. */
  flatAngleDeg: number;
  /** Angle for the "open" pose. Only the primary articulation has one. */
  openAngleDeg?: number;
  /** The product's headline open/close joint (a carton lid, a case hinge). */
  isPrimary: boolean;
};

/**
 * One structural stage. `targets` are ABSOLUTE angles reached at the end of the
 * step, not deltas — so the pose at stage k is a pure fold of steps 1..k and a
 * click can never accumulate drift or corrupt state.
 */
export type UnfoldStep = {
  id: string;
  label: string;
  /** Label for undoing this step, when it reads better than "Back". */
  reverseLabel?: string;
  targets: HingeAngles;
};

export type UnfoldPlan = {
  /** Stage 0: the pose the product is first shown in. */
  assembled: HingeAngles;
  steps: UnfoldStep[];
  /** True when the final stage leaves every joint at its flat angle. */
  reachesFlat: boolean;
  /** Whether the sequence came from the product spec or was derived. */
  source: "authored" | "derived";
};

/**
 * Data-driven unfolding sequence, authored on a product spec. Packaging
 * construction order is a manufacturing fact, so it must be expressible as
 * data rather than inferred from tree shape alone.
 */
export type AuthoredUnfoldStep = {
  id: string;
  label: string;
  reverseLabel?: string;
  /** Hinge ids moved by this step. */
  hingeIds: string[];
  /**
   * Target pose for those hinges:
   *  "flat"      the hinge's flat angle (a carton dieline crease at 0deg)
   *  "open"      the hinge's open angle (primary articulation only)
   *  "assembled" back to the at-rest angle
   *  number      an explicit angle in degrees
   */
  to: "flat" | "open" | "assembled" | number;
};

export type UnfoldSpec = {
  mode: "hinge-graph";
  steps: AuthoredUnfoldStep[];
};

/**
 * Extension point for arbitrary GLBs (mailer cases, folding displays, hinged
 * containers). A normal GLB carries no structural information, so mechanical
 * unfolding requires this metadata to be authored alongside the model — it can
 * never be inferred. Declared here so onboarding can start emitting it; the
 * runtime resolver reports `unsupported` until a GLB articulation driver
 * exists, rather than pretending an arbitrary mesh can flatten.
 */
export type GlbArticulationSpec = {
  mode: "glb-nodes";
  hinges: {
    /** Node name inside the GLB. */
    nodeName: string;
    parentNodeName: string | null;
    /** Rotation axis in the node's local frame. */
    axis: [number, number, number];
    /** Pivot point in the node's local frame. */
    pivot: [number, number, number];
    assembledAngleDeg: number;
    flatAngleDeg: number;
    openAngleDeg?: number;
    isPrimary?: boolean;
  }[];
  sequence?: AuthoredUnfoldStep[];
};
