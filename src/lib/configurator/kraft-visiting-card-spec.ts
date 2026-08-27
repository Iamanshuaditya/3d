import type { FlatSheetSpec, ProductConfig } from "@/types/configurator";
import { flatSheetSurface } from "./flat-sheet";

export const KRAFT_VISITING_CARD_ID = "kraft-visiting-card-88.9x50.8";

/** Authoritative physical definition. Every derived measurement comes from this. */
export const KRAFT_VISITING_CARD_SPEC: FlatSheetSpec = Object.freeze({
  unit: "mm",
  trimWidthMm: 88.9,
  trimHeightMm: 50.8,
  bleedMm: 3,
  safeAreaInsetMm: 3,
  editorPxPerMm: 10,
  previewThicknessMm: 0.38,
});

export const kraftVisitingCardProduct: ProductConfig = {
  id: KRAFT_VISITING_CARD_ID,
  name: "Kraft Visiting Card 88.9 × 50.8 mm",
  family: "flat-sheet",
  modelUrl: "",
  flatSheetSpec: KRAFT_VISITING_CARD_SPEC,
  materialProfile: "kraft-cardstock",
  printProfileId: "pdfx4-srgb-3mm-bleed-v1",
  editableSurfaces: [
    flatSheetSurface(KRAFT_VISITING_CARD_SPEC, {
      id: "front",
      label: "Front artwork",
      meshName: "FRONT_PRINT",
      presentation: { kind: "print-area", order: 1 },
      defaultBackground: "#b78b57",
      productionBackground: "#ffffff",
    }),
  ],
  camera: {
    initial: [0.78, 0.48, 1.85],
    target: [0, 0, 0],
    minDistance: 0.65,
    maxDistance: 5,
    presets: [
      { id: "front", label: "Front", position: [0, 0, 1.85], target: [0, 0, 0] },
      { id: "angle", label: "3/4", position: [0.78, 0.48, 1.85], target: [0, 0, 0] },
      { id: "back", label: "Back", position: [0, 0, -1.85], target: [0, 0, 0] },
      { id: "edge", label: "Edge", position: [1.9, 0.2, 0.35], target: [0, 0, 0] },
    ],
  },
};
