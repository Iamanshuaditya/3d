import type { CartonSpec, DielinePath, DielinePoint } from "@/types/carton";

/** Customer dimensions for the FEFCO 0427-style roll-end mailer structure. */
export type MailerBoxParameters = {
  /** Internal long side of the assembled tray. */
  lengthMm: number;
  /** Internal short side of the assembled tray. */
  widthMm: number;
  /** Assembled wall depth. */
  depthMm: number;
  boardThicknessMm: number;
  /** Manufacturing layout margin outside the structural blank. */
  layoutMarginMm?: number;
  id?: string;
};

const pt = (x: number, y: number): DielinePoint => ({ x, y });

/** Quarter/partial arc as deterministic polyline points, angles in degrees. */
function arc(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
  segments = 10,
): DielinePoint[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = ((start + ((end - start) * index) / segments) * Math.PI) / 180;
    return pt(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  });
}

/** Approximate outward polygon offset (average vertex normals, miter). */
function offsetContour(points: DielinePoint[], distance: number): DielinePoint[] {
  return points.map((current, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const incoming = { x: current.x - previous.x, y: current.y - previous.y };
    const outgoing = { x: next.x - current.x, y: next.y - current.y };
    const incomingLength = Math.hypot(incoming.x, incoming.y) || 1;
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y) || 1;
    const incomingNormal = {
      x: incoming.y / incomingLength,
      y: -incoming.x / incomingLength,
    };
    const outgoingNormal = {
      x: outgoing.y / outgoingLength,
      y: -outgoing.x / outgoingLength,
    };
    let normalX = incomingNormal.x + outgoingNormal.x;
    let normalY = incomingNormal.y + outgoingNormal.y;
    const normalLength = Math.hypot(normalX, normalY) || 1;
    normalX /= normalLength;
    normalY /= normalLength;
    return pt(current.x + normalX * distance, current.y + normalY * distance);
  });
}

function finitePositive(label: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Mailer ${label} must be a finite positive millimetre value.`);
  }
}

/**
 * Generates one authoritative packaging structure. Its panel tree, physical
 * blank, cuts, creases, UVs, assembled mesh and unfold plan all share these
 * exact values; consumers must not recalculate a second version.
 */
export function createMailerBoxSpec(parameters: MailerBoxParameters): CartonSpec {
  const {
    lengthMm: length,
    widthMm: width,
    depthMm: depth,
    boardThicknessMm: boardThickness,
    layoutMarginMm: margin = 8,
  } = parameters;
  finitePositive("length", length);
  finitePositive("width", width);
  finitePositive("depth", depth);
  finitePositive("board thickness", boardThickness);
  finitePositive("layout margin", margin);
  if (boardThickness >= depth / 3) {
    throw new Error("Mailer board thickness is incompatible with the selected depth.");
  }

  // Construction details scale with wall depth. At the legacy/default 60 mm
  // depth these evaluate to the proven authored values.
  const scale = depth / 60;
  const detail = (legacyMillimetres: number) => legacyMillimetres * scale;
  const tuck = detail(42);
  const roll = detail(54);
  const dust = detail(38);
  const left = margin;
  const centreLeft = left + depth;
  const centreRight = centreLeft + length;
  const dielineWidth = centreRight + depth + margin;
  const yTuck = margin;
  const yLidTop = yTuck + tuck;
  const yBack = yLidTop + width;
  const yBase = yBack + depth;
  const yFront = yBase + width;
  const yRoll = yFront + depth;
  const dielineHeight = yRoll + roll + margin;
  const centreX = dielineWidth / 2;
  const mirror = (points: DielinePoint[]) =>
    points.map(({ x, y }) => pt(2 * centreX - x, y));

  const outerLeft: DielinePoint[] = [
    pt(centreX - detail(11), yTuck),
    pt(centreLeft + detail(16), yTuck),
    ...arc(
      centreLeft + detail(16),
      yTuck + detail(16),
      detail(16),
      270,
      180,
    ),
    pt(centreLeft, yLidTop),
    pt(left + detail(10), yLidTop + detail(4)),
    ...arc(left + detail(10), yLidTop + detail(14), detail(10), 270, 180),
    pt(left, yBack - detail(12)),
    ...arc(left + detail(10), yBack - detail(12), detail(10), 180, 90),
    pt(centreLeft - detail(4), yBack - detail(2)),
    pt(centreLeft, yBack),
    pt(centreLeft, yBack + detail(22)),
    pt(left + detail(12), yBack + detail(23)),
    ...arc(left + detail(12), yBack + detail(33), detail(10), 270, 180),
    pt(left + detail(2), yBase),
    pt(left, yBase),
    pt(left, yFront),
    pt(left + detail(2), yFront),
    ...arc(
      left + detail(12),
      yFront + dust - detail(11),
      detail(10),
      180,
      90,
    ),
    pt(centreLeft - detail(2), yFront + dust),
    pt(centreLeft, yFront + detail(22)),
    pt(centreLeft, yFront),
    pt(centreLeft, yRoll),
    pt(centreLeft, yRoll + roll - detail(12)),
    ...arc(
      centreLeft + detail(12),
      yRoll + roll - detail(12),
      detail(12),
      180,
      90,
    ),
    pt(centreX, yRoll + roll),
  ];
  const contour = [
    ...outerLeft,
    ...mirror(outerLeft).reverse(),
    ...arc(centreX, yTuck, detail(11), 0, 180),
  ];
  const signedArea = contour.reduce((total, point, index) => {
    const next = contour[(index + 1) % contour.length];
    return total + point.x * next.y - next.x * point.y;
  }, 0);
  const bleedContour = offsetContour(contour, signedArea > 0 ? 3 : -3);
  const path = (points: DielinePoint[], closed = false): DielinePath => ({
    points,
    closed,
  });
  const line = (x1: number, y1: number, x2: number, y2: number): DielinePath =>
    path([pt(x1, y1), pt(x2, y2)]);

  return {
    id: parameters.id ??
      `mailer-box-0427-${length}x${width}x${depth}-bt${boardThickness}`,
    name: `Mailer Box ${length}×${width}×${depth} mm`,
    width: dielineWidth,
    height: dielineHeight,
    boardThickness,
    lidClosedAngle: 90,
    lidOpenAngle: -50,
    panels: [
      { id: "BASE", rect: { x: centreLeft, y: yBase, w: length, h: width } },
      { id: "BACK", rect: { x: centreLeft, y: yBack, w: length, h: depth }, parent: "BASE", angle: 90 },
      { id: "LID_TOP", rect: { x: centreLeft, y: yLidTop, w: length, h: width }, parent: "BACK", angle: 90, hinge: "lid" },
      { id: "LID_TUCK", rect: { x: centreLeft, y: yTuck, w: length, h: tuck }, parent: "LID_TOP", angle: 100 },
      { id: "LID_LEFT", rect: { x: left, y: yLidTop, w: depth, h: width }, parent: "LID_TOP", angle: 90 },
      { id: "LID_RIGHT", rect: { x: centreRight, y: yLidTop, w: depth, h: width }, parent: "LID_TOP", angle: 90 },
      { id: "LEFT", rect: { x: left, y: yBase, w: depth, h: width }, parent: "BASE", angle: 90 },
      { id: "RIGHT", rect: { x: centreRight, y: yBase, w: depth, h: width }, parent: "BASE", angle: 90 },
      { id: "DUST_BL", rect: { x: left, y: yBase - dust, w: depth, h: dust }, parent: "LEFT", angle: 95 },
      { id: "DUST_BR", rect: { x: centreRight, y: yBase - dust, w: depth, h: dust }, parent: "RIGHT", angle: 95 },
      { id: "DUST_FL", rect: { x: left, y: yFront, w: depth, h: dust }, parent: "LEFT", angle: 95 },
      { id: "DUST_FR", rect: { x: centreRight, y: yFront, w: depth, h: dust }, parent: "RIGHT", angle: 95 },
      { id: "FRONT", rect: { x: centreLeft, y: yFront, w: length, h: depth }, parent: "BASE", angle: 90 },
      { id: "FRONT_ROLL", rect: { x: centreLeft, y: yRoll, w: length, h: roll }, parent: "FRONT", angle: 178 },
    ],
    unfold: {
      mode: "hinge-graph",
      steps: [
        { id: "open", label: "Open the lid", reverseLabel: "Close the lid", hingeIds: ["LID_TOP"], to: "open" },
        { id: "tuck", label: "Release the tuck flap", hingeIds: ["LID_TUCK"], to: "flat" },
        { id: "lid-flaps", label: "Unfold the lid side flaps", hingeIds: ["LID_LEFT", "LID_RIGHT"], to: "flat" },
        { id: "lid", label: "Lay the lid flat", hingeIds: ["LID_TOP"], to: "flat" },
        { id: "dust", label: "Unfold the dust flaps", hingeIds: ["DUST_BL", "DUST_BR", "DUST_FL", "DUST_FR", "FRONT_ROLL"], to: "flat" },
        { id: "walls", label: "Lay the walls flat", hingeIds: ["BACK", "FRONT", "LEFT", "RIGHT"], to: "flat" },
      ],
    },
    dieline: {
      cuts: [path(contour, true)],
      creases: [
        line(centreLeft, yLidTop, centreRight, yLidTop),
        line(centreLeft, yBack, centreRight, yBack),
        line(centreLeft, yBase, centreRight, yBase),
        line(centreLeft, yFront, centreRight, yFront),
        line(centreLeft, yRoll, centreRight, yRoll),
        line(centreLeft, yLidTop, centreLeft, yBack),
        line(centreRight, yLidTop, centreRight, yBack),
        line(centreLeft, yBase, centreLeft, yFront),
        line(centreRight, yBase, centreRight, yFront),
        line(left, yBase, centreLeft, yBase),
        line(centreRight, yBase, centreRight + depth, yBase),
        line(left, yFront, centreLeft, yFront),
        line(centreRight, yFront, centreRight + depth, yFront),
      ],
      bleed: [path(bleedContour, true)],
    },
  };
}

/** Legacy fixed structure. Keep this id and exact 8 mm layout for old versions. */
export const mailerBoxSpec = createMailerBoxSpec({
  id: "mailer-box",
  lengthMm: 240,
  widthMm: 160,
  depthMm: 60,
  boardThicknessMm: 1.5,
  layoutMarginMm: 8,
});

export const MAILER_DIELINE_W = mailerBoxSpec.width;
export const MAILER_DIELINE_H = mailerBoxSpec.height;
