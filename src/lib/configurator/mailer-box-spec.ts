import type { CartonSpec, DielinePath, DielinePoint } from "@/types/carton";

/**
 * Premium e-commerce mailer box — FEFCO 0427-style roll-end tray with a
 * hinged, tuck-front lid. 240 × 160 × 60 mm.
 *
 * Dieline column, top to bottom:
 *
 *   lid tuck -> lid top -> back wall -> floor -> front wall -> front roll-over
 *
 * Lid side flaps hang off the lid top; the floor carries the two side walls,
 * each with a dust flap toward the back and the front. The outer silhouette is
 * authored as ONE continuous contour (rounded tuck corners, thumb notch,
 * tapered flaps), which also yields the production bleed line by numeric
 * offset — the same construction a packaging CAD tool performs.
 */

// Box dimensions (mm)
const W = 240;
const D = 160;
const H = 60;
const TUCK = 42;
const ROLL = 54;
const DUST = 38;

// Dieline layout (mm, y down)
const X0 = 8;                 // left margin to side-flap outer edge
const XM = X0 + H;            // centre column left edge
const XR = XM + W;            // centre column right edge
export const MAILER_DIELINE_W = XR + H + X0;
const yTuck = 8;
const yLidTop = yTuck + TUCK;       // 50
const yBack = yLidTop + D;          // 210
const yBase = yBack + H;            // 270
const yFront = yBase + D;           // 430
const yRoll = yFront + H;           // 490
export const MAILER_DIELINE_H = yRoll + ROLL + 8;

const CX = MAILER_DIELINE_W / 2;

// ---------------------------------------------------------------- helpers

const pt = (x: number, y: number): DielinePoint => ({ x, y });

/** Quarter/partial arc as polyline points, angles in degrees. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 10): DielinePoint[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return pt(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
}

const mirror = (points: DielinePoint[]): DielinePoint[] =>
  points.map(({ x, y }) => pt(2 * CX - x, y));

/**
 * The full outer silhouette, one closed contour. Authored as the LEFT half
 * from the top-centre thumb notch down to the bottom-centre, then mirrored.
 */
function outerContour(): DielinePoint[] {
  const left: DielinePoint[] = [
    // top edge, centre -> left (thumb notch handled at centre below)
    pt(CX - 11, yTuck),
    pt(XM + 16, yTuck),
    // tuck top-left rounded corner
    ...arc(XM + 16, yTuck + 16, 16, 270, 180),
    // tuck left edge down to the lid-top row
    pt(XM, yLidTop),
    // lid side flap: slight taper out, rounded outer corners
    pt(X0 + 10, yLidTop + 4),
    ...arc(X0 + 10, yLidTop + 14, 10, 270, 180),
    pt(X0, yBack - 12),
    ...arc(X0 + 10, yBack - 12, 10, 180, 90),
    pt(XM - 4, yBack - 2),
    pt(XM, yBack),
    // slit down the centre-column edge between lid flap and dust flap
    pt(XM, yBack + 22),
    // back dust flap (attached to the side wall's back edge)
    pt(X0 + 12, yBack + 23),
    ...arc(X0 + 12, yBack + 33, 10, 270, 180),
    pt(X0 + 2, yBase),
    // side wall outer edge
    pt(X0, yBase),
    pt(X0, yFront),
    // front dust flap
    pt(X0 + 2, yFront),
    ...arc(X0 + 12, yFront + DUST - 11, 10, 180, 90),
    pt(XM - 2, yFront + DUST),
    pt(XM, yFront + 22),
    pt(XM, yFront),
    // front wall + roll-over, rounded bottom corner
    pt(XM, yRoll),
    pt(XM, yRoll + ROLL - 12),
    ...arc(XM + 12, yRoll + ROLL - 12, 12, 180, 90),
    pt(CX, yRoll + ROLL),
  ];
  // left half runs top-centre -> left side -> bottom-centre; the mirrored,
  // reversed copy runs bottom-centre -> right side -> top-centre; the thumb
  // notch (half circle dipping into the tuck) closes the top edge.
  return [...left, ...mirror(left).reverse(), ...arc(CX, yTuck, 11, 0, 180)];
}

/** Approximate outward polygon offset (average vertex normals, miter). */
function offsetContour(points: DielinePoint[], distance: number): DielinePoint[] {
  const n = points.length;
  const out: DielinePoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const d1 = { x: cur.x - prev.x, y: cur.y - prev.y };
    const d2 = { x: next.x - cur.x, y: next.y - cur.y };
    const l1 = Math.hypot(d1.x, d1.y) || 1;
    const l2 = Math.hypot(d2.x, d2.y) || 1;
    // outward normal for a counter-clockwise contour in y-down space
    const n1 = { x: d1.y / l1, y: -d1.x / l1 };
    const n2 = { x: d2.y / l2, y: -d2.x / l2 };
    let nx = n1.x + n2.x;
    let ny = n1.y + n2.y;
    const ln = Math.hypot(nx, ny) || 1;
    nx /= ln;
    ny /= ln;
    out.push(pt(cur.x + nx * distance, cur.y + ny * distance));
  }
  return out;
}

const contour = outerContour();
// Determine winding so the offset goes outward, not inward.
const signedArea = contour.reduce((acc, p, i) => {
  const q = contour[(i + 1) % contour.length];
  return acc + (p.x * q.y - q.x * p.y);
}, 0);
const bleedContour = offsetContour(contour, signedArea > 0 ? 3 : -3);

const path = (points: DielinePoint[], closed = false): DielinePath => ({ points, closed });
const line = (x1: number, y1: number, x2: number, y2: number): DielinePath =>
  path([pt(x1, y1), pt(x2, y2)]);

// ------------------------------------------------------------------ spec

export const mailerBoxSpec: CartonSpec = {
  id: "mailer-box",
  name: "Mailer Box 240×160×60",
  width: MAILER_DIELINE_W,
  height: MAILER_DIELINE_H,
  boardThickness: 1.5,
  lidClosedAngle: 90,
  lidOpenAngle: -50,
  panels: [
    { id: "BASE", rect: { x: XM, y: yBase, w: W, h: D } },
    { id: "BACK", rect: { x: XM, y: yBack, w: W, h: H }, parent: "BASE", angle: 90 },
    { id: "LID_TOP", rect: { x: XM, y: yLidTop, w: W, h: D }, parent: "BACK", angle: 90, hinge: "lid" },
    { id: "LID_TUCK", rect: { x: XM, y: yTuck, w: W, h: TUCK }, parent: "LID_TOP", angle: 100 },
    { id: "LID_LEFT", rect: { x: X0, y: yLidTop, w: H, h: D }, parent: "LID_TOP", angle: 90 },
    { id: "LID_RIGHT", rect: { x: XR, y: yLidTop, w: H, h: D }, parent: "LID_TOP", angle: 90 },
    { id: "LEFT", rect: { x: X0, y: yBase, w: H, h: D }, parent: "BASE", angle: 90 },
    { id: "RIGHT", rect: { x: XR, y: yBase, w: H, h: D }, parent: "BASE", angle: 90 },
    { id: "DUST_BL", rect: { x: X0, y: yBack + 22, w: 0.01, h: 0.01 }, parent: "LEFT", angle: 55 },
    { id: "DUST_BR", rect: { x: XR, y: yBack + 22, w: 0.01, h: 0.01 }, parent: "RIGHT", angle: 55 },
    { id: "DUST_FL", rect: { x: X0, y: yFront, w: 0.01, h: 0.01 }, parent: "LEFT", angle: 55 },
    { id: "DUST_FR", rect: { x: XR, y: yFront, w: 0.01, h: 0.01 }, parent: "RIGHT", angle: 55 },
    { id: "FRONT", rect: { x: XM, y: yFront, w: W, h: H }, parent: "BASE", angle: 90 },
    { id: "FRONT_ROLL", rect: { x: XM, y: yRoll, w: 0.01, h: 0.01 }, parent: "FRONT", angle: 178 },
  ],
  dieline: {
    cuts: [path(contour, true)],
    creases: [
      line(XM, yLidTop, XR, yLidTop),          // tuck fold
      line(XM, yBack, XR, yBack),              // lid hinge
      line(XM, yBase, XR, yBase),              // back wall base
      line(XM, yFront, XR, yFront),            // front wall
      line(XM, yRoll, XR, yRoll),              // roll-over
      line(XM, yLidTop, XM, yBack),            // lid side flaps
      line(XR, yLidTop, XR, yBack),
      line(XM, yBase, XM, yFront),             // side walls
      line(XR, yBase, XR, yFront),
      line(X0, yBase, XM, yBase),              // dust flap folds
      line(XR, yBase, XR + H, yBase),
      line(X0, yFront, XM, yFront),
      line(XR, yFront, XR + H, yFront),
    ],
    bleed: [path(bleedContour, true)],
  },
};
