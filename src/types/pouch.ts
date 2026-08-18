/** Production measurements for a printed stand-up pouch (doypack). */

/** A control point on a vertical profile: t = 0 at the base, 1 at the top seal. */
export type ProfilePoint = {
  t: number;
  /** Millimetres. */
  v: number;
};

/**
 * Pouch construction style. "stand_up" uses the original doypack builder;
 * the others go through the styled parametric builder.
 */
export type PouchStyle =
  | "stand_up"
  | "three_side_seal"
  | "center_seal"
  | "flat_bottom"
  | "side_gusset";

export type PouchSpec = {
  id: string;
  name: string;
  /** Construction style; defaults to "stand_up". */
  style?: PouchStyle;
  /** Body depth for pillow/box styles, mm (box: face-to-face; pillow: max bulge). */
  depth?: number;
  /** Horizontal end-seal band height for pillow styles, mm. */
  endSealHeight?: number;
  /** Front panel width, mm. */
  width: number;
  /** Overall height, mm. */
  height: number;
  /** Bottom gusset, mm (unfolded width — the standing base is roughly half). */
  gusset: number;

  /** Bleed added to each end of the flat print web, mm. */
  dielineBleed: number;

  /** Half-width at each height. Peaks just above the base, tapers at the shoulder. */
  halfWidth: ProfilePoint[];
  /** Half-depth at each height. This is what makes it read as filled, not flat. */
  halfDepth: ProfilePoint[];

  /**
   * Cross-section cusp exponent. >1 gives the pointed side-seal tips seen from
   * above; 1 would give a plain ellipse, which looks like a balloon.
   */
  cuspExponent: number;

  /** Heat-sealed band at the very top, mm. */
  topSealHeight: number;
  /** Whether a resealable zipper is present in this product configuration. */
  resealableZip: boolean;
  /** Resealable zipper centreline, measured down from the top, mm. */
  zipperOffset: number;

  /**
   * Flat sealed flange projecting past each side seal, mm. This is what gives a
   * pouch its sharp vertical silhouette edge — without it the body reads as a
   * soft cylinder rather than a sealed bag.
   */
  sealFin: number;
  /** Tear notch cut into the fins, measured down from the top, mm. */
  notchOffset: number;
  notchSize: number;

  /** Surface detail amplitudes, mm. */
  creaseDepth: number;
  crinkleDepth: number;

  /** Mesh resolution. */
  segmentsAcross: number;
  segmentsUp: number;
  segmentsGusset: number;
};
