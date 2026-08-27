import type {
  EditableSurface,
  FlatSheetSpec,
  RectangularPrintLayout,
} from "@/types/configurator";

export type MmRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type FlatSheetGeometry = Readonly<{
  fullWidthMm: number;
  fullHeightMm: number;
  trimBoxMm: MmRect;
  safeAreaBoxMm: MmRect;
  editorWidth: number;
  editorHeight: number;
  previewUvCrop: MmRect;
}>;

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

export function deriveFlatSheetGeometry(spec: FlatSheetSpec): FlatSheetGeometry {
  positive(spec.trimWidthMm, "Trim width");
  positive(spec.trimHeightMm, "Trim height");
  positive(spec.editorPxPerMm, "Editor pixels per millimetre");
  positive(spec.previewThicknessMm, "Preview thickness");
  if (!Number.isFinite(spec.bleedMm) || spec.bleedMm < 0) {
    throw new Error("Bleed must be a non-negative finite number.");
  }
  if (!Number.isFinite(spec.safeAreaInsetMm) || spec.safeAreaInsetMm < 0) {
    throw new Error("Safe-area inset must be a non-negative finite number.");
  }
  if (
    spec.safeAreaInsetMm * 2 >= spec.trimWidthMm ||
    spec.safeAreaInsetMm * 2 >= spec.trimHeightMm
  ) {
    throw new Error("Safe-area inset leaves no usable trim area.");
  }

  const fullWidthMm = spec.trimWidthMm + spec.bleedMm * 2;
  const fullHeightMm = spec.trimHeightMm + spec.bleedMm * 2;
  const trimBoxMm = {
    x: spec.bleedMm,
    y: spec.bleedMm,
    width: spec.trimWidthMm,
    height: spec.trimHeightMm,
  };
  const safeAreaBoxMm = {
    x: spec.bleedMm + spec.safeAreaInsetMm,
    y: spec.bleedMm + spec.safeAreaInsetMm,
    width: spec.trimWidthMm - spec.safeAreaInsetMm * 2,
    height: spec.trimHeightMm - spec.safeAreaInsetMm * 2,
  };
  return {
    fullWidthMm,
    fullHeightMm,
    trimBoxMm,
    safeAreaBoxMm,
    editorWidth: Math.round(fullWidthMm * spec.editorPxPerMm),
    editorHeight: Math.round(fullHeightMm * spec.editorPxPerMm),
    previewUvCrop: {
      x: trimBoxMm.x / fullWidthMm,
      y: trimBoxMm.y / fullHeightMm,
      width: trimBoxMm.width / fullWidthMm,
      height: trimBoxMm.height / fullHeightMm,
    },
  };
}

export function mmToEditorPx(mm: number, pxPerMm: number) {
  return mm * pxPerMm;
}

export function editorPxToMm(editorPx: number, pxPerMm: number) {
  return editorPx / pxPerMm;
}

export function rectangularLayoutFor(
  spec: FlatSheetSpec,
  showCenterGuides = true,
): RectangularPrintLayout {
  const geometry = deriveFlatSheetGeometry(spec);
  return {
    unit: "mm",
    pxPerMm: spec.editorPxPerMm,
    trimBoxMm: { ...geometry.trimBoxMm },
    safeAreaBoxMm: { ...geometry.safeAreaBoxMm },
    showCenterGuides,
  };
}

export function flatSheetSurface(
  spec: FlatSheetSpec,
  input: Pick<EditableSurface, "id" | "label" | "meshName"> &
    Partial<
      Pick<EditableSurface, "defaultBackground" | "productionBackground" | "presentation">
    >,
): EditableSurface {
  const geometry = deriveFlatSheetGeometry(spec);
  return {
    ...input,
    editorWidth: geometry.editorWidth,
    editorHeight: geometry.editorHeight,
    physicalWidthCm: geometry.fullWidthMm / 10,
    physicalHeightCm: geometry.fullHeightMm / 10,
    displayUnit: "mm",
    guides: {
      bleed: mmToEditorPx(spec.bleedMm, spec.editorPxPerMm),
      safeArea: mmToEditorPx(
        spec.bleedMm + spec.safeAreaInsetMm,
        spec.editorPxPerMm,
      ),
    },
    rectangularLayout: rectangularLayoutFor(spec),
  };
}

/** Canvas top-left millimetres to the finished card's front UV coordinates. */
export function artworkMmToCardUv(
  spec: FlatSheetSpec,
  point: Readonly<{ x: number; y: number }>,
) {
  return {
    u: (point.x - spec.bleedMm) / spec.trimWidthMm,
    v: 1 - (point.y - spec.bleedMm) / spec.trimHeightMm,
  };
}

/** Finished-card UVs to normalized coordinates in the full bleed artwork. */
export function cardUvToArtworkUv(
  spec: FlatSheetSpec,
  point: Readonly<{ u: number; v: number }>,
) {
  const geometry = deriveFlatSheetGeometry(spec);
  return {
    u: geometry.previewUvCrop.x + point.u * geometry.previewUvCrop.width,
    v: geometry.previewUvCrop.y + point.v * geometry.previewUvCrop.height,
  };
}
