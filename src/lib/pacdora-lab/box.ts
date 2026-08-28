import { getPacdoraLabMaterial } from "./materials";
import type {
  BoxConstruction,
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
  normalizedOutline?: Array<[number, number]>,
): DielinePanel {
  return {
    id,
    label,
    x,
    y,
    width,
    height,
    role,
    outline: normalizedOutline?.map(([pointX, pointY]) => ({
      x: Math.min(width, Math.max(0, round(pointX * width))),
      y: Math.min(height, Math.max(0, round(pointY * height))),
    })),
  };
}

type NormalizedOutline = Array<[number, number]>;

function mirrorX(points: NormalizedOutline): NormalizedOutline {
  return points.map(([x, y]) => [1 - x, y] as [number, number]).reverse();
}

function mirrorY(points: NormalizedOutline): NormalizedOutline {
  return points.map(([x, y]) => [x, 1 - y] as [number, number]).reverse();
}

function flapOutline(
  id: string,
  construction: BoxConstruction,
): NormalizedOutline | undefined {
  const profiles = {
    "roll-end": {
      lidTuck: [
        [0, 1], [0.04, 0.4], [0.15, 0.06], [0.85, 0.06], [0.96, 0.4], [1, 1],
      ],
      wing: [
        [1, 0], [1, 1], [0.2, 0.88], [0, 0.68], [0, 0.32], [0.2, 0.12],
      ],
      dust: [
        [0, 1], [1, 1], [0.84, 0.2], [0.62, 0], [0.18, 0.12], [0, 0.34],
      ],
      frontRoll: [
        [0, 0], [1, 0], [1, 0.55], [0.94, 0.85], [0.82, 1], [0.18, 1], [0.06, 0.85], [0, 0.55],
      ],
      lock: [
        [0, 0], [1, 0], [0.92, 0.55], [0.7, 1], [0.3, 1], [0.08, 0.55],
      ],
    },
    "ear-lock": {
      lidTuck: [
        [0, 1], [0, 0.32], [0.01, 0.19], [0.04, 0.09], [0.1, 0.03], [0.18, 0], [0.82, 0], [0.9, 0.03], [0.96, 0.09], [0.99, 0.19], [1, 0.32], [1, 1],
      ],
      wing: [
        [1, 0], [1, 1], [0.34, 1], [0.22, 0.98], [0.11, 0.92], [0.04, 0.82], [0, 0.7], [0, 0.58], [0.03, 0.5], [0, 0.42], [0, 0.3], [0.04, 0.18], [0.11, 0.08], [0.22, 0.02], [0.34, 0],
      ],
      dust: [
        [0, 1], [1, 1], [0.84, 0.62], [0.68, 0.14], [0.5, 0], [0.25, 0.2], [0.08, 0.64],
      ],
      frontRoll: [
        [0, 0], [1, 0], [1, 0.6], [0.92, 0.6], [0.86, 0.92], [0.68, 1], [0.32, 1], [0.14, 0.92], [0.08, 0.6], [0, 0.6],
      ],
      lock: [
        [0, 0], [1, 0], [1, 0.42], [0.86, 0.42], [0.96, 0.78], [0.72, 1], [0.28, 1], [0.04, 0.78], [0.14, 0.42], [0, 0.42],
      ],
    },
    display: {
      lidTuck: [
        [0, 1], [0.08, 0.18], [0.2, 0], [0.8, 0], [0.92, 0.18], [1, 1],
      ],
      wing: [
        [1, 0], [1, 1], [0.34, 0.86], [0.08, 0.64], [0, 0.42], [0.28, 0.14],
      ],
      dust: [
        [0, 1], [1, 1], [0.92, 0.58], [0.72, 0.18], [0.42, 0], [0.16, 0.24], [0.04, 0.62],
      ],
      frontRoll: [
        [0, 0], [1, 0], [1, 0.7], [0.82, 1], [0.6, 1], [0.5, 0.72], [0.4, 1], [0.18, 1], [0, 0.7],
      ],
      lock: [
        [0, 0], [1, 0], [0.86, 0.55], [0.62, 0.55], [0.5, 1], [0.38, 0.55], [0.14, 0.55],
      ],
    },
  } satisfies Record<BoxConstruction, Record<string, NormalizedOutline>>;
  const profile = profiles[construction];

  if (id === "lid-tuck") return profile.lidTuck;
  if (id === "lid-left") return profile.wing;
  if (id === "lid-right") return mirrorX(profile.wing);
  if (id === "back-left-dust") return profile.dust;
  if (id === "back-right-dust") return mirrorX(profile.dust);
  if (id === "front-left-dust") return mirrorY(profile.dust);
  if (id === "front-right-dust") return mirrorX(mirrorY(profile.dust));
  if (id === "front-tuck") return profile.frontRoll;
  if (id === "front-lock") return profile.lock;
  return undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
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
  const construction = input.construction ?? "roll-end";
  const margin = Math.max(8, material.caliperMm * 4);
  const lidTuckRatio = construction === "ear-lock" ? 0.68 : construction === "display" ? 0.42 : 0.58;
  const frontTuckRatio = construction === "ear-lock" ? 0.48 : construction === "display" ? 0.34 : 0.42;
  const lockWidthRatio = construction === "ear-lock" ? 0.48 : construction === "display" ? 0.3 : 0.34;
  const lockDepthRatio = construction === "ear-lock" ? 0.24 : construction === "display" ? 0.2 : 0.18;
  const lidTuck = clamp(height * lidTuckRatio, 10, height * 0.78);
  const frontTuck = clamp(height * frontTuckRatio, 8, height * 0.65);
  const lockWidth = Math.min(length * lockWidthRatio, construction === "ear-lock" ? 96 : 72);
  const lockDepth = clamp(height * lockDepthRatio, 4, height * 0.3);
  const centreX = margin + height;
  const lidY = margin + lidTuck;
  const backY = lidY + width;
  const baseY = backY + height;
  const frontY = baseY + width;
  const frontTuckY = frontY + height;
  const lockX = centreX + (length - lockWidth) * 0.5;
  const lockY = frontTuckY + frontTuck;
  const panels: DielinePanel[] = [
    panel("lid-tuck", "Lid tuck", centreX, margin, length, lidTuck, "flap", flapOutline("lid-tuck", construction)),
    panel("lid-left", "Lid wing L", margin, lidY, height, width, "wall", flapOutline("lid-left", construction)),
    panel("lid", "Lid", centreX, lidY, length, width, "lid"),
    panel("lid-right", "Lid wing R", centreX + length, lidY, height, width, "wall", flapOutline("lid-right", construction)),
    panel("back-left-dust", "Back dust L", margin, backY, height, height, "flap", flapOutline("back-left-dust", construction)),
    panel("back", "Back wall", centreX, backY, length, height, "wall"),
    panel("back-right-dust", "Back dust R", centreX + length, backY, height, height, "flap", flapOutline("back-right-dust", construction)),
    panel("left", "Left wall", margin, baseY, height, width, "wall"),
    panel("base", "Base", centreX, baseY, length, width, "body"),
    panel("right", "Right wall", centreX + length, baseY, height, width, "wall"),
    panel("front-left-dust", "Front dust L", margin, frontY, height, height, "flap", flapOutline("front-left-dust", construction)),
    panel("front", "Front wall", centreX, frontY, length, height, "wall"),
    panel("front-right-dust", "Front dust R", centreX + length, frontY, height, height, "flap", flapOutline("front-right-dust", construction)),
    panel("front-tuck", "Front roll", centreX, frontTuckY, length, frontTuck, "flap", flapOutline("front-tuck", construction)),
    panel("front-lock", "Lock tongue", lockX, lockY, lockWidth, lockDepth, "flap", flapOutline("front-lock", construction)),
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
    construction,
    material,
    input: { ...input, construction },
    ...modes,
    blank: {
      width: round(length + 2 * height + 2 * margin),
      height: round(lidTuck + width + height + width + height + frontTuck + lockDepth + 2 * margin),
      margin,
    },
    panels,
    lines,
    assumptions: [
      `Research construction: ${construction} hinged-lid mailer topology, not a certified cutting die.`,
      "Tapered wings, shaped dust flaps, a rolled front wall, and a locking tongue form a multi-part closure.",
      "Every animated part is parented to its physical crease, so the flat net and folded model share one topology.",
      "Caliper changes score and closure allowances before the dieline is generated.",
      "Production coefficients must be replaced by converter-approved rules per stock and flute direction.",
    ],
  };
}
