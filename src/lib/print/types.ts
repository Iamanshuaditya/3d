import type {
  DesignDocument,
  EditableSurface,
  ProductConfig,
  SurfaceDesign,
  SurfaceDieline,
} from "@/types/configurator";

export type PdfProductionStandard = "PDF/X-4";

export type TechnicalLayerProfile = {
  name: string;
  spotName: string;
  alternateCmyk: [number, number, number, number];
  lineWidthMm: number;
  dashMm?: number[];
  overprint: boolean;
};

export type IccProfileDefinition = {
  id: string;
  label: string;
  components: 3 | 4;
  alternate: "DeviceRGB" | "DeviceCMYK";
  source:
    | { kind: "embedded-srgb2014" }
    | {
        kind: "public-file";
        url: string;
        byteLength: number;
        sha256: string;
      };
};

/** A reusable press contract. Product configs only reference this by id. */
export type PrinterProfile = {
  id: string;
  label: string;
  approval: "generic" | "simulated-company" | "factory-approved";
  standard: PdfProductionStandard;
  sourceIcc: IccProfileDefinition;
  outputIcc: IccProfileDefinition;
  outputConditionIdentifier: string;
  registryName: string;
  artworkColorPolicy: "icc-managed-rgb";
  minimumBleedMm: number;
  maximumTotalAreaCoveragePercent?: number;
  renderPpi: number;
  minimumImagePpi: number;
  warningImagePpi: number;
  maximumRasterPixels: number;
  pageBoxMode: "dieline" | "rectangular-trim";
  layers: {
    cut: TechnicalLayerProfile;
    crease: TechnicalLayerProfile;
  };
};

export type NormalizedPrintSurface = {
  surface: EditableSurface;
  design: SurfaceDesign;
  dieline: SurfaceDieline;
};

export type NormalizedPrintJob = {
  product: ProductConfig;
  design: DesignDocument;
  profile: PrinterProfile;
  surfaces: NormalizedPrintSurface[];
};

export type PreflightSeverity = "error" | "warning" | "info";

export type PreflightIssue = {
  code: string;
  severity: PreflightSeverity;
  message: string;
  surfaceId?: string;
  elementId?: string;
};

export type PreflightReport = {
  engine: "Vortex Print Engine";
  engineVersion: "1.0";
  profileId: string;
  standard: PdfProductionStandard;
  createdAt: string;
  passed: boolean;
  issues: PreflightIssue[];
  checks: {
    name: string;
    passed: boolean;
    detail: string;
  }[];
};

export type RasterizedPrintSurface = NormalizedPrintSurface & {
  artworkPng?: Uint8Array;
  rasterWidth: number;
  rasterHeight: number;
};

export type ProductionPdfResult = {
  bytes: Uint8Array;
  fileName: string;
  report: PreflightReport;
};
