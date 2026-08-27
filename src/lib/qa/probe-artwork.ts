/**
 * Deterministic benchmark artwork.
 *
 * Every mark is asymmetric on both axes, so a mirrored face, a 180-degree back
 * rotation and an axis swap each produce a visibly different image rather than
 * a plausible one. Nothing here is random or time-dependent: the same inputs
 * always yield the same bytes, which is what makes screenshot diffs meaningful.
 */

export type ProbeArtworkKind = "chirality-probe" | "dark-flood" | "none";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const PROBE_ARTWORK_PIXELS = Object.freeze({ width: 1200, height: 800 });

function chiralityProbeSvg(label: string): string {
  const { width, height } = PROBE_ARTWORK_PIXELS;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#f2efe8"/>`,
    // A wedge that points right: mirroring turns it to point left.
    `<path d="M 80 120 L 520 120 L 700 400 L 520 680 L 80 680 Z" fill="#1f4fd8"/>`,
    // An L in the top-left only: rotation moves it to a different corner.
    `<path d="M 80 60 L 300 60 L 300 100 L 120 100 L 120 240 L 80 240 Z" fill="#d81f4f"/>`,
    // A single dot low-right: the only mark in that quadrant.
    `<circle cx="${width - 120}" cy="${height - 110}" r="46" fill="#1f8f5f"/>`,
    // Readable text: the fastest human check for mirroring.
    `<text x="760" y="420" font-family="Helvetica, Arial, sans-serif" font-size="88"`,
    ` font-weight="700" fill="#101010">${escapeXml(label)}</text>`,
    `<text x="760" y="500" font-family="Helvetica, Arial, sans-serif" font-size="40"`,
    ` fill="#404040">TOP LEFT IS RED</text>`,
    `</svg>`,
  ].join("");
}

function darkFloodSvg(label: string): string {
  const { width, height } = PROBE_ARTWORK_PIXELS;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#0d0f12"/>`,
    // Near-black on near-black: only survives correct exposure and tone mapping.
    `<rect x="70" y="70" width="${width - 140}" height="${height - 140}" fill="none"`,
    ` stroke="#2a2f36" stroke-width="8"/>`,
    `<path d="M 120 160 L 480 160 L 620 400 L 480 640 L 120 640 Z" fill="#161a20"/>`,
    `<circle cx="${width - 150}" cy="${height - 140}" r="40" fill="#3d444e"/>`,
    `<text x="700" y="420" font-family="Helvetica, Arial, sans-serif" font-size="80"`,
    ` font-weight="700" fill="#e8e4dc">${escapeXml(label)}</text>`,
    `</svg>`,
  ].join("");
}

export function probeArtworkSvg(kind: ProbeArtworkKind, label: string): string | null {
  if (kind === "none") return null;
  return kind === "dark-flood" ? darkFloodSvg(label) : chiralityProbeSvg(label);
}

/** Inline data URI so a capture never depends on network or asset storage. */
export function probeArtworkDataUri(kind: ProbeArtworkKind, label: string): string | null {
  const svg = probeArtworkSvg(kind, label);
  if (svg === null) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
