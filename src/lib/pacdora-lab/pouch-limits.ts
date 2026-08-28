import type { PouchLabInput } from "./types";

export type PouchDimensionField =
  | "width"
  | "height"
  | "depth"
  | "gussetMm"
  | "endSealMm"
  | "backSealMm";

export type PouchDimensionLimit = {
  min: number;
  max: number;
  step: number;
};

export type PouchDimensionLimits = Record<PouchDimensionField, PouchDimensionLimit>;

function clamp(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, finite));
}

function floorTenth(value: number): number {
  return Math.floor(value * 10) / 10;
}

/**
 * Safe editor limits for the research pouch families. Cross-field maxima are
 * recalculated after every edit, so a narrow pouch cannot retain a depth,
 * gusset, or heat seal that its face dimensions cannot support.
 */
export function getPouchDimensionLimits(input: PouchLabInput): PouchDimensionLimits {
  const standUp = input.style === "stand-up";
  const widthBase = standUp ? { min: 80, max: 400 } : { min: 50, max: 400 };
  const heightBase = standUp ? { min: 120, max: 600 } : { min: 80, max: 600 };
  const width = clamp(input.width, widthBase.min, widthBase.max);
  const height = clamp(input.height, heightBase.min, heightBase.max);
  const gussetMax = standUp
    ? Math.max(30, floorTenth(Math.min(160, width * 0.9, height * 0.55)))
    : 160;
  const gusset = clamp(input.gussetMm, standUp ? 30 : 20, gussetMax);
  const depthMax = standUp
    ? Math.max(12, floorTenth(Math.min(width * 0.62, height * 0.3, gusset * 0.86)))
    : Math.max(10, floorTenth(Math.min(180, width * 0.78, height * 0.42)));
  const heatSealMax = standUp
    ? Math.max(8, floorTenth(Math.min(24, width * 0.16, height * 0.1)))
    : 30;

  return {
    width: { ...widthBase, step: 1 },
    height: { ...heightBase, step: 1 },
    depth: { min: standUp ? 12 : 10, max: depthMax, step: 1 },
    gussetMm: { min: standUp ? 30 : 20, max: gussetMax, step: 1 },
    endSealMm: { min: standUp ? 8 : 6, max: heatSealMax, step: 0.5 },
    backSealMm: { min: 6, max: Math.max(6, floorTenth(Math.min(35, width * 0.25))), step: 0.5 },
  };
}

/** Keeps local UI state inside the complete, dynamically coupled range. */
export function constrainPouchLabInput(input: PouchLabInput): PouchLabInput {
  const firstPass = getPouchDimensionLimits(input);
  const width = clamp(input.width, firstPass.width.min, firstPass.width.max);
  const height = clamp(input.height, firstPass.height.min, firstPass.height.max);
  const dimensional = { ...input, width, height };
  const limits = getPouchDimensionLimits(dimensional);
  const gussetMm = clamp(input.gussetMm, limits.gussetMm.min, limits.gussetMm.max);
  const withGusset = { ...dimensional, gussetMm };
  const finalLimits = getPouchDimensionLimits(withGusset);

  return {
    ...withGusset,
    depth: clamp(input.depth, finalLimits.depth.min, finalLimits.depth.max),
    endSealMm: clamp(input.endSealMm, finalLimits.endSealMm.min, finalLimits.endSealMm.max),
    backSealMm: clamp(input.backSealMm, finalLimits.backSealMm.min, finalLimits.backSealMm.max),
    inflation: clamp(input.inflation, 0.05, 1),
  };
}
