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

export function getPacdoraLabStandUpHangHole(input: PouchLabInput): {
  centreYmm: number;
  radiusMm: number;
} {
  return {
    centreYmm: input.height * 0.5 - input.endSealMm * 0.48,
    radiusMm: Math.min(3.2, Math.max(2.4, input.endSealMm * 0.24)),
  };
}

export function getPacdoraLabPouchPanelUv(
  solution: PouchLabSolution,
  panelId: "front-film" | "back-film" | "bottom-gusset",
  lateral: number,
  bottomToTop: number,
): THREE.Vector2 {
  const panel = solution.panels.find((candidate) => candidate.id === panelId);
  if (!panel) throw new Error(`Pouch web is missing ${panelId}.`);
  const xMm = panel.x + clamp01(lateral) * panel.width;
  const yMm = panel.y + (1 - clamp01(bottomToTop)) * panel.height;
  return new THREE.Vector2(
    xMm / solution.web.width,
    1 - yMm / solution.web.height,
  );
}

function getPacdoraLabPouchWebUv(
  solution: PouchLabSolution,
  xMm: number,
  yMm: number,
): THREE.Vector2 {
  return new THREE.Vector2(
    clamp01(xMm / solution.web.width),
    1 - clamp01(yMm / solution.web.height),
  );
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
  const formingDepth = standUp
    ? Math.min(input.depth, input.width * 0.72, input.gussetMm * 0.88, input.height * 0.32)
    : Math.min(input.depth, input.width * 0.78, input.height * 0.42);
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
    inflatedDepth: formingDepth * inflation,
    web: { width: webWidth, height: webHeight },
    panels,
    lines,
    assumptions: standUp
      ? [
          "Research construction: stand-up doypack with a generated bottom-gusset membrane.",
          "The broad face, tapered shoulders, zipper ridge, cut-through hang hole, and standing base are separate geometric features.",
          ...(formingDepth < input.depth - 0.001
            ? [`The ${input.depth.toFixed(1)} mm target depth resolves to ${formingDepth.toFixed(1)} mm because the gusset and face proportions limit forming.`]
            : []),
          "Gusset depth, zipper offset, seal widths, and forming shrink require converter confirmation.",
        ]
      : [
          "Research construction: center/back-seal pillow pouch with wide end-seal fins.",
          "The hourglass body and flat heat-seal bands are generated independently from the stable film web.",
          ...(formingDepth < input.depth - 0.001
            ? [`The ${input.depth.toFixed(1)} mm target depth resolves to ${formingDepth.toFixed(1)} mm because the face proportions limit forming.`]
            : []),
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
    features: {
      zipper: solution.input.zipper,
      hangHole: solution.style === "stand-up" && solution.input.hangHole,
    },
    artworkUv: "canonical-flat-web",
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
        const artworkUv = getPacdoraLabPouchPanelUv(
          solution,
          face > 0 ? "front-film" : "back-film",
          face > 0 ? u : 1 - u,
          v,
        );
        positions.push(x * MM_TO_SCENE, y * MM_TO_SCENE, z * MM_TO_SCENE);
        uvs.push(artworkUv.x, artworkUv.y);
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
  // The artwork face remains a rectangle as the pouch opens. Only the lower
  // gusset entry pulls the corners inward, and even there the contraction is
  // slight. A stronger taper makes the pouch read as a bottle or rounded slab.
  const lowerBody = lerp(0.97, 0.997, smoothstep(0, 0.14, v));
  const topSeal = smoothstep(1 - sealFraction * 1.25, 1, v);
  return lerp(lowerBody, 1, topSeal);
}

function standUpDepthFactorAt(v: number, sealFraction: number): number {
  // A stand-up pouch closes at the upper heat seal, but it cannot also close
  // to a point at the bottom: the opened gusset holds the lower front and back
  // panels apart. Pinching both ends produces a diamond silhouette and forces
  // the gusset to escape underneath as a false "foot".
  const clampedV = clamp01(v);
  const gussetOpening = lerp(0.66, 1, smoothstep(0, 0.22, clampedV));
  // Pacdora's slider behaves like a fill amount, not a uniform pressure
  // modifier. The product chamber swells below the visual fill line while the
  // empty headspace has already collapsed well before it reaches the zipper.
  const productChamber = lerp(1, 0.14, smoothstep(0.38, 0.78, clampedV));
  const sealClosure = 1 - smoothstep(
    1 - sealFraction * 4,
    1 - sealFraction * 0.75,
    clampedV,
  );
  return gussetOpening * productChamber * sealClosure;
}

function standUpSideMaskAt(s: number): number {
  // Most of a filled pouch is still a broad, printable face. Curvature is
  // concentrated in a shoulder close to the side heat seals instead of being
  // spread across the entire panel like a balloon.
  const shoulder = smoothstep(0.42, 0.97, Math.abs(s));
  return Math.pow(Math.max(0, 1 - shoulder), 0.82);
}

function standUpMaximumCornerLift(width: number, gussetMm: number): number {
  // A real Doypack may lift very slightly where its bottom fold enters the
  // side seals, but the printable face still has an essentially level lower
  // edge. Keep this below half a millimetre at the research defaults.
  return Math.min(gussetMm * 0.006, width * 0.003);
}

function standUpLowerReliefMm(
  s: number,
  v: number,
  depthFactor: number,
  inflationProgress: number,
): number {
  const lowerFade = Math.pow(Math.max(0, 1 - v / 0.5), 1.45);
  const leftGussetPull = -0.46
    * Math.exp(-Math.pow((s - (-0.72 + v * 0.25)) / 0.06, 2))
    * lowerFade;
  const rightGussetPull = -0.42
    * Math.exp(-Math.pow((s - (0.7 - v * 0.22)) / 0.064, 2))
    * lowerFade;
  return (leftGussetPull + rightGussetPull)
    * inflationProgress
    * Math.min(1, depthFactor * 1.8);
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
  const panelCrown = 1 - 0.018 * s * s;
  const bottomInfluence = 1 - smoothstep(0, 0.22, clampedV);
  const inflationProgress = smoothstep(0.05, 0.86, solution.input.inflation);
  const maximumCornerLift = standUpMaximumCornerLift(width, gussetMm);
  const cornerLift = Math.pow(Math.abs(s), 3)
    * maximumCornerLift
    * bottomInfluence
    * inflationProgress;
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
  const inflationProgress = smoothstep(0.05, 0.86, solution.input.inflation);
  const hangHole = getPacdoraLabStandUpHangHole(solution.input);
  const hangHoleCellPadding = Math.hypot(
    width / segmentsAcross,
    height / segmentsUp,
  ) * 0.58;

  // Two broad face membranes. Their centres translate apart almost as planar
  // cards; the side shoulders, top closure, and gusset entry absorb the bend.
  for (const face of [1, -1] as const) {
    for (let yIndex = 0; yIndex <= segmentsUp; yIndex++) {
      const v = yIndex / segmentsUp;
      const depthFactor = standUpDepthFactorAt(v, sealFraction);
      for (let xIndex = 0; xIndex <= segmentsAcross; xIndex++) {
        const u = xIndex / segmentsAcross;
        const s = u * 2 - 1;
        const relief = standUpLowerReliefMm(
          s,
          v,
          depthFactor,
          inflationProgress,
        );
        const point = samplePacdoraLabStandUpSurface(solution, u, v, face);
        point.z += face * relief * MM_TO_SCENE;
        const artworkUv = getPacdoraLabPouchPanelUv(
          solution,
          face > 0 ? "front-film" : "back-film",
          face > 0 ? u : 1 - u,
          v,
        );
        positions.push(point.x, point.y, point.z);
        uvs.push(artworkUv.x, artworkUv.y);
      }
    }
  }

  for (const face of [0, 1] as const) {
    const offset = face * faceVertexCount;
    for (let yIndex = 0; yIndex < segmentsUp; yIndex++) {
      for (let xIndex = 0; xIndex < segmentsAcross; xIndex++) {
        if (solution.input.hangHole) {
          const v = (yIndex + 0.5) / segmentsUp;
          const u = (xIndex + 0.5) / segmentsAcross;
          const s = u * 2 - 1;
          const x = s * width * 0.5 * standUpWidthScaleAt(v, sealFraction);
          const y = (v - 0.5) * height;
          if (Math.hypot(x, y - hangHole.centreYmm)
            < hangHole.radiusMm + hangHoleCellPadding) {
            continue;
          }
        }
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

  // Separate double-layer side fins keep their laminate thickness while the
  // body opens behind them. These rails are part of the final silhouette and
  // account for the side-seal allowance already present in the flat web.
  for (const side of [-1, 1] as const) {
    const u = side < 0 ? 0 : 1;
    for (const face of [1, -1] as const) {
      const finOffset = positions.length / 3;
      for (let yIndex = 0; yIndex <= segmentsUp; yIndex++) {
        const v = yIndex / segmentsUp;
        const inner = samplePacdoraLabStandUpSurface(solution, u, v, face);
        const outerX = inner.x + side * endSealMm * MM_TO_SCENE;
        const panel = solution.panels.find((candidate) => (
          candidate.id === (face > 0 ? "front-film" : "back-film")
        ));
        if (!panel) throw new Error("Pouch web is missing an artwork panel.");
        const viewedSide = face > 0 ? side : -side;
        const edgeX = viewedSide < 0 ? panel.x : panel.x + panel.width;
        const outerWebX = edgeX + viewedSide * endSealMm;
        const webY = panel.y + (1 - v) * panel.height;
        const innerUv = getPacdoraLabPouchWebUv(solution, edgeX, webY);
        const outerUv = getPacdoraLabPouchWebUv(solution, outerWebX, webY);
        positions.push(inner.x, inner.y, inner.z);
        positions.push(outerX, inner.y, face * filmHalf * MM_TO_SCENE);
        uvs.push(innerUv.x, innerUv.y, outerUv.x, outerUv.y);
      }
      for (let yIndex = 0; yIndex < segmentsUp; yIndex++) {
        const a = finOffset + yIndex * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        if (face > 0) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
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
  const maximumCornerLift = standUpMaximumCornerLift(width, gussetMm);
  for (let qIndex = 0; qIndex <= gussetRows; qIndex++) {
    const q = qIndex / gussetRows;
    const frontBack = q * 2 - 1;
    for (let xIndex = 0; xIndex <= segmentsAcross; xIndex++) {
      const u = xIndex / segmentsAcross;
      const s = u * 2 - 1;
      const sideMask = standUpSideMaskAt(s);
      const panelCrown = 1 - 0.018 * s * s;
      const lowerRelief = standUpLowerReliefMm(
        s,
        0,
        bottomDepthFactor,
        inflationProgress,
      );
      const gussetDepth = filmHalf
        + halfDepth * sideMask * bottomDepthFactor * panelCrown
        + lowerRelief;
      const centreFold = Math.pow(Math.max(0, 1 - Math.abs(frontBack)), 0.72);
      // The unused gusset folds upward between the two face membranes. As the
      // pouch opens, that fold settles into the broad standing base. It never
      // moves below the face boundary, which prevents the oval protrusion seen
      // in the earlier mesh.
      const foldedCentreLift = centreFold
        * gussetMm
        * 0.11
        * (1 - inflationProgress);
      const cornerLift = Math.pow(Math.abs(s), 3)
        * maximumCornerLift
        * inflationProgress;
      const x = s * width * 0.5 * bottomWidthScale;
      const y = -height * 0.5 + cornerLift + foldedCentreLift;
      const z = frontBack * gussetDepth;
      const artworkUv = getPacdoraLabPouchPanelUv(
        solution,
        "bottom-gusset",
        u,
        1 - q,
      );
      positions.push(x * MM_TO_SCENE, y * MM_TO_SCENE, z * MM_TO_SCENE);
      uvs.push(artworkUv.x, artworkUv.y);
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
  segmentsAcross = 72,
  segmentsUp = 96,
): THREE.BufferGeometry {
  return solution.style === "stand-up"
    ? buildStandUpGeometry(solution, segmentsAcross, segmentsUp)
    : buildCenterSealGeometry(solution, segmentsAcross, segmentsUp);
}
