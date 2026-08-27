import type { MaterialProfile } from "./types";

export const PACDORA_LAB_MATERIALS = [
  {
    id: "e-flute",
    label: "E-flute corrugated · 1.5 mm",
    kind: "corrugated",
    caliperMm: 1.5,
    color: "#d7bf93",
    roughness: 0.86,
    metalness: 0,
    scoreAllowanceFactor: 2 / 3,
    outerAllowanceFactor: 1 / 3,
    closureStackFactor: 5 / 3,
  },
  {
    id: "b-flute",
    label: "B-flute corrugated · 3 mm",
    kind: "corrugated",
    caliperMm: 3,
    color: "#c9aa76",
    roughness: 0.9,
    metalness: 0,
    scoreAllowanceFactor: 0.72,
    outerAllowanceFactor: 0.38,
    closureStackFactor: 1.55,
  },
  {
    id: "folding-board",
    label: "Folding boxboard · 0.45 mm",
    kind: "paperboard",
    caliperMm: 0.45,
    color: "#f0eee7",
    roughness: 0.64,
    metalness: 0,
    scoreAllowanceFactor: 0.55,
    outerAllowanceFactor: 0.45,
    closureStackFactor: 1.25,
  },
  {
    id: "matte-film",
    label: "Matte plastic film · 0.12 mm",
    kind: "film",
    caliperMm: 0.12,
    color: "#f08a5d",
    roughness: 0.52,
    metalness: 0,
    scoreAllowanceFactor: 0,
    outerAllowanceFactor: 0,
    closureStackFactor: 0,
  },
  {
    id: "foil-film",
    label: "Aluminium laminate · 0.14 mm",
    kind: "film",
    caliperMm: 0.14,
    color: "#c8ccd2",
    roughness: 0.28,
    metalness: 0.62,
    scoreAllowanceFactor: 0,
    outerAllowanceFactor: 0,
    closureStackFactor: 0,
  },
] as const satisfies readonly MaterialProfile[];

export function getPacdoraLabMaterial(
  id: string,
  expectedKind?: "rigid" | "film",
): MaterialProfile {
  const material = PACDORA_LAB_MATERIALS.find((candidate) => candidate.id === id);
  if (!material) throw new Error(`Unknown Pacdora lab material: ${id}`);
  if (expectedKind === "rigid" && material.kind === "film") {
    throw new Error(`${material.label} cannot drive a carton construction.`);
  }
  if (expectedKind === "film" && material.kind !== "film") {
    throw new Error(`${material.label} cannot drive a flexible pouch construction.`);
  }
  return material;
}

export const PACDORA_LAB_BOX_MATERIALS = PACDORA_LAB_MATERIALS.filter(
  (material) => material.kind !== "film",
);

export const PACDORA_LAB_POUCH_MATERIALS = PACDORA_LAB_MATERIALS.filter(
  (material) => material.kind === "film",
);
