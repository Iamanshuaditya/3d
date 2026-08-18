/**
 * Folded-carton dieline spec.
 *
 * This is the entire definition of a box product. From one spec we derive:
 *   - the 3D mesh (panels folded along their creases)
 *   - the 2D editor canvas (the dieline IS the flat layout)
 *   - UVs (each panel's UV is its own rect within the dieline bounds, which is
 *     why artwork flows continuously across folds with no seam fixing)
 *   - the open/close animation (interpolate the hinge angles)
 *
 * Adding a box product = writing one of these. No modelling.
 */

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

export type CartonSpec = {
  id: string;
  name: string;
  /** Overall dieline bounds in millimetres. */
  width: number;
  height: number;
  /** Board thickness, used to soften the crease so folds are not knife-edged. */
  boardThickness: number;
  panels: CartonPanel[];
  /** Lid hinge angles in degrees: assembled-closed vs fully open. */
  lidClosedAngle: number;
  lidOpenAngle: number;
  /**
   * Optional production-style cut and crease paths. Rectangular panel bounds
   * remain the UV source of truth; these paths preserve the tabs, ears and
   * tapered cut silhouette that cannot be represented by rectangles alone.
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
