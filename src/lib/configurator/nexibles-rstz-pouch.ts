import type { PouchSpec } from "@/types/pouch";

export const NEXIBLES_RSTZ_POUCH_ID = "nexibles-rstz-190x265-110";

export const NEXIBLES_RSTZ_DIMENSIONS = Object.freeze({
  nominalWidthMm: 190,
  frontLengthMm: 265,
  gussetWebMm: 110,
  backLengthMm: 265,
  productionWebWidthMm: 191.5,
  productionRepeatMm: 684,
  terminalTechnicalBandMm: 14,
  transitionBandMm: 4,
  rightReferenceMm: 10.75,
});

const d = NEXIBLES_RSTZ_DIMENSIONS;
const assumedMaximumBodyDepthMm = 78;
const assumedTopSealHeightMm = 12;
const assumedSideFinMm = 2.5;

/**
 * Source-measured web plus a deliberately labelled flexible-film preview.
 * Nominal pouch dimensions and production-web dimensions remain distinct.
 */
export const nexiblesRstzPouchSpec: PouchSpec = {
  id: NEXIBLES_RSTZ_POUCH_ID,
  name: "Nexibles RSTZ Large Pouch 190×265+110",
  style: "stand_up",
  width: d.nominalWidthMm,
  height: d.frontLengthMm,
  gusset: d.gussetWebMm,
  dielineBleed: 0,
  productionWeb: {
    widthMm: d.productionWebWidthMm,
    repeatMm: d.productionRepeatMm,
    laneCount: 1,
    longitudinalAxis: "vertical",
    segments: [
      { id: "technical-leading", label: "14 mm technical/slitting band", role: "technical", lengthMm: d.terminalTechnicalBandMm },
      { id: "front", label: "FRONT", role: "front", lengthMm: d.frontLengthMm, artworkOrientationDeg: 0 },
      { id: "front-transition-a", label: "4 mm technical transition", role: "technical", lengthMm: d.transitionBandMm },
      { id: "front-transition-b", label: "4 mm technical transition", role: "technical", lengthMm: d.transitionBandMm },
      { id: "gusset", label: "GUSSET", role: "gusset", lengthMm: d.gussetWebMm, artworkOrientationDeg: 0 },
      { id: "back-transition-a", label: "4 mm technical transition", role: "technical", lengthMm: d.transitionBandMm },
      { id: "back-transition-b", label: "4 mm technical transition", role: "technical", lengthMm: d.transitionBandMm },
      { id: "back", label: "BACK (flat source: 180°)", role: "back", lengthMm: d.backLengthMm, artworkOrientationDeg: 180 },
      { id: "technical-trailing", label: "14 mm technical/slitting band", role: "technical", lengthMm: d.terminalTechnicalBandMm },
    ],
    referenceGuides: [
      {
        id: "right-reference-10.75",
        axis: "x",
        positionMm: d.productionWebWidthMm - d.rightReferenceMm,
        label: "10.75 mm source reference - meaning unconfirmed",
        meaning: "unconfirmed",
      },
    ],
    sourceReview: [
      {
        id: "right-reference-10.75",
        observed: "10.75 mm dimension from the right production-web edge",
        status: "unconfirmed-meaning",
        note: "Preserved as a reference guide; the PDFs do not certify whether it is a seal, slit, or registration allowance.",
      },
      {
        id: "hatched-zones",
        observed: "Red hatched side and transverse zones on the annotated artwork",
        status: "unconfirmed-meaning",
        note: "Do not present as a certified sealing or non-print zone until converter semantics are supplied.",
      },
      {
        id: "circular-marks",
        observed: "Circular/semicircular marks at transition boundaries",
        status: "requires-source-vector",
        note: "Artwork PDF visually confirms the marks, but their operation and exact reusable construction are not certified.",
      },
      {
        id: "slitting-mark",
        observed: "Right-side slitting-mark callout and unwind direction PIFA 4",
        status: "unconfirmed-meaning",
        note: "The web boundary is preserved; no cutting behavior is inferred from the callout.",
      },
    ],
    previewAssumptions: [
      {
        id: "opened-body-depth",
        valueMm: assumedMaximumBodyDepthMm,
        note: "Flexible 3D preview assumption only. The +110 mm unfolded gusset does not certify filled/opened body depth.",
      },
      {
        id: "seal-and-notch-form",
        valueMm: assumedTopSealHeightMm,
        note: "12 mm top shaping and 2.5 mm side fins are visual preview parameters, not interpretations of the 14 mm terminal bands. Zipper, notch, and converter seal construction are not certified.",
      },
    ],
  },
  halfWidth: [
    { t: 0, v: d.nominalWidthMm * 0.43 },
    { t: 0.08, v: d.nominalWidthMm * 0.47 },
    { t: 0.76, v: d.nominalWidthMm * 0.485 },
    { t: 1, v: d.nominalWidthMm * 0.48 },
  ],
  halfDepth: [
    { t: 0, v: d.gussetWebMm * 0.25 },
    { t: 0.08, v: assumedMaximumBodyDepthMm * 0.48 },
    { t: 0.5, v: assumedMaximumBodyDepthMm * 0.5 },
    { t: 0.76, v: assumedMaximumBodyDepthMm * 0.42 },
    { t: 0.9, v: assumedMaximumBodyDepthMm * 0.08 },
    { t: 1, v: 1 },
  ],
  cuspExponent: 1.24,
  topSealHeight: assumedTopSealHeightMm,
  resealableZip: false,
  zipperOffset: 0,
  sealFin: assumedSideFinMm,
  notchOffset: 0,
  notchSize: 0,
  creaseDepth: 1.35,
  crinkleDepth: 0.55,
  segmentsAcross: 96,
  segmentsUp: 144,
  segmentsGusset: 48,
};
