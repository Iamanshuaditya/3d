import { getPacdoraLabMaterial } from "./materials";
import type {
  BoxLabInput,
  BoxLabSolution,
  DielineLine,
  DielinePanel,
  Dimensions3,
  MaterialProfile,
} from "./types";

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
  return value;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type Allowances = {
  innerToManufacture: Dimensions3;
  manufactureToOuter: Dimensions3;
};

function materialAllowances(material: MaterialProfile): Allowances {
  const scorePair = 2 * material.caliperMm * material.scoreAllowanceFactor;
  const outerPair = 2 * material.caliperMm * material.outerAllowanceFactor;
  return {
    innerToManufacture: {
      length: scorePair,
      width: scorePair,
      height: scorePair,
    },
    manufactureToOuter: {
      length: outerPair,
      width: outerPair,
      height: material.caliperMm * material.closureStackFactor,
    },
  };
}

function addDimensions(a: Dimensions3, b: Dimensions3): Dimensions3 {
  return {
    length: round(a.length + b.length),
    width: round(a.width + b.width),
    height: round(a.height + b.height),
  };
}

function subtractDimensions(a: Dimensions3, b: Dimensions3): Dimensions3 {
  const result = {
    length: round(a.length - b.length),
    width: round(a.width - b.width),
    height: round(a.height - b.height),
  };
  positive(result.length, "Resolved length");
  positive(result.width, "Resolved width");
  positive(result.height, "Resolved height");
  return result;
}

export function resolveBoxDimensionModes(
  dimensions: Dimensions3,
  mode: BoxLabInput["dimensionMode"],
  material: MaterialProfile,
): Pick<BoxLabSolution, "inner" | "manufacture" | "outer"> {
  positive(dimensions.length, "Length");
  positive(dimensions.width, "Width");
  positive(dimensions.height, "Height");
  const allowances = materialAllowances(material);

  if (mode === "inner") {
    const manufacture = addDimensions(dimensions, allowances.innerToManufacture);
    return {
      inner: { ...dimensions },
      manufacture,
      outer: addDimensions(manufacture, allowances.manufactureToOuter),
    };
  }
  if (mode === "outer") {
    const manufacture = subtractDimensions(dimensions, allowances.manufactureToOuter);
    return {
      inner: subtractDimensions(manufacture, allowances.innerToManufacture),
      manufacture,
      outer: { ...dimensions },
    };
  }
  return {
    inner: subtractDimensions(dimensions, allowances.innerToManufacture),
    manufacture: { ...dimensions },
    outer: addDimensions(dimensions, allowances.manufactureToOuter),
  };
}

function panel(
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  role: DielinePanel["role"],
): DielinePanel {
  return { id, label, x, y, width, height, role };
}

function crease(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): DielineLine {
  return { id, x1, y1, x2, y2, kind: "crease" };
}

function cut(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): DielineLine {
  return { id, x1, y1, x2, y2, kind: "cut" };
}

/**
 * Experimental hinged-lid mailer solver. Every displayed panel and every
 * folded preview dimension comes from this single resolved structure.
 */
export function solvePacdoraLabBox(input: BoxLabInput): BoxLabSolution {
  const material = getPacdoraLabMaterial(input.materialId, "rigid");
  const modes = resolveBoxDimensionModes(input.dimensions, input.dimensionMode, material);
  const { length, width, height } = modes.manufacture;
  const margin = Math.max(8, material.caliperMm * 4);
  const lidTuck = Math.max(height * 0.58, 24);
  const frontTuck = Math.max(height * 0.42, 18);
  const lockWidth = Math.min(length * 0.34, 72);
  const lockDepth = Math.max(12, height * 0.18);
  const centreX = margin + height;
  const lidY = margin + lidTuck;
  const backY = lidY + width;
  const baseY = backY + height;
  const frontY = baseY + width;
  const frontTuckY = frontY + height;
  const lockX = centreX + (length - lockWidth) * 0.5;
  const lockY = frontTuckY + frontTuck;
  const panels: DielinePanel[] = [
    panel("lid-tuck", "Lid tuck", centreX, margin, length, lidTuck, "flap"),
    panel("lid-left", "Lid left wall", margin, lidY, height, width, "wall"),
    panel("lid", "Lid", centreX, lidY, length, width, "lid"),
    panel("lid-right", "Lid right wall", centreX + length, lidY, height, width, "wall"),
    panel("back-left-dust", "Back left dust flap", margin, backY, height, height, "flap"),
    panel("back", "Back wall", centreX, backY, length, height, "wall"),
    panel("back-right-dust", "Back right dust flap", centreX + length, backY, height, height, "flap"),
    panel("left", "Left wall", margin, baseY, height, width, "wall"),
    panel("base", "Base", centreX, baseY, length, width, "body"),
    panel("right", "Right wall", centreX + length, baseY, height, width, "wall"),
    panel("front-left-dust", "Front left dust flap", margin, frontY, height, height, "flap"),
    panel("front", "Front wall", centreX, frontY, length, height, "wall"),
    panel("front-right-dust", "Front right dust flap", centreX + length, frontY, height, height, "flap"),
    panel("front-tuck", "Front roll", centreX, frontTuckY, length, frontTuck, "flap"),
    panel("front-lock", "Front locking tongue", lockX, lockY, lockWidth, lockDepth, "flap"),
  ];
  const lines: DielineLine[] = [
    crease("lid-tuck-fold", centreX, lidY, centreX + length, lidY),
    crease("lid-left-fold", centreX, lidY, centreX, lidY + width),
    crease("lid-right-fold", centreX + length, lidY, centreX + length, lidY + width),
    crease("lid-back-fold", centreX, backY, centreX + length, backY),
    crease("back-left-dust-fold", centreX, backY, centreX, backY + height),
    crease("back-right-dust-fold", centreX + length, backY, centreX + length, backY + height),
    crease("back-base-fold", centreX, baseY, centreX + length, baseY),
    crease("base-left-fold", centreX, baseY, centreX, baseY + width),
    crease("base-right-fold", centreX + length, baseY, centreX + length, baseY + width),
    crease("base-front-fold", centreX, frontY, centreX + length, frontY),
    crease("front-left-dust-fold", centreX, frontY, centreX, frontY + height),
    crease("front-right-dust-fold", centreX + length, frontY, centreX + length, frontY + height),
    crease("front-roll-fold", centreX, frontTuckY, centreX + length, frontTuckY),
    crease("front-lock-fold", lockX, lockY, lockX + lockWidth, lockY),
    cut("left-lock-slot", centreX + length * 0.24, frontY + height * 0.34, centreX + length * 0.24, frontY + height * 0.66),
    cut("right-lock-slot", centreX + length * 0.76, frontY + height * 0.34, centreX + length * 0.76, frontY + height * 0.66),
  ];

  return {
    kind: "box",
    material,
    input,
    ...modes,
    blank: {
      width: round(length + 2 * height + 2 * margin),
      height: round(lidTuck + width + height + width + height + frontTuck + lockDepth + 2 * margin),
      margin,
    },
    panels,
    lines,
    assumptions: [
      "Research construction: hinged-lid mailer topology, not a certified cutting die.",
      "Lid wings, four dust flaps, a rolled front wall, and a centre locking tongue form a multi-part closure.",
      "Caliper changes score and closure allowances before the dieline is generated.",
      "Production coefficients must be replaced by converter-approved rules per stock and flute direction.",
    ],
  };
}
