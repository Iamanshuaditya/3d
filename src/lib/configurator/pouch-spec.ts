import type { PouchSpec } from "@/types/pouch";

/**
 * VistaPrint stand-up pouch selected by the supplied Studio URL:
 * 3.25 x 4.75 x 2 in, Clear Barrier (PET/EVOH Coex), no zipper.
 *
 * Dimensions remain in millimetres all the way through geometry generation.
 * The print web is laid out exactly like the production editor:
 *
 *   bleed | back (120.65) | gusset (50.8) | front (120.65) | bleed
 *
 * The 1.999 mm end bleeds make the complete web 296.098 mm, matching the
 * exact Calcifer design-view response used by the live Vistaprint editor.
 */
export const vistaPrintPouchSpec: PouchSpec = {
  id: "pouch-3.25x4.75x2",
  name: "Stand-Up Pouch 3.25×4.75×2 in",
  width: 82.55,
  height: 120.65,
  gusset: 50.8,
  dielineBleed: 1.999,

  // halfWidth describes the printable face, excluding the 2.2 mm side fins.
  // The lower seal draws the corners inward before the body reaches its full
  // width, producing the characteristic curved standing silhouette.
  halfWidth: [
    { t: 0, v: 36.2 },
    { t: 0.025, v: 36.8 },
    { t: 0.07, v: 38.15 },
    { t: 0.16, v: 39.0 },
    { t: 0.74, v: 39.075 },
    { t: 0.88, v: 39.0 },
    { t: 1, v: 38.85 },
  ],

  // A real 2-inch gusset does not become a 2-inch-deep rigid box. The folded
  // laminate opens to a rounded ~34 mm body and a ~27 mm contact footprint.
  halfDepth: [
    { t: 0, v: 13.7 },
    { t: 0.025, v: 15.0 },
    { t: 0.075, v: 17.0 },
    { t: 0.2, v: 17.7 },
    { t: 0.42, v: 18.0 },
    { t: 0.62, v: 17.0 },
    { t: 0.76, v: 14.3 },
    { t: 0.84, v: 9.2 },
    { t: 0.875, v: 3.0 },
    { t: 0.9, v: 1.1 },
    { t: 1, v: 0.55 },
  ],

  cuspExponent: 1.24,
  topSealHeight: 15.875,
  resealableZip: false,
  zipperOffset: 21,

  sealFin: 2.2,
  notchOffset: 15,
  notchSize: 3.2,

  creaseDepth: 1.15,
  crinkleDepth: 0.34,

  segmentsAcross: 88,
  segmentsUp: 132,
  segmentsGusset: 40,
};

/** Production web used by the imported 160 × 240 + 90 mm Meshy pouch. */
export const meshyPouchSpec: PouchSpec = {
  id: "meshy-pouch-160x240x90",
  name: "Stand-Up Pouch 160×240+90 mm",
  width: 160,
  height: 240,
  gusset: 90,
  dielineBleed: 2,
  halfWidth: [
    { t: 0, v: 70 },
    { t: 0.12, v: 76 },
    { t: 0.82, v: 78 },
    { t: 1, v: 77 },
  ],
  halfDepth: [
    { t: 0, v: 30 },
    { t: 0.18, v: 34 },
    { t: 0.7, v: 26 },
    { t: 0.9, v: 4 },
    { t: 1, v: 1 },
  ],
  cuspExponent: 1.24,
  topSealHeight: 25,
  resealableZip: true,
  zipperOffset: 35,
  sealFin: 3,
  notchOffset: 28,
  notchSize: 4,
  creaseDepth: 1,
  crinkleDepth: 0.3,
  segmentsAcross: 88,
  segmentsUp: 132,
  segmentsGusset: 40,
};


// ---------------------------------------------------------------------------
// Parametric pouch factory: the industry-style entry point. A product is
// {style, width, height, depth, zipper} — profiles, seals and dieline defaults
// are derived. Adding a pouch SKU = one makePouchSpec call.
// ---------------------------------------------------------------------------

export type PouchParams = {
  id: string;
  name: string;
  style: NonNullable<PouchSpec["style"]>;
  /** Face width, mm. */
  width: number;
  /** Height, mm. */
  height: number;
  /** Body depth (box) / max bulge (pillow) / bottom gusset (stand-up), mm. */
  depth: number;
  zipper?: boolean;
};

export function makePouchSpec(params: PouchParams): PouchSpec {
  const { id, name, style, width, height, depth } = params;
  const standUp = style === "stand_up";
  return {
    id,
    name,
    style,
    width,
    height,
    gusset: standUp ? depth : 0,
    depth,
    dielineBleed: 2,
    halfWidth: [
      { t: 0, v: width * 0.44 },
      { t: 0.07, v: width * 0.465 },
      { t: 0.75, v: width * 0.475 },
      { t: 1, v: width * 0.47 },
    ],
    halfDepth: [
      { t: 0, v: depth * 0.16 },
      { t: 0.08, v: depth * 0.2 },
      { t: 0.42, v: depth * 0.215 },
      { t: 0.76, v: depth * 0.17 },
      { t: 0.875, v: depth * 0.04 },
      { t: 1, v: depth * 0.008 },
    ],
    cuspExponent: 1.24,
    topSealHeight: 12,
    endSealHeight: 10,
    resealableZip: params.zipper ?? false,
    zipperOffset: 20,
    sealFin: 2.4,
    notchOffset: 15,
    notchSize: 3.2,
    creaseDepth: 1.2,
    crinkleDepth: 0.95,
    segmentsAcross: 88,
    segmentsUp: 132,
    segmentsGusset: 40,
  };
}

export const generatedPouchSpecs: PouchSpec[] = [
  makePouchSpec({ id: "pouch-su-160", name: "Stand-Up Pouch 160\u00d7240+90", style: "stand_up", width: 160, height: 240, depth: 90 }),
  makePouchSpec({ id: "pouch-su-zip-160", name: "Stand-Up Zipper Pouch 160\u00d7240+90", style: "stand_up", width: 160, height: 240, depth: 90, zipper: true }),
  makePouchSpec({ id: "pouch-3ss-130", name: "3-Side-Seal Pouch 130\u00d7180", style: "three_side_seal", width: 130, height: 180, depth: 46 }),
  makePouchSpec({ id: "pouch-3ss-zip-130", name: "3-Side-Seal Zipper Pouch 130\u00d7180", style: "three_side_seal", width: 130, height: 180, depth: 46, zipper: true }),
  makePouchSpec({ id: "pouch-cs-120", name: "Center-Seal Pouch 120\u00d7200", style: "center_seal", width: 120, height: 200, depth: 56 }),
  makePouchSpec({ id: "pouch-fb-130", name: "Flat-Bottom Pouch 130\u00d7210+80", style: "flat_bottom", width: 130, height: 210, depth: 80 }),
  makePouchSpec({ id: "pouch-fb-zip-130", name: "Flat-Bottom Zipper Pouch 130\u00d7210+80", style: "flat_bottom", width: 130, height: 210, depth: 80, zipper: true }),
  makePouchSpec({ id: "pouch-sg-90", name: "Side-Gusset Pouch 90\u00d7230+60", style: "side_gusset", width: 90, height: 230, depth: 60 }),
  // 1 kg whole-bean coffee bag: the most common flat-bottom SKU on the market.
  // Flat-bottom holds full depth to the top, so a filled brick stands square on
  // shelf; the zipper is what makes it resealable after opening.
  makePouchSpec({ id: "pouch-fb-coffee-1kg", name: "Flat-Bottom Coffee Pouch 190\u00d7290+75", style: "flat_bottom", width: 190, height: 290, depth: 75, zipper: true }),
];

export const POUCHES: Record<string, PouchSpec> = {
  [vistaPrintPouchSpec.id]: vistaPrintPouchSpec,
  [meshyPouchSpec.id]: meshyPouchSpec,
  ...Object.fromEntries(generatedPouchSpecs.map((spec) => [spec.id, spec])),
};
