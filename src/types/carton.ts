/**
 * Folded-carton dieline spec.
 *
 * Legacy cartons use rectangular panel metadata plus optional presentation cut
 * paths. New production structural cartons may additionally carry a canonical
 * vector authority; when present that authority owns 2D geometry, exact panel
 * extraction, UVs, hinge axes, 3D meshes and manufacturing output.
 */

import type { CanonicalDieline } from "@/lib/structure/vector-domain";
import type { StructuralConstructionSpec } from "@/lib/structure/structural-rig";
import type { StructuralTopologyProfile } from "@/lib/structure/topology-profile";
import type { UnfoldSpec } from "./unfold";

/** Rect in dieline space, millimetres, y increasing downward (like a canvas). */
export type PanelRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DielinePoint = {
  x: number;
  y: number;
};

export type DielinePath = {
  points: DielinePoint[];
  closed?: boolean;
};

export type CartonPanel = {
  id: string;
  rect: PanelRect;
  /** Panel this one folds away from. Omit for the root panel. */
  parent?: string;
  /**
   * Fold angle in degrees when assembled. Direction is inferred from the
   * panels' relative positions in the dieline, so specs stay declarative.
   */
  angle?: number;
  /** Marks the hinge whose angle the open/close control animates. */
  hinge?: "lid";
};

export type StructuralCartonAuthority = Readonly<{
  /** Exact imported vector authority in canonical millimetres. */
  dieline: CanonicalDieline;
  /**
   * Optional reviewed topology-only profile for known sub-tolerance source
   * gaps. It never changes editor/manufacturing vectors; it only controls how
   * the planar adjacency graph is derived, with every repair recorded.
   */
  topology?: StructuralTopologyProfile;
  /** Reviewed, hash-locked construction facts bound to source crease spans. */
  construction: StructuralConstructionSpec;
}>;

export type CartonSpec = {
  id: string;
  name: string;
  /** Overall dieline/page bounds in millimetres. */
  width: number;
  height: number;
  /** Board thickness, used to soften the crease so folds are not knife-edged. */
  boardThickness: number;
  /**
   * Legacy rectangle articulation. Production structural cartons ignore these
   * shapes once `structural` is present; they remain for backwards-compatible
   * product metadata and older generated cartons.
   */
  panels: CartonPanel[];
  /** Lid hinge angles in degrees: assembled-closed vs fully open. */
  lidClosedAngle: number;
  lidOpenAngle: number;
  /**
   * Canonical structural authority. This is intentionally opt-in so existing
   * cartons keep rendering unchanged while exact imported cartons can use a
   * dieline-first pipeline without a second shape definition.
   */
  structural?: StructuralCartonAuthority;
  /**
   * Optional authored unfolding sequence. Packaging construction order is a
   * manufacturing fact, so it belongs in the spec rather than being inferred
   * from tree shape. Omit it and `unfold-plan.ts` derives a topological
   * fallback, so a new spec unfolds sensibly with no extra authoring.
   */
  unfold?: UnfoldSpec;
  /**
   * Legacy production-style cut and crease paths. They are presentation-only
   * when `structural` exists; canonical vector entities take precedence.
   */
  dieline?: {
    cuts: DielinePath[];
    creases: DielinePath[];
    /** Contour offset outline (rendered green, like production bleed). */
    bleed?: DielinePath[];
  };
  /**
   * Physical construction data for a tapered food clamshell. When present the
   * renderer builds two chamfered trays and a real rear hinge instead of
   * treating every dieline region as a square 90-degree wall.
   */
  clamshell?: {
    /** Maximum dimensions at the meeting rim, in millimetres. */
    width: number;
    depth: number;
    height: number;
    /** Height of the base tray / centre seam above the ground. */
    seamHeight: number;
    /** Flat base panel dimensions. */
    baseFloorWidth: number;
    baseFloorDepth: number;
    /** Flat lid panel dimensions. */
    lidTopWidth: number;
    lidTopDepth: number;
    /** Corner cuts on the horizontal panels and the centre rim. */
    panelChamfer: number;
    rimChamfer: number;
    /** Projecting front rim and its locking skirt. */
    rimDepth: number;
    frontLipDrop: number;
  };
};
