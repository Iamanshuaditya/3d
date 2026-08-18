import * as THREE from "three";
import type { PouchSpec, ProfilePoint } from "@/types/pouch";

export const POUCH_MM = 0.01;

type DielinePath = { points: number[]; closed: boolean };

export type PouchDieline = {
  cuts: DielinePath[];
  creases: DielinePath[];
  safety: DielinePath[];
};

/** Smooth, cosine-eased lookup along a measured vertical profile. */
function sampleProfile(points: ProfilePoint[], t: number): number {
  if (t <= points[0].t) return points[0].v;
  const last = points[points.length - 1];
  if (t >= last.t) return last.v;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (t < a.t || t > b.t) continue;
    const k = (t - a.t) / (b.t - a.t);
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * k);
    return a.v + (b.v - a.v) * eased;
  }
  return last.v;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Reproducible, low-frequency laminate noise. */
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The bottom edge dips at centre and lifts gently toward the sealed corners. */
function bottomEdgeY(s: number): number {
  const sideLift = 3.15 * Math.pow(Math.abs(s), 1.7);
  const softWave = 0.28 * Math.sin((s + 0.14) * Math.PI * 3) * (1 - Math.abs(s));
  return Math.max(0, sideLift + softWave);
}

/**
 * Designed relief rather than random displacement: two long gusset pulls,
 * small lower puckers, a crisp top-seal groove and restrained film crinkle.
 */
function faceRelief(spec: PouchSpec, s: number, t: number, front: boolean): number {
  const absS = Math.abs(s);
  const faceMask = Math.pow(Math.max(0, 1 - s * s), 0.32);
  const lowerFade = Math.pow(Math.max(0, 1 - t / 0.52), 1.65);
  const phase = front ? 0 : 23.7;

  const leftPull = -spec.creaseDepth
    * Math.exp(-Math.pow((s - (-0.73 + t * 0.28)) / 0.052, 2))
    * lowerFade;
  const leftShoulder = spec.creaseDepth * 0.48
    * Math.exp(-Math.pow((s - (-0.63 + t * 0.22)) / 0.075, 2))
    * lowerFade;
  const rightPull = -spec.creaseDepth * 0.92
    * Math.exp(-Math.pow((s - (0.7 - t * 0.2)) / 0.056, 2))
    * lowerFade;
  const rightShoulder = spec.creaseDepth * 0.42
    * Math.exp(-Math.pow((s - (0.59 - t * 0.15)) / 0.08, 2))
    * lowerFade;

  const bottomPucker = spec.creaseDepth * 0.42
    * Math.sin(s * 17 + phase * 0.08)
    * Math.exp(-t / 0.09)
    * Math.pow(Math.max(0, 1 - absS), 0.7);

  const n1 = valueNoise(s * 4.1 + phase, t * 10.5);
  const n2 = valueNoise(s * 9.2 + phase, t * 24.0);
  const centreQuiet = 0.38 + 0.62 * smoothstep(0.16, 0.9, absS);
  const crinkle = (n1 * 0.7 + n2 * 0.3)
    * spec.crinkleDepth
    * centreQuiet
    * (1 - smoothstep(0.86, 0.98, t));

  const sealT = 1 - spec.topSealHeight / spec.height;
  const sealGroove = -0.52
    * Math.exp(-Math.pow((t - sealT) / 0.0065, 2))
    * (0.7 + 0.3 * (1 - absS));

  const edgePinch = -0.72 * Math.pow(smoothstep(0.84, 1, absS), 2);
  const zipper = spec.resealableZip
    ? 0.46 * Math.exp(-Math.pow((t - (1 - spec.zipperOffset / spec.height)) / 0.009, 2))
    : 0;

  return (leftPull + leftShoulder + rightPull + rightShoulder + bottomPucker + crinkle
    + sealGroove + edgePinch + zipper) * faceMask;
}

export type PouchMesh = {
  geometry: THREE.BufferGeometry;
  size: { width: number; height: number; depth: number };
};

/**
 * Builds distinct front, back, fin, top-seal and bottom-gusset surfaces into a
 * single indexed geometry. Vertices are deliberately split at production
 * seams so the normal changes remain crisp and the gusset cannot shade like a
 * texture-less triangle cap.
 */
export function buildPouchGeometry(spec: PouchSpec): PouchMesh {
  if (spec.style && spec.style !== "stand_up") {
    return buildStyledPouch(spec);
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const nx = spec.segmentsAcross;
  const ny = spec.segmentsUp;
  const ng = spec.segmentsGusset;
  const totalWeb = spec.height * 2 + spec.gusset + spec.dielineBleed * 2;

  const pushVertex = (x: number, y: number, z: number, u: number, v: number) => {
    positions.push(x, y, z);
    uvs.push(u, v);
  };

  const panelU = (t: number, front: boolean) => {
    if (front) {
      return (spec.dielineBleed + spec.height + spec.gusset + t * spec.height) / totalWeb;
    }
    return (spec.dielineBleed + (1 - t) * spec.height) / totalWeb;
  };

  // Printed front and back panels.
  for (const front of [true, false]) {
    const start = positions.length / 3;
    const sign = front ? 1 : -1;
    for (let j = 0; j <= ny; j++) {
      const t = j / ny;
      const a = sampleProfile(spec.halfWidth, t);
      const b = sampleProfile(spec.halfDepth, t);
      for (let i = 0; i <= nx; i++) {
        const s = (i / nx) * 2 - 1;
        const shape = Math.pow(Math.max(0, 1 - s * s), spec.cuspExponent);
        const edgeY = bottomEdgeY(s);
        const y = edgeY + (spec.height - edgeY) * t;
        const depth = Math.max(0, b * shape + faceRelief(spec, s, t, front));
        pushVertex(a * s, y, sign * depth, panelU(t, front), 1 - (s + 1) / 2);
      }
    }

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const p0 = start + j * (nx + 1) + i;
        const p1 = p0 + 1;
        const p2 = p0 + nx + 1;
        const p3 = p2 + 1;
        if (front) indices.push(p0, p1, p2, p1, p3, p2);
        else indices.push(p0, p2, p1, p1, p2, p3);
      }
    }
  }

  // Double-layer heat-sealed side fins. Pulling the outer edge inward at the
  // seal boundary creates the real V tear notch in silhouette, not a decal.
  const notchT = 1 - spec.notchOffset / spec.height;
  const notchHalfT = spec.notchSize / spec.height / 2;
  const filmLayer = 0.045;
  for (const side of [-1, 1] as const) {
    for (const frontLayer of [true, false]) {
      const start = positions.length / 3;
      for (let j = 0; j <= ny; j++) {
        const t = j / ny;
        const a = sampleProfile(spec.halfWidth, t);
        const edgeY = bottomEdgeY(side);
        const y = edgeY + (spec.height - edgeY) * t;
        const notch = Math.max(0, 1 - Math.abs(t - notchT) / notchHalfT);
        const baseTuck = smoothstep(0, 0.045, t);
        const innerX = side * a;
        const outerWidth = a + spec.sealFin * baseTuck - spec.notchSize * notch;
        const outerX = side * Math.max(a, outerWidth);
        const z = frontLayer ? filmLayer : -filmLayer;
        const edgeV = side < 0 ? 1 : 0;
        const insetV = side < 0 ? 0.985 : 0.015;
        const u = panelU(t, frontLayer);
        pushVertex(innerX, y, z, u, insetV);
        pushVertex(outerX, y, z, u, edgeV);
      }
      for (let j = 0; j < ny; j++) {
        const p0 = start + j * 2;
        const p1 = p0 + 1;
        const p2 = p0 + 2;
        const p3 = p0 + 3;
        if (frontLayer) indices.push(p0, p1, p2, p1, p3, p2);
        else indices.push(p0, p2, p1, p1, p2, p3);
      }
    }
  }

  // Open bottom gusset. This is a curved membrane with a raised inner fold,
  // not a fan to one centre vertex; it stays convincing from below and side-on.
  const gussetStart = positions.length / 3;
  const baseHalfWidth = sampleProfile(spec.halfWidth, 0);
  const baseHalfDepth = sampleProfile(spec.halfDepth, 0);
  for (let k = 0; k <= ng; k++) {
    const q = (k / ng) * 2 - 1;
    for (let i = 0; i <= nx; i++) {
      const s = (i / nx) * 2 - 1;
      const shape = Math.pow(Math.max(0, 1 - s * s), spec.cuspExponent);
      const membrane = (1 - q * q)
        * Math.pow(Math.max(0, 1 - s * s), 0.72)
        * (3.7 + 0.34 * Math.cos(s * Math.PI * 4));
      const rings = 0.28
        * Math.sin((1 - Math.hypot(s * 0.72, q)) * Math.PI * 8)
        * (1 - q * q)
        * Math.max(0, 1 - Math.abs(s));
      const y = bottomEdgeY(s) + membrane + rings;
      const u = (spec.dielineBleed + spec.height + ((q + 1) / 2) * spec.gusset) / totalWeb;
      pushVertex(baseHalfWidth * s, y, q * baseHalfDepth * shape, u, 1 - (s + 1) / 2);
    }
  }
  for (let k = 0; k < ng; k++) {
    for (let i = 0; i < nx; i++) {
      const p0 = gussetStart + k * (nx + 1) + i;
      const p1 = p0 + 1;
      const p2 = p0 + nx + 1;
      const p3 = p2 + 1;
      indices.push(p0, p1, p2, p1, p3, p2);
    }
  }

  // Thin sealed top edge. It closes the front/back layers without adding a
  // rigid rim, while the separate vertices keep a sharp heat-seal highlight.
  const topStart = positions.length / 3;
  const topHalfWidth = sampleProfile(spec.halfWidth, 1);
  const topHalfDepth = sampleProfile(spec.halfDepth, 1);
  for (let k = 0; k <= 2; k++) {
    const q = k - 1;
    for (let i = 0; i <= nx; i++) {
      const s = (i / nx) * 2 - 1;
      const shape = Math.pow(Math.max(0, 1 - s * s), spec.cuspExponent);
      const u = q <= 0
        ? spec.dielineBleed / totalWeb
        : (totalWeb - spec.dielineBleed) / totalWeb;
      pushVertex(topHalfWidth * s, spec.height, q * topHalfDepth * shape, u, 1 - (s + 1) / 2);
    }
  }
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < nx; i++) {
      const p0 = topStart + k * (nx + 1) + i;
      const p1 = p0 + 1;
      const p2 = p0 + nx + 1;
      const p3 = p2 + 1;
      indices.push(p0, p2, p1, p1, p2, p3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.scale(POUCH_MM, POUCH_MM, POUCH_MM);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const maxDepth = Math.max(...spec.halfDepth.map((point) => point.v));
  return {
    geometry,
    size: {
      width: spec.width * POUCH_MM,
      height: spec.height * POUCH_MM,
      depth: maxDepth * 2 * POUCH_MM,
    },
  };
}


// ---------------------------------------------------------------------------
// Styled parametric pouches (three_side_seal / center_seal / flat_bottom /
// side_gusset). One builder covers all four archetypes; each style differs in
// depth envelope, which fins exist, and its upright print-web layout.
// ---------------------------------------------------------------------------

type WebColumn = { id: string; x0: number; w: number; mirrored?: boolean };

/** Upright print-web layout per style, in millimetres. */
export function styledWebLayout(spec: PouchSpec) {
  const W = spec.width;
  const D = spec.depth ?? spec.gusset;
  const b = spec.dielineBleed;
  const style = spec.style ?? "stand_up";
  const columns: WebColumn[] = [];
  let webW: number;
  let webH = spec.height;
  let bottomPatch: { x0: number; y0: number; w: number; h: number } | null = null;
  if (style === "three_side_seal" || style === "center_seal") {
    webW = 2 * b + 2 * W;
    columns.push({ id: "front", x0: b, w: W });
    columns.push({ id: "back", x0: b + W, w: W, mirrored: true });
  } else {
    // flat_bottom / side_gusset wrap: front | right | back | left
    webW = 2 * b + 2 * W + 2 * D;
    columns.push({ id: "front", x0: b, w: W });
    columns.push({ id: "right", x0: b + W, w: D });
    columns.push({ id: "back", x0: b + W + D, w: W, mirrored: true });
    columns.push({ id: "left", x0: b + W + 2 * D, w: D });
    if (style === "flat_bottom") {
      bottomPatch = { x0: b, y0: spec.height, w: W, h: D };
      webH = spec.height + D;
    }
  }
  return { webW, webH, columns, D, style };
}

function styledRelief(spec: PouchSpec, s: number, t: number, front: boolean): number {
  const n1 = valueNoise(s * 5.1 + (front ? 0 : 31.7), t * 6.3);
  const n2 = valueNoise(s * 11.7 + (front ? 13.1 : 47.9), t * 13.9);
  const billow = 0.9 * spec.crinkleDepth
    * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * (0.35 + 0.65 * (1 - s * s))
    * valueNoise(s * 1.6 + (front ? 3.1 : 17.3), t * 2.1);
  const crinkle = (n1 * 0.7 + n2 * 0.3) * spec.crinkleDepth
    * smoothstep(0, 0.1, t) * smoothstep(1, 0.9, t) + billow;
  const sealGroove = -spec.creaseDepth
    * Math.exp(-Math.pow((1 - t) * spec.height - spec.topSealHeight, 2) / 6);
  const zipT = 1 - spec.zipperOffset / spec.height;
  const zipper = spec.resealableZip
    ? 1.15 * Math.exp(-Math.pow((t - zipT) * spec.height, 2) / 3.2)
    : 0;
  return crinkle + sealGroove + zipper;
}

export function buildStyledPouch(spec: PouchSpec): PouchMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const nx = spec.segmentsAcross;
  const ny = spec.segmentsUp;
  const W = spec.width;
  const H = spec.height;
  const layout = styledWebLayout(spec);
  const { webW, webH, columns, D, style } = layout;
  const col = (id: string) => columns.find((c) => c.id === id)!;

  const pushVertex = (x: number, y: number, z: number, u: number, v: number) => {
    positions.push(x, y, z);
    uvs.push(u, v);
  };
  const quad = (p0: number, p1: number, p2: number, p3: number, flip: boolean) => {
    if (flip) indices.push(p0, p2, p1, p1, p2, p3);
    else indices.push(p0, p1, p2, p1, p3, p2);
  };
  const gridIndices = (start: number, cols: number, rows: number, flip: boolean) => {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const p0 = start + j * (cols + 1) + i;
        quad(p0, p0 + 1, p0 + cols + 1, p0 + cols + 2, flip);
      }
    }
  };
  const colU = (c: WebColumn, f: number) =>
    (c.x0 + (c.mirrored ? 1 - f : f) * c.w) / webW;
  const vOf = (yMm: number) => 1 - yMm / webH;

  // Depth envelope along height. Pillows swell mid-height and pinch at both
  // sealed ends; boxes hold full depth (side_gusset pinches top and bottom).
  const isPillow = style === "three_side_seal" || style === "center_seal";
  const envelope = (t: number): number => {
    if (isPillow) return Math.pow(Math.sin(Math.PI * t), 0.72);
    if (style === "side_gusset") {
      return Math.min(1, smoothstep(0, 0.14, t) * 2, smoothstep(1, 0.86, t) * 2);
    }
    // flat_bottom: a filled brick holds full depth all the way to the top
    // seal; the cap and top fin close it.
    return 1;
  };
  const cusp = isPillow ? 1.45 : 6;
  const halfDepthAt = (t: number) => (D / 2) * envelope(t);

  // ---- front / back faces
  for (const front of [true, false]) {
    const start = positions.length / 3;
    const sign = front ? 1 : -1;
    const c = col(front ? "front" : "back");
    for (let j = 0; j <= ny; j++) {
      const t = j / ny;
      for (let i = 0; i <= nx; i++) {
        const s = (i / nx) * 2 - 1;
        const shape = Math.pow(Math.max(0.0001, 1 - s * s), 1 / cusp);
        const seam = style === "center_seal" && !front
          ? 1.4 * Math.exp(-Math.pow(s * W * 0.5, 2) / 14)
          : 0;
        const depth = Math.max(
          0,
          halfDepthAt(t) * shape + styledRelief(spec, s, t, front) + seam,
        );
        pushVertex((s * W) / 2, t * H, sign * depth, colU(c, (s + 1) / 2), vOf((1 - t) * H));
      }
    }
    gridIndices(start, nx, ny, !front);
  }

  // ---- box side walls (flat_bottom / side_gusset)
  if (!isPillow) {
    for (const sideId of ["right", "left"] as const) {
      const sideSign = sideId === "right" ? 1 : -1;
      const c = col(sideId);
      const start = positions.length / 3;
      for (let j = 0; j <= ny; j++) {
        const t = j / ny;
        const hd = halfDepthAt(t);
        for (let k = 0; k <= 16; k++) {
          const q = (k / 16) * 2 - 1; // across the wall, -1 back .. +1 front
          // side-gusset pleat: a soft V fold running down the wall centre
          const pleat = style === "side_gusset"
            ? 2.6 * (1 - Math.abs(q)) * envelope(t)
            : 0.6 * (1 - q * q); // flat-bottom: slight outward camber
          pushVertex(
            sideSign * (W / 2 - pleat + styledRelief(spec, q, t, sideSign > 0) * 0.4),
            t * H,
            q * hd,
            colU(c, sideSign > 0 ? (q + 1) / 2 : 1 - (q + 1) / 2),
            vOf((1 - t) * H),
          );
        }
      }
      gridIndices(start, 16, ny, sideSign < 0);
    }
  }

  // ---- flat_bottom base + top cap
  if (style === "flat_bottom") {
    const patch = { x0: spec.dielineBleed, y0: H + 6, w: W, h: D };
    const start = positions.length / 3;
    for (let k = 0; k <= 8; k++) {
      const q = (k / 8) * 2 - 1;
      for (let i = 0; i <= nx; i++) {
        const s = (i / nx) * 2 - 1;
        pushVertex(
          (s * W) / 2,
          0,
          (q * D) / 2,
          (patch.x0 + ((s + 1) / 2) * patch.w) / webW,
          vOf(webH - patch.y0 - ((q + 1) / 2) * patch.h),
        );
      }
    }
    gridIndices(start, nx, 8, true);
    const capStart = positions.length / 3;
    const capC = col("back");
    for (let k = 0; k <= 4; k++) {
      const q = (k / 4) * 2 - 1;
      for (let i = 0; i <= nx; i++) {
        const s = (i / nx) * 2 - 1;
        const shape = Math.pow(Math.max(0.0001, 1 - s * s), 1 / cusp);
        pushVertex((s * W) / 2, H, q * halfDepthAt(0.5) * shape, colU(capC, (s + 1) / 2), vOf(H));
      }
    }
    gridIndices(capStart, nx, 4, true);
  }

  // ---- sealed fins
  const filmLayer = 0.05;
  const finW = spec.sealFin * 2.2;
  const addVerticalFins = isPillow; // pillow side seals; boxes have folded corners
  if (addVerticalFins) {
    const notchT = 1 - spec.notchOffset / spec.height;
    const notchHalfT = spec.notchSize / spec.height / 2;
    for (const side of [-1, 1] as const) {
      for (const frontLayer of [true, false]) {
        const start = positions.length / 3;
        const c = col(frontLayer ? "front" : "back");
        for (let j = 0; j <= ny; j++) {
          const t = j / ny;
          const notch = Math.max(0, 1 - Math.abs(t - notchT) / notchHalfT);
          const inner = (W / 2);
          const outer = inner + finW - spec.notchSize * notch;
          const z = frontLayer ? filmLayer : -filmLayer;
          const uEdge = colU(c, side < 0 ? 0 : 1);
          pushVertex(side * inner, t * H, z, uEdge, vOf((1 - t) * H));
          pushVertex(side * Math.max(inner, outer), t * H, z, uEdge, vOf((1 - t) * H));
        }
        for (let j = 0; j < ny; j++) {
          const p0 = start + j * 2;
          quad(p0, p0 + 1, p0 + 2, p0 + 3, !frontLayer);
        }
      }
    }
  }
  // horizontal end fins: top always; bottom for pillows and side_gusset
  const horizontalFins: number[] = [1];
  if (isPillow || style === "side_gusset") horizontalFins.push(0);
  for (const end of horizontalFins) {
    for (const frontLayer of [true, false]) {
      const start = positions.length / 3;
      const c = col(frontLayer ? "front" : "back");
      const yBase = end * H;
      const dir = end === 1 ? 1 : -1;
      for (let i = 0; i <= nx; i++) {
        const s = (i / nx) * 2 - 1;
        const z = frontLayer ? filmLayer : -filmLayer;
        const u = colU(c, (s + 1) / 2);
        pushVertex((s * W) / 2, yBase, z, u, vOf((1 - end) * H));
        pushVertex((s * W) / 2, yBase + dir * finW, z, u, vOf((1 - end) * H));
      }
      for (let i = 0; i < nx; i++) {
        const p0 = start + i * 2;
        quad(p0, p0 + 1, p0 + 2, p0 + 3, frontLayer === (end === 1));
      }
    }
  }
  // centre-seal back fin: a doubled strip standing off the back centre line
  if (style === "center_seal") {
    const c = col("back");
    for (const layer of [-1, 1] as const) {
      const start = positions.length / 3;
      for (let j = 0; j <= ny; j++) {
        const t = j / ny;
        // Root the fin INSIDE the seam bump so it reads as a welded seam,
        // and keep its protrusion modest and confined to the sealed span.
        const seam = 1.4 * Math.exp(0);
        const zRoot = -(halfDepthAt(t) + seam - 0.6);
        const span = smoothstep(0.02, 0.1, t) * smoothstep(0.98, 0.9, t);
        const u = colU(c, 0.5);
        pushVertex(layer * filmLayer, t * H, zRoot, u, vOf((1 - t) * H));
        pushVertex(layer * filmLayer, t * H, zRoot - (finW * 0.4 + 0.5) * span, u, vOf((1 - t) * H));
      }
      for (let j = 0; j < ny; j++) {
        const p0 = start + j * 2;
        quad(p0, p0 + 1, p0 + 2, p0 + 3, layer > 0);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.scale(POUCH_MM, POUCH_MM, POUCH_MM);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    size: { width: W * POUCH_MM, height: H * POUCH_MM, depth: (spec.depth ?? spec.gusset) * POUCH_MM },
  };
}

/** Production dieline for styled pouches: column cuts, seal/zipper creases, bleed. */
export function styledPouchDieline(
  spec: PouchSpec,
  canvasWidth: number,
  canvasHeight: number,
): PouchDieline {
  const layout = styledWebLayout(spec);
  const { webW, webH, columns, style } = layout;
  const b = spec.dielineBleed;
  const margin = b + 2; // canvas border around the trim line
  const sx = canvasWidth / (webW + 2 * margin);
  const sy = canvasHeight / (webH + 2 * margin);
  const X = (mm: number) => (mm + margin) * sx;
  const Y = (mm: number) => (mm + margin) * sy;
  const cuts: DielinePath[] = [];
  const creases: DielinePath[] = [];
  const safety: DielinePath[] = [];
  const poly = (pts: Array<[number, number]>, into: DielinePath[], closed = true) =>
    into.push({ points: pts.flatMap(([x, y]) => [X(x), Y(y)]), closed });
  const hline = (x0: number, x1: number, y: number) =>
    creases.push({ points: [X(x0), Y(y), X(x1), Y(y)], closed: false });
  const vline = (x: number, y0: number, y1: number) =>
    creases.push({ points: [X(x), Y(y0), X(x), Y(y1)], closed: false });

  const first = columns[0];
  const last = columns[columns.length - 1];
  const x0 = first.x0;
  const x1 = last.x0 + last.w;
  const H = spec.height;

  // Trim silhouette (blue) and its bleed offset (green). The flat-bottom
  // base patch is an attached tab, so both lines flow around it as one
  // production contour — the same construction a packaging CAD tool draws.
  const silhouette = (off: number): Array<[number, number]> => {
    if (style === "flat_bottom") {
      const patch = { x0: first.x0, w: first.w, h: layout.D };
      return [
        [x0 - off, 0 - off], [x1 + off, 0 - off], [x1 + off, H + off],
        [patch.x0 + patch.w + off, H + off],
        [patch.x0 + patch.w + off, H + patch.h + off],
        [patch.x0 - off, H + patch.h + off],
        [patch.x0 - off, H + off],
        [x0 - off, H + off],
      ];
    }
    return [[x0 - off, -off], [x1 + off, -off], [x1 + off, H + off], [x0 - off, H + off]];
  };
  poly(silhouette(0), cuts);
  poly(silhouette(b), safety);

  // Column fold creases + per-panel inset seal guides (red)
  const inset = 6;
  for (const c of columns.slice(1)) vline(c.x0, 0, H);
  for (const c of columns) {
    poly(
      [
        [c.x0 + inset, inset], [c.x0 + c.w - inset, inset],
        [c.x0 + c.w - inset, H - inset], [c.x0 + inset, H - inset],
      ],
      creases,
    );
  }

  // Horizontal seal bands
  hline(x0, x1, spec.topSealHeight);
  if (style !== "flat_bottom") hline(x0, x1, H - spec.topSealHeight);

  // Zipper: tight triple band across the printable face columns only
  if (spec.resealableZip) {
    const zipCols = columns.filter((c) => c.id === "front" || c.id === "back");
    for (const c of zipCols) {
      for (const off of [-2.2, 0, 2.2]) {
        creases.push({
          points: [X(c.x0), Y(spec.zipperOffset + off), X(c.x0 + c.w), Y(spec.zipperOffset + off)],
          closed: false,
        });
      }
    }
  }

  // flat-bottom patch fold line where the tab meets the web
  if (style === "flat_bottom") {
    hline(first.x0, first.x0 + first.w, H);
  }
  return { cuts, creases, safety };
}

/** 2D production guides generated from the same millimetre measurements. */
export function pouchDielineOverlay(
  spec: PouchSpec,
  canvasWidth: number,
  canvasHeight: number,
): PouchDieline {
  if (spec.style && spec.style !== "stand_up") {
    return styledPouchDieline(spec, canvasWidth, canvasHeight);
  }
  const totalWeb = spec.height * 2 + spec.gusset + spec.dielineBleed * 2;
  const x = (mm: number) => (mm / totalWeb) * canvasWidth;
  const y = (mm: number) => (mm / spec.width) * canvasHeight;

  // Exact masks and guides returned by Calcifer for PRD-CNJNMBZX9 v15,
  // 3.25 x 4.75 x 2 in. Keeping these measured coordinates avoids the small
  // drift that appears when production notches and safe areas are inferred
  // from generic pouch ratios.
  if (spec.id === "pouch-3.25x4.75x2") {
    const path = (pointsMm: number[], closed = false): DielinePath => ({
      points: pointsMm.map((value, index) => index % 2 === 0 ? x(value) : y(value)),
      closed,
    });
    const verticalExact = (mm: number): DielinePath =>
      path([mm, 0, mm, 82.55]);

    return {
      cuts: [
        path([0, 0, 296.098, 0, 296.098, 82.55, 0, 82.55], true),
        path([16.862, 0, 16.862, 2.581, 17.934, 4.067, 18.886, 2.581, 18.886, 0]),
        path([16.862, 82.55, 16.862, 79.969, 17.934, 78.483, 18.886, 79.969, 18.886, 82.55]),
        path([277.212, 0, 277.212, 2.581, 278.164, 4.067, 279.236, 2.581, 279.236, 0]),
        path([277.212, 82.55, 277.212, 79.969, 278.164, 78.483, 279.236, 79.969, 279.236, 82.55]),
      ],
      creases: [17.874, 122.649, 148.049, 173.449, 278.224].map(verticalExact),
      safety: [
        path([1.999, 1.999, 116.299, 1.999, 116.299, 80.551, 1.999, 80.551], true),
        path([179.799, 1.999, 294.099, 1.999, 294.099, 80.551, 179.799, 80.551], true),
        path([
          140.049, 8,
          156.049, 8,
          170.274, 22.225,
          170.274, 60.325,
          156.049, 74.55,
          140.049, 74.55,
          125.824, 60.325,
          125.824, 22.225,
        ], true),
      ],
    };
  }

  const bleed = spec.dielineBleed;
  const panelEnd = bleed + spec.height;
  const gussetEnd = panelEnd + spec.gusset;
  const sealLeft = bleed + spec.topSealHeight;
  const sealRight = totalWeb - bleed - spec.topSealHeight;
  const centre = panelEnd + spec.gusset / 2;
  const notchWidth = x(spec.notchSize * 0.75);
  const notchDepth = y(spec.notchSize * 0.55);
  const safeInset = 2.3;

  const vertical = (mm: number): DielinePath => ({
    points: [x(mm), 0, x(mm), canvasHeight],
    closed: false,
  });

  const safeRect = (left: number, right: number): DielinePath => ({
    points: [
      x(left), y(safeInset),
      x(right), y(safeInset),
      x(right), y(spec.width - safeInset),
      x(left), y(spec.width - safeInset),
    ],
    closed: true,
  });

  const chamferX = spec.gusset * 0.29;
  const chamferY = spec.width * 0.27;
  const gussetSafety: DielinePath = {
    points: [
      x(panelEnd + chamferX), y(safeInset),
      x(gussetEnd - chamferX), y(safeInset),
      x(gussetEnd - safeInset), y(chamferY),
      x(gussetEnd - safeInset), y(spec.width - chamferY),
      x(gussetEnd - chamferX), y(spec.width - safeInset),
      x(panelEnd + chamferX), y(spec.width - safeInset),
      x(panelEnd + safeInset), y(spec.width - chamferY),
      x(panelEnd + safeInset), y(chamferY),
    ],
    closed: true,
  };

  const notch = (notchX: number, top: boolean): DielinePath => ({
    points: top
      ? [x(notchX) - notchWidth, 0, x(notchX), notchDepth, x(notchX) + notchWidth, 0]
      : [
          x(notchX) - notchWidth,
          canvasHeight,
          x(notchX),
          canvasHeight - notchDepth,
          x(notchX) + notchWidth,
          canvasHeight,
        ],
    closed: false,
  });

  return {
    cuts: [
      {
        points: [0, 0, canvasWidth, 0, canvasWidth, canvasHeight, 0, canvasHeight],
        closed: true,
      },
      notch(sealLeft, true),
      notch(sealLeft, false),
      notch(sealRight, true),
      notch(sealRight, false),
    ],
    creases: [
      vertical(sealLeft),
      vertical(panelEnd),
      vertical(centre),
      vertical(gussetEnd),
      vertical(sealRight),
    ],
    safety: [
      safeRect(bleed + safeInset, panelEnd - safeInset),
      gussetSafety,
      safeRect(gussetEnd + safeInset, totalWeb - bleed - safeInset),
    ],
  };
}
