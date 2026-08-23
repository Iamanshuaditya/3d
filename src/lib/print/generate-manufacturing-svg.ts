import type { PrinterProfile } from "./types";
import type {
  ManufacturingGeometry,
  ManufacturingOperation,
  ManufacturingPath,
} from "./manufacturing-geometry";

const STYLE: Record<ManufacturingOperation, { stroke: string; dash?: string }> = {
  cut: { stroke: "#ff00a8" },
  crease: { stroke: "#ff6a00", dash: "2.5 1.5" },
  bleed: { stroke: "#16a36a", dash: "3 2" },
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decimal(value: number) {
  return Number(value.toFixed(4)).toString();
}

function pathData(path: ManufacturingPath) {
  const [first, ...rest] = path.points;
  return [
    `M ${decimal(first.xMm)} ${decimal(first.yMm)}`,
    ...rest.map((point) => `L ${decimal(point.xMm)} ${decimal(point.yMm)}`),
    ...(path.closed ? ["Z"] : []),
  ].join(" ");
}

/** Deterministic, unit-explicit structural SVG with semantic operation groups. */
export function generateManufacturingSvg(
  geometry: ManufacturingGeometry,
  profile: PrinterProfile,
) {
  if (geometry.sheets.length !== 1) {
    throw new Error("One SVG artifact can contain exactly one manufacturing sheet.");
  }
  const sheet = geometry.sheets[0];
  const metadata = escapeXml(JSON.stringify({
    generator: "Vortex Manufacturing Exporter",
    version: 1,
    units: geometry.units,
    productId: geometry.productId,
    productVersionId: geometry.productVersionId,
    configurationId: geometry.configurationId,
    surfaceId: sheet.surfaceId,
    widthMm: sheet.widthMm,
    heightMm: sheet.heightMm,
  }));
  const groups = (["cut", "crease", "bleed"] as const).map((operation) => {
    const style = STYLE[operation];
    const lineWidth = operation === "cut"
      ? profile.layers.cut.lineWidthMm
      : operation === "crease"
        ? profile.layers.crease.lineWidthMm
        : 0.15;
    const paths = sheet.paths
      .filter((candidate) => candidate.operation === operation)
      .map((candidate, index) =>
        `    <path id="${operation}-${index + 1}" d="${pathData(candidate)}"/>`,
      )
      .join("\n");
    return `  <g id="${operation}" data-operation="${operation}" fill="none" stroke="${style.stroke}" stroke-width="${decimal(lineWidth)}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ""} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">\n${paths}\n  </g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${decimal(sheet.widthMm)}mm" height="${decimal(sheet.heightMm)}mm" viewBox="0 0 ${decimal(sheet.widthMm)} ${decimal(sheet.heightMm)}">
  <title>${escapeXml(`${geometry.productId} ${sheet.label} manufacturing dieline`)}</title>
  <metadata>${metadata}</metadata>
${groups.join("\n")}
</svg>
`;
}
