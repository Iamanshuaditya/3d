import type { CanonicalDieline } from "./vector-domain";
import { flattenVectorPath } from "./vector-math";

/**
 * Renders the canonical 2D reference view: the exact source cut/crease linework
 * drawn over the generated diagnostic artwork, in true sheet millimetres.
 *
 * This is the `01-flat-2d` capture. It is a verification view, not artwork and
 * not manufacturing output — the 3D flat pose must reproduce this same outline.
 */
export type CanonicalSheetViewOptions = Readonly<{
  /** Full-sheet diagnostic artwork SVG, as produced for mapping verification. */
  artworkSvg: string;
  /** Draw the technical cut/crease overlay. */
  showLinework?: boolean;
}>;

const CUT_OPERATIONS = new Set(["cut", "window-cut"]);
const CREASE_OPERATIONS = new Set(["crease", "score", "half-cut", "perforation"]);

function n(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * Prepares the artwork SVG for nesting inside the outer sheet <svg>.
 *
 * The standalone artwork declares its size in physical millimetres. Nested, it
 * must instead occupy exactly the parent's user-unit box, otherwise the browser
 * resolves `mm` against CSS pixels and the artwork renders ~3.8x oversized.
 */
function inlineArtwork(artworkSvg: string, width: number, height: number): string {
  const withoutProlog = artworkSvg.replace(/<\?xml[^>]*\?>\s*/i, "").trim();
  return withoutProlog.replace(
    /^<svg\b[^>]*>/i,
    (openTag) =>
      openTag
        .replace(/\s+width="[^"]*"/i, "")
        .replace(/\s+height="[^"]*"/i, "")
        .replace(/^<svg/i, `<svg x="0" y="0" width="${n(width)}" height="${n(height)}"`),
  );
}

function polylinePath(points: readonly { x: number; y: number }[], closed: boolean): string {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  const body = rest.map((point) => `L ${n(point.x)} ${n(point.y)}`).join(" ");
  return `M ${n(first.x)} ${n(first.y)} ${body}${closed ? " Z" : ""}`;
}

export function createCanonicalSheetSvg(
  dieline: CanonicalDieline,
  options: CanonicalSheetViewOptions,
): string {
  const width = dieline.widthMm;
  const height = dieline.heightMm;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Canonical sheet view requires positive finite dieline dimensions.");
  }
  const showLinework = options.showLinework ?? true;
  const strokeWidth = Math.max(0.4, Math.min(1.4, Math.min(width, height) * 0.0022));

  const cutPaths: string[] = [];
  const creasePaths: string[] = [];
  for (const entity of dieline.entities) {
    const flattened = flattenVectorPath(entity.path, dieline.tolerances.curveFlatteningMm);
    const command = polylinePath(flattened.points, flattened.closed);
    if (!command) continue;
    if (CUT_OPERATIONS.has(entity.operation)) cutPaths.push(command);
    else if (CREASE_OPERATIONS.has(entity.operation)) creasePaths.push(command);
  }

  const linework = showLinework
    ? [
        `<g id="canonical-crease-linework" fill="none" stroke="#dc2626" stroke-width="${n(strokeWidth)}" stroke-dasharray="${n(strokeWidth * 6)} ${n(strokeWidth * 4)}" stroke-linecap="round">`,
        ...creasePaths.map((command) => `<path d="${command}"/>`),
        `</g>`,
        `<g id="canonical-cut-linework" fill="none" stroke="#1d4ed8" stroke-width="${n(strokeWidth * 1.35)}" stroke-linejoin="round" stroke-linecap="round">`,
        ...cutPaths.map((command) => `<path d="${command}"/>`),
        `</g>`,
      ].join("\n")
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" data-canonical-sheet="${dieline.id}">`,
    `<g id="canonical-sheet-artwork">`,
    inlineArtwork(options.artworkSvg, width, height),
    `</g>`,
    linework,
    `</svg>`,
    "",
  ].join("\n");
}

export function countCanonicalSheetLinework(dieline: CanonicalDieline): Readonly<{
  cutPathCount: number;
  creasePathCount: number;
}> {
  let cutPathCount = 0;
  let creasePathCount = 0;
  for (const entity of dieline.entities) {
    if (CUT_OPERATIONS.has(entity.operation)) cutPathCount += 1;
    else if (CREASE_OPERATIONS.has(entity.operation)) creasePathCount += 1;
  }
  return { cutPathCount, creasePathCount };
}
