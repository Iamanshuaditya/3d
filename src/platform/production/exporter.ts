import type {
  NormalizedPrintJob,
  PreflightReport,
} from "@/lib/print/types";
import type { ProductionArtifactKind, ProductionArtifactMimeType } from "./types";

export type ProductionAssetBytes = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};

export type ProductionExportRequest = {
  job: NormalizedPrintJob;
  report: PreflightReport;
  resolveAsset: (assetId: string) => Promise<ProductionAssetBytes | null>;
};

export type ProductionExportResult = {
  bytes: Uint8Array;
  filename: string;
};

export interface ProductionExporter {
  readonly kind: ProductionArtifactKind;
  readonly mimeType: ProductionArtifactMimeType;
  supports(job: NormalizedPrintJob): boolean;
  export(request: ProductionExportRequest): Promise<ProductionExportResult>;
}
