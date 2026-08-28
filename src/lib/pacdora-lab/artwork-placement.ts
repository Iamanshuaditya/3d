import type { DielinePanel, PouchArtwork } from "./types";

export type PouchArtworkSourceSize = {
  width: number;
  height: number;
};

export type ResolvedPouchArtworkFrame = {
  centreX: number;
  centreY: number;
  width: number;
  height: number;
  rotationDeg: number;
  offsetX: number;
  offsetY: number;
  halfExtentX: number;
  halfExtentY: number;
};

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keeps one transformed axis attached to its owning print panel.
 *
 * Small artwork stays fully inside the panel. Artwork larger than the panel
 * stays large enough to cover it, but may move within the excess. In neither
 * case can its centre be dragged through the adjacent gusset or opposite face.
 */
function constrainCentre(
  start: number,
  length: number,
  halfExtent: number,
  requested: number,
): number {
  const end = start + length;
  const insideMin = start + halfExtent;
  const insideMax = end - halfExtent;
  if (insideMin <= insideMax) return clamp(requested, insideMin, insideMax);

  const coverMin = end - halfExtent;
  const coverMax = start + halfExtent;
  if (coverMin <= coverMax) return clamp(requested, coverMin, coverMax);
  return start + length * 0.5;
}

/**
 * Resolves the exact centre-based image transform used by both the Konva
 * editor and the canonical UV canvas. The panel boundary is authoritative:
 * front/back artwork can never be positioned into the bottom-gusset region.
 */
export function resolvePouchArtworkFrame(
  source: PouchArtworkSourceSize,
  panel: Pick<DielinePanel, "x" | "y" | "width" | "height">,
  artwork: Pick<PouchArtwork, "fit" | "scale" | "offsetX" | "offsetY" | "rotationDeg">,
): ResolvedPouchArtworkFrame {
  const sourceWidth = positive(source.width);
  const sourceHeight = positive(source.height);
  const panelWidth = positive(panel.width);
  const panelHeight = positive(panel.height);
  const fittedScale = artwork.fit === "cover"
    ? Math.max(panelWidth / sourceWidth, panelHeight / sourceHeight)
    : Math.min(panelWidth / sourceWidth, panelHeight / sourceHeight);
  const artworkScale = Math.max(0.05, Number.isFinite(artwork.scale) ? artwork.scale : 1);
  const width = sourceWidth * fittedScale * artworkScale;
  const height = sourceHeight * fittedScale * artworkScale;
  const rotationDeg = Number.isFinite(artwork.rotationDeg) ? artwork.rotationDeg : 0;
  const radians = rotationDeg * Math.PI / 180;
  const halfExtentX = (Math.abs(Math.cos(radians)) * width
    + Math.abs(Math.sin(radians)) * height) * 0.5;
  const halfExtentY = (Math.abs(Math.sin(radians)) * width
    + Math.abs(Math.cos(radians)) * height) * 0.5;
  const requestedCentreX = panel.x + panelWidth * (0.5 + artwork.offsetX);
  const requestedCentreY = panel.y + panelHeight * (0.5 + artwork.offsetY);
  const centreX = constrainCentre(panel.x, panelWidth, halfExtentX, requestedCentreX);
  const centreY = constrainCentre(panel.y, panelHeight, halfExtentY, requestedCentreY);

  return {
    centreX,
    centreY,
    width,
    height,
    rotationDeg,
    offsetX: (centreX - (panel.x + panelWidth * 0.5)) / panelWidth,
    offsetY: (centreY - (panel.y + panelHeight * 0.5)) / panelHeight,
    halfExtentX,
    halfExtentY,
  };
}
