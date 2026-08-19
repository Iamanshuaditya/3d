import type { PrinterProfile } from "./types";

const ICC_SRGB2014 = {
  id: "icc-srgb2014",
  label: "ICC sRGB2014",
  components: 3,
  alternate: "DeviceRGB",
  source: { kind: "embedded-srgb2014" },
} as const;

const ICC_COATED_FOGRA39_VIGC_260 = {
  id: "icc-coated-fogra39l-vigc-260",
  label: "Coated Fogra39L VIGC 260",
  components: 4,
  alternate: "DeviceCMYK",
  source: {
    kind: "public-file",
    url: "/print-profiles/Coated_Fogra39L_VIGC_260.icc",
    byteLength: 8_652_444,
    sha256: "8decbce6c2efafdce11eca36571f5e22b5cb85418343a87d84c9289369e3519e",
  },
} as const;

/**
 * Generic color-managed PDF/X-4 handoff profile.
 * RGB artwork is tagged with the official ICC sRGB2014 output intent; a print
 * provider can replace this registry entry with its press ICC profile without
 * changing the renderer or any product adapter.
 */
export const PDFX4_SRGB_PACKAGING: PrinterProfile = {
  id: "pdfx4-srgb-packaging-v1",
  label: "PDF/X-4 color-managed packaging",
  approval: "generic",
  standard: "PDF/X-4",
  sourceIcc: ICC_SRGB2014,
  outputIcc: ICC_SRGB2014,
  outputConditionIdentifier: "sRGB2014 (ICC)",
  registryName: "https://www.color.org",
  artworkColorPolicy: "icc-managed-rgb",
  minimumBleedMm: 0,
  renderPpi: 300,
  minimumImagePpi: 200,
  warningImagePpi: 300,
  maximumRasterPixels: 100_000_000,
  pageBoxMode: "dieline",
  layers: {
    cut: {
      name: "Cutting",
      spotName: "CutContour",
      alternateCmyk: [0, 1, 0, 0],
      lineWidthMm: 0.18,
      overprint: true,
    },
    crease: {
      name: "Creasing",
      spotName: "Crease",
      alternateCmyk: [0, 0.85, 0.9, 0],
      lineWidthMm: 0.18,
      dashMm: [2.5, 1.5],
      overprint: true,
    },
  },
};

/**
 * A realistic, deliberately simulated folding-carton converter contract for
 * a white coated litho liner laminated to corrugated board. It does not claim
 * approval from a real factory. Replace `approval` only after a named
 * converter signs off a physical proof.
 */
export const VORTEX_CARTON_WORKS_COATED_OFFSET: PrinterProfile = {
  id: "vortex-carton-works-coated-offset-v1",
  label: "Vortex Carton Works - coated offset carton v1 (simulation)",
  approval: "simulated-company",
  standard: "PDF/X-4",
  sourceIcc: ICC_SRGB2014,
  outputIcc: ICC_COATED_FOGRA39_VIGC_260,
  outputConditionIdentifier: "FOGRA39",
  registryName: "https://registry.color.org/cmyk-registry/fogra39",
  artworkColorPolicy: "icc-managed-rgb",
  minimumBleedMm: 3,
  maximumTotalAreaCoveragePercent: 260,
  renderPpi: 300,
  minimumImagePpi: 250,
  warningImagePpi: 300,
  maximumRasterPixels: 100_000_000,
  pageBoxMode: "dieline",
  layers: {
    cut: {
      name: "Cutting",
      spotName: "CutContour",
      alternateCmyk: [0, 1, 0, 0],
      lineWidthMm: 0.15,
      overprint: true,
    },
    crease: {
      name: "Creasing",
      spotName: "Crease",
      alternateCmyk: [0, 0.6, 1, 0],
      lineWidthMm: 0.15,
      dashMm: [2.5, 1.5],
      overprint: true,
    },
  },
};

export const PRINTER_PROFILES: Record<string, PrinterProfile> = {
  [PDFX4_SRGB_PACKAGING.id]: PDFX4_SRGB_PACKAGING,
  [VORTEX_CARTON_WORKS_COATED_OFFSET.id]: VORTEX_CARTON_WORKS_COATED_OFFSET,
};

export const DEFAULT_PRINT_PROFILE_ID = PDFX4_SRGB_PACKAGING.id;

export function getPrinterProfile(id?: string): PrinterProfile {
  return PRINTER_PROFILES[id ?? DEFAULT_PRINT_PROFILE_ID] ?? PDFX4_SRGB_PACKAGING;
}
