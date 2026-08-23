import type { PreflightReport } from "@/lib/print/types";

export type ProductionArtifactKind = "pdf";
export type ProductionArtifactMimeType = "application/pdf";

/** Immutable metadata for bytes generated from one exact project revision. */
export type ProductionArtifact = {
  id: string;
  projectId: string;
  projectRevision: number;
  productVersionId: string;
  configurationId: string;
  kind: ProductionArtifactKind;
  mimeType: ProductionArtifactMimeType;
  filename: string;
  byteSize: number;
  sha256: string;
  /** Server-only object-store key. */
  storageKey: string;
  preflightReport: PreflightReport;
  createdAt: string;
};

export type ProductionArtifactDto = Omit<ProductionArtifact, "storageKey"> & {
  downloadUrl: string;
};

export type ProductionPreflightDto = {
  projectId: string;
  projectRevision: number;
  productVersionId: string;
  configurationId: string;
  report: PreflightReport;
};

export type CreateProductionArtifactInput = ProductionArtifact;

export type CreateProductionArtifactResult = {
  artifact: ProductionArtifact;
  created: boolean;
};

