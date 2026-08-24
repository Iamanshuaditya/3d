import type { CanonicalDieline } from "./vector-domain";
import type { StructuralPanel } from "./topology";

function n(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function gridPath(width: number, height: number, step: number): string {
  const commands: string[] = [];
  for (let x = step; x < width; x += step) {
    commands.push(`M ${n(x)} 0 V ${n(height)}`);
  }
  for (let y = step; y < height; y += step) {
    commands.push(`M 0 ${n(y)} H ${n(width)}`);
  }
  return commands.join(" ");
}

/**
 * Produces deliberately asymmetric full-sheet artwork for structural mapping
 * verification. The artwork is not manufacturing geometry and contains no cut
 * or crease strokes. Its job is to make UV mirroring, rotation, panel swaps,
 * seam jumps, and discontinuities obvious in flat and folded renders.
 */
export function createStructuralDiagnosticArtwork(
  dieline: CanonicalDieline,
  panels: readonly StructuralPanel[],
): string {
  const width = dieline.widthMm;
  const height = dieline.heightMm;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Diagnostic artwork requires positive finite dieline dimensions.");
  }

  const minimum = Math.min(width, height);
  const gridStep = minimum >= 250 ? 25 : Math.max(5, Math.floor(minimum / 10));
  const marker = Math.max(6, Math.min(18, minimum * 0.035));
  const margin = marker * 1.4;
  const titleSize = Math.max(8, Math.min(24, minimum * 0.045));
  const labelSize = Math.max(4, Math.min(10, minimum * 0.018));
  const lineWidth = Math.max(0.6, Math.min(2.2, minimum * 0.003));
  const sheetId = escapeXml(dieline.id);
  const sourceHash = escapeXml(dieline.source.sha256 ?? "NO_SOURCE_HASH");

  const panelLabels = panels
    .map((panel, index) => {
      const cx = (panel.bounds.minX + panel.bounds.maxX) / 2;
      const cy = (panel.bounds.minY + panel.bounds.maxY) / 2;
      const pw = panel.bounds.maxX - panel.bounds.minX;
      const ph = panel.bounds.maxY - panel.bounds.minY;
      const size = Math.max(3.2, Math.min(labelSize, Math.min(pw, ph) * 0.12));
      const id = escapeXml(panel.id);
      return [
        `<g id="diagnostic-panel-${index + 1}" data-panel-id="${id}">`,
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.max(1.8, size * 0.35))}" fill="#ffffff" stroke="#111827" stroke-width="${n(lineWidth * 0.65)}"/>`,
        `<text x="${n(cx)}" y="${n(cy - size * 0.8)}" text-anchor="middle" font-size="${n(size)}" font-family="ui-monospace, monospace" font-weight="700" fill="#111827">P${index + 1}</text>`,
        `<text x="${n(cx)}" y="${n(cy + size * 1.3)}" text-anchor="middle" font-size="${n(Math.max(2.8, size * 0.72))}" font-family="ui-monospace, monospace" fill="#111827">${id}</text>`,
        `<path d="M ${n(cx)} ${n(cy - size * 0.25)} v ${n(-size * 1.7)} l ${n(-size * 0.45)} ${n(size * 0.65)} m ${n(size * 0.45)} ${n(-size * 0.65)} l ${n(size * 0.45)} ${n(size * 0.65)}" fill="none" stroke="#111827" stroke-width="${n(lineWidth * 0.6)}"/>`,
        `</g>`,
      ].join("\n");
    })
    .join("\n");

  const lowerGuideY = height * 0.67;
  const upperGuideY = height * 0.21;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}mm" height="${n(height)}mm" viewBox="0 0 ${n(width)} ${n(height)}" preserveAspectRatio="none" data-dieline-id="${sheetId}" data-source-sha256="${sourceHash}">`,
    `<rect width="${n(width)}" height="${n(height)}" fill="#f8fafc"/>`,
    `<path d="${gridPath(width, height, gridStep)}" fill="none" stroke="#cbd5e1" stroke-width="${n(lineWidth * 0.3)}"/>`,
    `<path d="M 0 0 L ${n(width)} ${n(height)}" fill="none" stroke="#dc2626" stroke-width="${n(lineWidth * 1.8)}" stroke-dasharray="${n(marker * 0.8)} ${n(marker * 0.35)}"/>`,
    `<path d="M 0 ${n(lowerGuideY)} L ${n(width)} ${n(upperGuideY)}" fill="none" stroke="#2563eb" stroke-width="${n(lineWidth * 1.15)}"/>`,
    `<text x="${n(width / 2)}" y="${n(margin)}" text-anchor="middle" font-size="${n(titleSize)}" font-family="Arial, sans-serif" font-weight="800" fill="#111827">TOP / NORTH</text>`,
    `<text x="${n(width / 2)}" y="${n(height - margin * 0.55)}" text-anchor="middle" font-size="${n(titleSize * 0.72)}" font-family="Arial, sans-serif" font-weight="700" fill="#111827">BOTTOM / SOUTH</text>`,
    `<text x="${n(margin * 0.55)}" y="${n(height / 2)}" text-anchor="middle" font-size="${n(titleSize * 0.6)}" font-family="Arial, sans-serif" font-weight="700" fill="#111827" transform="rotate(-90 ${n(margin * 0.55)} ${n(height / 2)})">LEFT / WEST</text>`,
    `<text x="${n(width - margin * 0.55)}" y="${n(height / 2)}" text-anchor="middle" font-size="${n(titleSize * 0.6)}" font-family="Arial, sans-serif" font-weight="700" fill="#111827" transform="rotate(90 ${n(width - margin * 0.55)} ${n(height / 2)})">RIGHT / EAST</text>`,
    `<g id="diagnostic-corners" font-family="ui-monospace, monospace" font-size="${n(labelSize)}" font-weight="700" fill="#111827" stroke="#111827">`,
    `<circle cx="${n(margin)}" cy="${n(margin)}" r="${n(marker * 0.48)}" fill="#16a34a" stroke-width="${n(lineWidth)}"/>`,
    `<text x="${n(margin + marker)}" y="${n(margin + labelSize * 0.35)}" stroke="none">TL CIRCLE</text>`,
    `<rect x="${n(width - margin - marker * 0.55)}" y="${n(margin - marker * 0.55)}" width="${n(marker * 1.1)}" height="${n(marker * 1.1)}" fill="#f59e0b" stroke-width="${n(lineWidth)}"/>`,
    `<text x="${n(width - margin - marker)}" y="${n(margin + marker * 1.2)}" text-anchor="end" stroke="none">TR SQUARE</text>`,
    `<path d="M ${n(margin)} ${n(height - margin - marker * 0.65)} l ${n(marker * 0.65)} ${n(marker * 1.3)} h ${n(-marker * 1.3)} Z" fill="#7c3aed" stroke-width="${n(lineWidth)}"/>`,
    `<text x="${n(margin + marker)}" y="${n(height - margin)}" stroke="none">BL TRIANGLE</text>`,
    `<path d="M ${n(width - margin - marker * 0.55)} ${n(height - margin - marker * 0.55)} l ${n(marker * 1.1)} ${n(marker * 1.1)} M ${n(width - margin + marker * 0.55)} ${n(height - margin - marker * 0.55)} l ${n(-marker * 1.1)} ${n(marker * 1.1)}" fill="none" stroke="#0891b2" stroke-width="${n(lineWidth * 1.5)}"/>`,
    `<text x="${n(width - margin - marker)}" y="${n(height - margin + marker * 1.25)}" text-anchor="end" stroke="none">BR X</text>`,
    `</g>`,
    `<g id="diagnostic-sheet-origin" font-family="ui-monospace, monospace" font-size="${n(labelSize * 0.8)}" fill="#475569">`,
    `<text x="${n(margin)}" y="${n(margin * 2.2)}">SHEET X RIGHT / Y DOWN</text>`,
    `<text x="${n(margin)}" y="${n(margin * 2.2 + labelSize * 1.4)}">${n(width)} x ${n(height)} mm</text>`,
    `</g>`,
    panelLabels,
    `</svg>`,
    "",
  ].join("\n");
}
