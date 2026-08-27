import type {
  DielinePath,
  DielineRegion,
  SurfaceDieline,
} from "@/types/configurator";

/** UI-only guide classes. None of these values are production operations. */
export type DielineGuideClass =
  | "cut"
  | "crease"
  | "bleed"
  | "safe"
  | "technical"
  | "panel";

export type DielineGuideVisibility = Record<DielineGuideClass, boolean>;

export const DIELINE_GUIDE_CLASS_ORDER: readonly DielineGuideClass[] = [
  "cut",
  "crease",
  "bleed",
  "safe",
  "technical",
  "panel",
];

export const DEFAULT_DIELINE_GUIDE_VISIBILITY: Readonly<DielineGuideVisibility> =
  Object.freeze({
    cut: true,
    crease: true,
    bleed: true,
    safe: true,
    technical: true,
    panel: true,
  });

export const DIELINE_GUIDE_DETAILS: Readonly<
  Record<DielineGuideClass, { label: string; description: string }>
> = Object.freeze({
  cut: {
    label: "Cut / trim",
    description: "Where the finished material is cut. Keep essential artwork clear.",
  },
  crease: {
    label: "Crease / fold",
    description: "Where board or film folds. This line is a guide and does not print.",
  },
  bleed: {
    label: "Bleed",
    description: "Extend backgrounds to this limit to avoid unprinted edges after trimming.",
  },
  safe: {
    label: "Safe area",
    description: "Keep logos and important text inside this boundary.",
  },
  technical: {
    label: "Technical",
    description: "Seals, production references, and other non-artwork manufacturing marks.",
  },
  panel: {
    label: "Panels",
    description: "Named artwork regions that map to product faces in the 3D preview.",
  },
});

export type DielinePresentationItem =
  | Readonly<{
      id: string;
      guideClass: Exclude<DielineGuideClass, "panel">;
      label: string;
      description: string;
      shape: "path";
      /** The exact source object: presentation must never rewrite coordinates. */
      path: DielinePath;
    }>
  | Readonly<{
      id: string;
      guideClass: "panel" | "technical";
      label: string;
      description: string;
      shape: "region";
      /** The exact source object: presentation must never rewrite coordinates. */
      region: DielineRegion;
    }>;

function pathItems(
  guideClass: Exclude<DielineGuideClass, "panel">,
  paths: readonly DielinePath[] | undefined,
): DielinePresentationItem[] {
  if (!paths?.length) return [];
  const details = DIELINE_GUIDE_DETAILS[guideClass];
  return paths.map((path, index) => ({
    id: `${guideClass}-${index + 1}`,
    guideClass,
    label: paths.length === 1 ? details.label : `${details.label} ${index + 1}`,
    description: details.description,
    shape: "path",
    path,
  }));
}

/**
 * Adds presentation semantics to exact dieline objects without cloning,
 * scaling, rounding, or otherwise changing their coordinates.
 */
export function buildDielinePresentation(
  dieline: SurfaceDieline | undefined,
): readonly DielinePresentationItem[] {
  if (!dieline) return [];
  const items: DielinePresentationItem[] = [
    ...pathItems("bleed", dieline.bleed),
    ...pathItems("safe", dieline.safety),
    ...pathItems("technical", dieline.technical),
    ...pathItems("crease", dieline.creases),
    ...pathItems("cut", dieline.cuts),
  ];

  for (const reference of dieline.references ?? []) {
    items.push({
      id: `reference-${reference.id}`,
      guideClass: "technical",
      label: reference.label,
      description: DIELINE_GUIDE_DETAILS.technical.description,
      shape: "path",
      path: { points: reference.points, closed: false },
    });
  }

  for (const region of dieline.regions ?? []) {
    const technical = region.role !== "artwork";
    const guideClass = technical ? "technical" : "panel";
    items.push({
      id: `region-${region.id}`,
      guideClass,
      label: region.label,
      description: DIELINE_GUIDE_DETAILS[guideClass].description,
      shape: "region",
      region,
    });
  }
  return items;
}

export function visibleDielinePresentationItems(
  items: readonly DielinePresentationItem[],
  visible: boolean,
  visibility: Readonly<Partial<DielineGuideVisibility>> = {},
): readonly DielinePresentationItem[] {
  if (!visible) return [];
  return items.filter(
    (item) => visibility[item.guideClass] ?? DEFAULT_DIELINE_GUIDE_VISIBILITY[item.guideClass],
  );
}

export type DielineGuideStyle = Readonly<{
  stroke: string;
  strokeWidth: number;
  dash?: number[];
  opacity: number;
  fill?: string;
  fillOpacity?: number;
}>;

const GUIDE_PALETTE: Readonly<
  Record<DielineGuideClass, { stroke: string; cssWidth: number; dash?: readonly number[] }>
> = Object.freeze({
  cut: { stroke: "#1463a5", cssWidth: 1.25 },
  crease: { stroke: "#c2415b", cssWidth: 1.05, dash: [6, 4] },
  bleed: { stroke: "#0e9f6e", cssWidth: 0.95, dash: [9, 4] },
  safe: { stroke: "#7c3aed", cssWidth: 0.95, dash: [3, 3] },
  technical: { stroke: "#64748b", cssWidth: 0.85, dash: [2, 4] },
  panel: { stroke: "#2563eb", cssWidth: 0.9 },
});

export function screenSpaceValue(cssPixels: number, stageScale: number): number {
  return cssPixels / Math.max(stageScale, 0.05);
}

export function resolveDielineGuideStyle(
  guideClass: DielineGuideClass,
  stageScale: number,
  highlighted = false,
): DielineGuideStyle {
  const palette = GUIDE_PALETTE[guideClass];
  const emphasis = highlighted ? 1.65 : 1;
  return {
    stroke: palette.stroke,
    strokeWidth: screenSpaceValue(palette.cssWidth * emphasis, stageScale),
    dash: palette.dash?.map((value) => screenSpaceValue(value, stageScale)),
    opacity: highlighted ? 1 : guideClass === "technical" ? 0.72 : 0.9,
    fill: guideClass === "panel" || guideClass === "technical" ? palette.stroke : undefined,
    fillOpacity: guideClass === "technical" ? 0.08 : guideClass === "panel" ? 0.025 : undefined,
  };
}
