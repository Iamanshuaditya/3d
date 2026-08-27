import * as THREE from "three";
import { getPacdoraLabMaterial } from "./materials";
import type { PouchLabInput, PouchLabSolution } from "./types";

const MM_TO_SCENE = 0.01;

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
  return value;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function solvePacdoraLabPouch(input: PouchLabInput): PouchLabSolution {
  const material = getPacdoraLabMaterial(input.materialId, "film");
  positive(input.width, "Pouch width");
  positive(input.height, "Pouch height");
  positive(input.depth, "Pouch depth");
  positive(input.endSealMm, "End seal");
  positive(input.backSealMm, "Back seal");
  positive(input.gussetMm, "Bottom gusset");
  const inflation = clamp01(input.inflation);
  const standUp = input.style === "stand-up";
  const webWidth = standUp
    ? input.width + input.endSealMm * 2
    : input.width * 2 + input.backSealMm;
  const webHeight = standUp
    ? input.height * 2 + input.gussetMm + input.endSealMm * 2
    : input.height + input.endSealMm * 2;

  const panels: PouchLabSolution["panels"] = standUp
    ? [
        {
          id: "back-film",
          label: "Back artwork",
          x: input.endSealMm,
          y: input.endSealMm,
          width: input.width,
          height: input.height,
          role: "film",
        },
        {
          id: "bottom-gusset",
          label: "Bottom gusset",
          x: input.endSealMm,
          y: input.endSealMm + input.height,
          width: input.width,
          height: input.gussetMm,
          role: "seal",
        },
        {
          id: "front-film",
          label: "Front artwork",
          x: input.endSealMm,
          y: input.endSealMm + input.height + input.gussetMm,
          width: input.width,
          height: input.height,
          role: "film",
        },
      ]
    : [
        {
          id: "front-film",
          label: "Front artwork",
          x: 0,
          y: input.endSealMm,
          width: input.width,
          height: input.height,
          role: "film",
        },
        {
          id: "back-film",
          label: "Back artwork",
          x: input.width,
          y: input.endSealMm,
          width: input.width,
          height: input.height,
          role: "film",
        },
        {
          id: "back-seal",
          label: "Back fin seal",
          x: input.width * 2,
          y: input.endSealMm,
          width: input.backSealMm,
          height: input.height,
          role: "seal",
        },
      ];
  const lines: PouchLabSolution["lines"] = standUp
    ? [
        { id: "left-side-seal", x1: input.endSealMm, y1: 0, x2: input.endSealMm, y2: webHeight, kind: "seal" },
        { id: "right-side-seal", x1: input.endSealMm + input.width, y1: 0, x2: input.endSealMm + input.width, y2: webHeight, kind: "seal" },
        { id: "back-gusset-fold", x1: input.endSealMm, y1: input.endSealMm + input.height, x2: input.endSealMm + input.width, y2: input.endSealMm + input.height, kind: "crease" },
        { id: "gusset-centre-fold", x1: input.endSealMm, y1: input.endSealMm + input.height + input.gussetMm / 2, x2: input.endSealMm + input.width, y2: input.endSealMm + input.height + input.gussetMm / 2, kind: "crease" },
        { id: "front-gusset-fold", x1: input.endSealMm, y1: input.endSealMm + input.height + input.gussetMm, x2: input.endSealMm + input.width, y2: input.endSealMm + input.height + input.gussetMm, kind: "crease" },
        ...(input.zipper
          ? [{
              id: "zipper-line",
              x1: input.endSealMm,
              y1: webHeight - input.endSealMm * 2.4,
              x2: input.endSealMm + input.width,
              y2: webHeight - input.endSealMm * 2.4,
              kind: "seal" as const,
            }]
          : []),
      ]
    : [
        { id: "top-seal", x1: 0, y1: input.endSealMm, x2: webWidth, y2: input.endSealMm, kind: "seal" },
        { id: "front-back", x1: input.width, y1: input.endSealMm, x2: input.width, y2: input.endSealMm + input.height, kind: "crease" },
        { id: "back-fin", x1: input.width * 2, y1: input.endSealMm, x2: input.width * 2, y2: input.endSealMm + input.height, kind: "seal" },
        { id: "bottom-seal", x1: 0, y1: input.endSealMm + input.height, x2: webWidth, y2: input.endSealMm + input.height, kind: "seal" },
      ];

  return {
    kind: "pouch",
    material,
    input: { ...input, inflation },
    style: input.style,
    inflatedDepth: input.depth * inflation,
    web: { width: webWidth, height: webHeight },
    panels,
    lines,
    assumptions: standUp
      ? [
          "Research construction: stand-up doypack with a generated bottom-gusset membrane.",
          "The broad face, tapered shoulders, zipper ridge, and standing base are separate geometric features.",
          "Gusset depth, zipper offset, seal widths, and forming shrink require converter confirmation.",
        ]
      : [
          "Research construction: center/back-seal pillow pouch with wide end-seal fins.",
          "The hourglass body and flat heat-seal bands are generated independently from the stable film web.",
          "Seal widths and forming shrink must be confirmed with the film converter before production.",
        ],
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function finishGeometry(
  solution: PouchLabSolution,
  positions: number[],
  uvs: number[],
  indices: number[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.pacdoraLab = {
    kind: `procedural-${solution.style}-pouch`,
    inflation: solution.input.inflation,
    dimensionsMm: {
      width: solution.input.width,
      height: solution.input.height,
      depth: solution.inflatedDepth,
    },
    topology: solution.style === "stand-up" ? "front-back-bottom-gusset" : "front-back-fin-seal",
  };
  return geometry;
}

function buildCenterSealGeometry(
  solution: PouchLabSolution,
  segmentsAcross: number,
  segmentsUp: number,
): THREE.BufferGeometry {
  const { width, height, endSealMm } = solution.input;
  const halfDepth = solution.inflatedDepth * 0.5;
  const filmHalf = Math.max(solution.material.caliperMm * 0.5, 0.035);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const row = segmentsAcross + 1;
  const faceVertexCount = row * (segmentsUp + 1);
  const sealFraction = Math.min(0.16, Math.max(0.045, endSealMm / height));

  // A centre-seal bag is not a rounded cuboid. Its heat-seal bands stay flat
  // and wide while the filled film pulls inward at both shoulders and swells
  // through the middle, producing Pacdora's characteristic pillow silhouette.
  for (const face of [1, -1] as const) {
    for (let yIndex = 0; yIndex <= segmentsUp; yIndex++) {
      const v = yIndex / segmentsUp;
      const edgeDistance = Math.min(v, 1 - v);
      const bodyMask = smoothstep(sealFraction, sealFraction * 2.05, edgeDistance);
      const bodyV = clamp01((v - sealFraction) / Math.max(0.001, 1 - sealFraction * 2));
      const pillow = Math.pow(Math.sin(bodyV * Math.PI), 0.62);
      const bodyWidthScale = 0.82 + pillow * 0.17;
      const widthScale = lerp(1.035, bodyWidthScale, bodyMask);

      for (let xIndex = 0; xIndex <= segmentsAcross; xIndex++) {
        const u = xIndex / segmentsAcross;
        const s = u * 2 - 1;
        const sideMask = Math.pow(Math.max(0, 1 - s * s), 0.54);
        const crown = 0.92 + 0.08 * Math.cos(s * Math.PI);
        const wrinkle = 0.34
          * Math.sin(s * 15.2 + v * 21.4 + (face > 0 ? 0 : 2.1))
          * bodyMask
          * Math.pow(Math.abs(s), 1.55);
        const z = face * (filmHalf + halfDepth * bodyMask * sideMask * crown + wrinkle);
        const x = s * width * 0.5 * widthScale;
        const y = (v - 0.5) * height;
        positions.push(x * MM_TO_SCENE, y * MM_TO_SCENE, z * MM_TO_SCENE);
        uvs.push(face > 0 ? u : 1 - u, v);
      }
    }
  }

  for (const face of [0, 1] as const) {
    const offset = face * faceVertexCount;
    for (let yIndex = 0; yIndex < segmentsUp; yIndex++) {
      for (let xIndex = 0; xIndex < segmentsAcross; xIndex++) {
        const a = offset + yIndex * row + xIndex;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        if (face === 0) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
  }

  const front = (yIndex: number, xIndex: number) => yIndex * row + xIndex;
  const back = (yIndex: number, xIndex: number) => faceVertexCount + yIndex * row + xIndex;
  for (let yIndex = 0; yIndex < segmentsUp; yIndex++) {
    for (const xIndex of [0, segmentsAcross]) {
      const f0 = front(yIndex, xIndex);
      const f1 = front(yIndex + 1, xIndex);
      const b0 = back(yIndex, xIndex);
      const b1 = back(yIndex + 1, xIndex);
      if (xIndex === 0) indices.push(f0, b0, f1, b0, b1, f1);
      else indices.push(f0, f1, b0, b0, f1, b1);
    }
  }
  for (const yIndex of [0, segmentsUp]) {
    for (let xIndex = 0; xIndex < segmentsAcross; xIndex++) {
      const f0 = front(yIndex, xIndex);
      const f1 = front(yIndex, xIndex + 1);
      const b0 = back(yIndex, xIndex);
      const b1 = back(yIndex, xIndex + 1);
      if (yIndex === 0) indices.push(f0, f1, b0, b0, f1, b1);
      else indices.push(f0, b0, f1, b0, b1, f1);
    }
  }

  return finishGeometry(solution, positions, uvs, indices);
}

function standUpWidthScaleAt(v: number, sealFraction: number): number {
  const lowerBody = lerp(0.86, 0.975, smoothstep(0, 0.24, v));
  const body = lowerBody + 0.012 * Math.sin(v * Math.PI);
  const topSeal = smoothstep(1 - sealFraction * 1.2, 1, v);
  return lerp(body, 1.015, topSeal);
}

function standUpDepthFactorAt(v: number, sealFraction: number): number {
  const gussetOpen = lerp(0.74, 1, smoothstep(0, 0.2, v));
  const upperTaper = lerp(1, 0.5, smoothstep(0.28, 0.8, v));
  const closure = 1 - smoothstep(1 - sealFraction * 2.8, 1 - sealFraction, v);
  return gussetOpen * upperTaper * closure;
}

function standUpSideMaskAt(s: number): number {
  const sealedS = Math.min(1, Math.abs(s) / 0.9);
  return Math.pow(Math.max(0, 1 - sealedS * sealedS), 0.46);
}

/**
 * Samples the smooth construction surface (before small wrinkle relief). It is
 * shared by the body mesh and closure details so zipper rails sit on the film
 * instead of floating in front of a curved face.
 */
export function samplePacdoraLabStandUpSurface(
  solution: PouchLabSolution,
  u: number,
  v: number,
  face: 1 | -1,
): THREE.Vector3 {
  const { width, height, endSealMm, gussetMm } = solution.input;
  const sealFraction = Math.min(0.15, Math.max(0.045, endSealMm / height));
  const s = clamp01(u) * 2 - 1;
  const clampedV = clamp01(v);
  const widthScale = standUpWidthScaleAt(clampedV, sealFraction);
  const depthFactor = standUpDepthFactorAt(clampedV, sealFraction);
  const sideMask = standUpSideMaskAt(s);
  const panelCrown = 0.94 + 0.06 * Math.cos(s * Math.PI);
  const bottomInfluence = 1 - smoothstep(0, 0.22, clampedV);
  const cornerLift = Math.pow(Math.abs(s), 2.7) * gussetMm * 0.14 * bottomInfluence;
  const filmHalf = Math.max(solution.material.caliperMm * 0.5, 0.035);
  const x = s * width * 0.5 * widthScale;
  const y = (clampedV - 0.5) * height + cornerLift;
  const z = face * (
    filmHalf
    + solution.inflatedDepth * 0.5 * sideMask * depthFactor * panelCrown
  );
  return new THREE.Vector3(x * MM_TO_SCENE, y * MM_TO_SCENE, z * MM_TO_SCENE);
}

function buildStandUpGeometry(
  solution: PouchLabSolution,
  segmentsAcross: number,
  segmentsUp: number,
): THREE.BufferGeometry {
  const { width, height, endSealMm, gussetMm } = solution.input;
  const halfDepth = solution.inflatedDepth * 0.5;
  const filmHalf = Math.max(solution.material.caliperMm * 0.5, 0.035);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const row = segmentsAcross + 1;
  const faceVertexCount = row * (segmentsUp + 1);
  const sealFraction = Math.min(0.15, Math.max(0.045, endSealMm / height));

  // Two broad face membranes with a gentle shoulder taper. The bottom stays
  // open here and is closed by a separately tessellated gusset below.
  for (const face of [1, -1] as const) {
    for (let yIndex = 0; yIndex <= segmentsUp; yIndex++) {
      const v = yIndex / segmentsUp;
      const depthFactor = standUpDepthFactorAt(v, sealFraction);
      const bottomInfluence = 1 - smoothstep(0, 0.22, v);
      for (let xIndex = 0; xIndex <= segmentsAcross; xIndex++) {
        const u = xIndex / segmentsAcross;
        const s = u * 2 - 1;
        const sideMask = standUpSideMaskAt(s);
        const sideWrinkle = 0.18
          * Math.sin(s * 17.1 + v * 13.7 + (face > 0 ? 0 : 1.7))
          * Math.pow(Math.abs(s), 1.65)
          * depthFactor
          * sideMask;
        const gussetCrease = 0.34
          * Math.exp(-Math.pow((Math.abs(s) - (0.74 - v * 0.34)) / 0.075, 2))
          * bottomInfluence;
        const point = samplePacdoraLabStandUpSurface(solution, u, v, face);
        point.z += face * (sideWrinkle - gussetCrease) * MM_TO_SCENE;
        positions.push(point.x, point.y, point.z);
        uvs.push(face > 0 ? u : 1 - u, v);
      }
    }
  }

  for (const face of [0, 1] as const) {
    const offset = face * faceVertexCount;
    for (let yIndex = 0; yIndex < segmentsUp; yIndex++) {
      for (let xIndex = 0; xIndex < segmentsAcross; xIndex++) {
        const a = offset + yIndex * row + xIndex;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        if (face === 0) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
  }

  const front = (yIndex: number, xIndex: number) => yIndex * row + xIndex;
  const back = (yIndex: number, xIndex: number) => faceVertexCount + yIndex * row + xIndex;
  for (let yIndex = 0; yIndex < segmentsUp; yIndex++) {
    for (const xIndex of [0, segmentsAcross]) {
      const f0 = front(yIndex, xIndex);
      const f1 = front(yIndex + 1, xIndex);
      const b0 = back(yIndex, xIndex);
      const b1 = back(yIndex + 1, xIndex);
      if (xIndex === 0) indices.push(f0, b0, f1, b0, b1, f1);
      else indices.push(f0, f1, b0, b0, f1, b1);
    }
  }
  // Close only the top seam. The lower perimeter is the gusset boundary.
  for (let xIndex = 0; xIndex < segmentsAcross; xIndex++) {
    const f0 = front(segmentsUp, xIndex);
    const f1 = front(segmentsUp, xIndex + 1);
    const b0 = back(segmentsUp, xIndex);
    const b1 = back(segmentsUp, xIndex + 1);
    indices.push(f0, b0, f1, b0, b1, f1);
  }

  const gussetRows = Math.max(10, Math.round(segmentsAcross * 0.42));
  const gussetOffset = positions.length / 3;
  const bottomWidthScale = standUpWidthScaleAt(0, sealFraction);
  const bottomDepthFactor = standUpDepthFactorAt(0, sealFraction);
  for (let qIndex = 0; qIndex <= gussetRows; qIndex++) {
    const q = qIndex / gussetRows;
    const frontBack = q * 2 - 1;
    for (let xIndex = 0; xIndex <= segmentsAcross; xIndex++) {
      const u = xIndex / segmentsAcross;
      const s = u * 2 - 1;
      const sideMask = standUpSideMaskAt(s);
      const boundaryDepth = filmHalf + halfDepth * sideMask * bottomDepthFactor * (0.94 + 0.06 * Math.cos(s * Math.PI));
      const centreFold = Math.pow(Math.max(0, 1 - Math.abs(frontBack)), 0.72);
      const centreArch = centreFold * (0.2 * gussetMm + 0.06 * halfDepth);
      const edgePinch = Math.pow(Math.abs(s), 2.7) * gussetMm * 0.14;
      const x = s * width * 0.5 * bottomWidthScale;
      const y = -height * 0.5 + centreArch + edgePinch;
      const z = frontBack * boundaryDepth;
      positions.push(x * MM_TO_SCENE, y * MM_TO_SCENE, z * MM_TO_SCENE);
      uvs.push(u, q);
    }
  }
  for (let qIndex = 0; qIndex < gussetRows; qIndex++) {
    for (let xIndex = 0; xIndex < segmentsAcross; xIndex++) {
      const a = gussetOffset + qIndex * row + xIndex;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return finishGeometry(solution, positions, uvs, indices);
}

/**
 * Rebuilds a flexible-film surface from width, height, depth, seal geometry,
 * and inflation. This deliberately creates new vertices instead of scaling a
 * baked GLB, matching the procedural behavior observed in Pacdora's pouch UI.
 */
export function buildPacdoraLabPouchGeometry(
  solution: PouchLabSolution,
  segmentsAcross = 52,
  segmentsUp = 68,
): THREE.BufferGeometry {
  return solution.style === "stand-up"
    ? buildStandUpGeometry(solution, segmentsAcross, segmentsUp)
    : buildCenterSealGeometry(solution, segmentsAcross, segmentsUp);
}
