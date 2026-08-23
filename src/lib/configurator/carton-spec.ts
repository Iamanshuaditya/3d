import type { CartonSpec, DielinePath } from "@/types/carton";
import type { ProductConfig } from "@/types/configurator";
import { mailerBoxSpec } from "./mailer-box-spec";

/**
 * VistaPrint burger clamshell — 115 x 105 x 80 mm.
 *
 * A closed clamshell is not a cuboid. It is two shallow, tapered trays meeting
 * at their widest edge. The two 40 mm back walls are separate panels joined at
 * the rim; that second back panel is what lets the lid open without collapsing
 * into a flat square box.
 *
 * Dieline column, top to bottom:
 *
 *   lid front -> lid top -> lid back -> base back -> base -> base front
 *
 * Side walls and corner gussets sit to the left and right of the two large
 * horizontal panels. The overall production canvas remains 250 x 407 mm.
 */
const W = 115;
const D = 105;
const H = 40;

const DIELINE_W = 250;
const DIELINE_H = 407;
const X0 = (DIELINE_W - (W + H * 2)) / 2;
const XM = X0 + H;
const Y0 = (DIELINE_H - (H + D + H + H + D + H)) / 2;

const yLidFront = Y0;
const yLidTop = yLidFront + H;
const yLidBack = yLidTop + D;
const yBaseBack = yLidBack + H;
const yBase = yBaseBack + H;
const yBaseFront = yBase + D;

const path = (points: number[], closed = false): DielinePath => ({
  points: Array.from({ length: points.length / 2 }, (_, i) => ({
    x: points[i * 2],
    y: points[i * 2 + 1],
  })),
  closed,
});

const mirrorX = (source: DielinePath): DielinePath => ({
  ...source,
  points: source.points.map(({ x, y }) => ({ x: DIELINE_W - x, y })),
});

const lidLeft = path(
  [
    XM, yLidTop,
    X0 - 4, yLidTop + 7,
    X0 - 19, yLidTop + D - 7,
    X0 - 14, yLidTop + D + 4,
    X0, yLidTop + D,
    XM, yLidTop + D,
  ],
  true,
);

const baseLeft = path(
  [
    XM, yBase,
    X0, yBase,
    X0 - 20, yBase + 9,
    X0 - 27, yBase + D - 10,
    X0 - 24, yBase + D,
    X0 - 14, yBase + D + 7,
    X0, yBase + D,
    XM, yBase + D,
  ],
  true,
);

const lidFrontCut = path(
  [
    XM, yLidTop,
    XM, yLidFront,
    XM - 5, yLidFront - 5,
    XM - 7, yLidFront - 12,
    XM - 6, yLidFront - 15,
    XM - 14, yLidFront - 18,
    XM - 13, yLidFront - 8,
    XM - 16, yLidFront - 4,
    XM - 16, yLidFront + 2,
    XM - 13, yLidFront + 5,
    XM - 9, yLidFront + 14,
    XM, yLidFront + 18,
    XM + W, yLidFront + 18,
    XM + W + 9, yLidFront + 14,
    XM + W + 13, yLidFront + 5,
    XM + W + 16, yLidFront + 2,
    XM + W + 16, yLidFront - 4,
    XM + W + 13, yLidFront - 8,
    XM + W + 14, yLidFront - 18,
    XM + W + 6, yLidFront - 15,
    XM + W + 7, yLidFront - 12,
    XM + W + 5, yLidFront - 5,
    XM + W, yLidFront,
    XM + W, yLidTop,
  ],
  true,
);

const baseFrontCut = path(
  [
    XM, yBaseFront,
    XM, yBaseFront + H,
    XM - 13, DIELINE_H,
    XM - 38, yBaseFront + H - 15,
    XM - 50, yBaseFront + H - 1,
    XM - 56, yBaseFront + H,
    XM - 64, yBaseFront + H - 1,
    XM - 67, yBaseFront + H - 5,
    XM - 67, yBaseFront + 4,
    XM - 60, yBaseFront - 7,
    XM, yBaseFront,
    XM + W, yBaseFront,
    XM + W + 60, yBaseFront - 7,
    XM + W + 67, yBaseFront + 4,
    XM + W + 67, yBaseFront + H - 5,
    XM + W + 64, yBaseFront + H - 1,
    XM + W + 56, yBaseFront + H,
    XM + W + 50, yBaseFront + H - 1,
    XM + W + 38, yBaseFront + H - 15,
    XM + W + 13, DIELINE_H,
    XM + W, yBaseFront + H,
  ],
  true,
);

export const burgerBoxSpec: CartonSpec = {
  id: "burger-box",
  name: "Burger Box",
  width: DIELINE_W,
  height: DIELINE_H,
  boardThickness: 0.6,
  lidClosedAngle: 0,
  lidOpenAngle: -112,
  clamshell: {
    width: 115,
    depth: 105,
    height: 80,
    seamHeight: 40,
    baseFloorWidth: 101,
    baseFloorDepth: 91,
    lidTopWidth: 99,
    lidTopDepth: 89,
    panelChamfer: 5,
    rimChamfer: 3,
    rimDepth: 7,
    frontLipDrop: 7,
  },
  panels: [
    { id: "BASE", rect: { x: XM, y: yBase, w: W, h: D } },
    {
      id: "BASE_FRONT",
      rect: { x: XM, y: yBaseFront, w: W, h: H },
      parent: "BASE",
      angle: 80,
    },
    {
      id: "BASE_LEFT",
      rect: { x: X0, y: yBase, w: H, h: D },
      parent: "BASE",
      angle: 80,
    },
    {
      id: "BASE_RIGHT",
      rect: { x: XM + W, y: yBase, w: H, h: D },
      parent: "BASE",
      angle: 80,
    },
    {
      id: "BASE_BACK",
      rect: { x: XM, y: yBaseBack, w: W, h: H },
      parent: "BASE",
      angle: 80,
    },
    {
      id: "LID_BACK",
      rect: { x: XM, y: yLidBack, w: W, h: H },
      parent: "BASE_BACK",
      angle: 20,
      hinge: "lid",
    },
    {
      id: "LID_TOP",
      rect: { x: XM, y: yLidTop, w: W, h: D },
      parent: "LID_BACK",
      angle: 80,
    },
    {
      id: "LID_FRONT",
      rect: { x: XM, y: yLidFront, w: W, h: H },
      parent: "LID_TOP",
      angle: 80,
    },
    {
      id: "LID_LEFT",
      rect: { x: X0, y: yLidTop, w: H, h: D },
      parent: "LID_TOP",
      angle: 80,
    },
    {
      id: "LID_RIGHT",
      rect: { x: XM + W, y: yLidTop, w: H, h: D },
      parent: "LID_TOP",
      angle: 80,
    },
  ],
  dieline: {
    cuts: [
      path([0, 0, DIELINE_W, 0, DIELINE_W, DIELINE_H, 0, DIELINE_H], true),
      lidFrontCut,
      path([XM, yLidTop, XM + W, yLidTop, XM + W, yLidTop + D, XM, yLidTop + D], true),
      lidLeft,
      mirrorX(lidLeft),
      path([XM, yLidBack, XM + W, yLidBack, XM + W, yBase, XM, yBase], true),
      path([XM, yBase, XM + W, yBase, XM + W, yBase + D, XM, yBase + D], true),
      baseLeft,
      mirrorX(baseLeft),
      baseFrontCut,
      path([X0, yLidTop + 7, XM - 5, yLidTop + 18, XM, yLidTop + 31]),
      path([X0, yLidTop + D - 7, XM - 5, yLidTop + D - 18, XM, yLidTop + D - 31]),
      path([X0, yBase + 8, XM - 10, yBase + 19, XM, yBase + 31]),
      path([X0, yBase + D - 8, XM - 10, yBase + D - 19, XM, yBase + D - 31]),
    ],
    creases: [
      path([XM, yLidTop, XM + W, yLidTop]),
      path([XM, yLidBack, XM + W, yLidBack]),
      path([XM, yBaseBack, XM + W, yBaseBack]),
      path([XM, yBase, XM + W, yBase]),
      path([XM, yBaseFront, XM + W, yBaseFront]),
      path([XM, yLidTop, XM, yLidBack]),
      path([XM + W, yLidTop, XM + W, yLidBack]),
      path([XM, yBase, XM, yBaseFront]),
      path([XM + W, yBase, XM + W, yBaseFront]),
      path([XM, yBaseFront + H - 8, XM + W, yBaseFront + H - 8]),
      path([X0, yLidTop + 7, XM, yLidTop + 31]),
      path([X0, yLidTop + D - 7, XM, yLidTop + D - 31]),
      path([X0, yBase + 8, XM, yBase + 31]),
      path([X0, yBase + D - 8, XM, yBase + D - 31]),
    ],
  },
};

// Mirror the small left-side cut/crease details on the right without repeating
// a page of coordinates in the production spec.
for (const source of burgerBoxSpec.dieline!.cuts.slice(-4)) {
  burgerBoxSpec.dieline!.cuts.push(mirrorX(source));
}
for (const source of burgerBoxSpec.dieline!.creases.slice(-4)) {
  burgerBoxSpec.dieline!.creases.push(mirrorX(source));
}

export const CARTONS: Record<string, CartonSpec> = {
  [burgerBoxSpec.id]: burgerBoxSpec,
  [mailerBoxSpec.id]: mailerBoxSpec,
};

/** Resolve the immutable embedded structure first, then the legacy registry. */
export function resolveCartonSpec(config: ProductConfig): CartonSpec | null {
  if (config.family !== "folded-carton") return null;
  return config.cartonSpec ?? CARTONS[config.cartonSpecId ?? ""] ?? null;
}
