import type { ProductProvenanceDiagnostics } from "@/lib/provenance/diagnostics";

export type ProductValidationIssueDto = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

export type ProductOperationsItemDto = {
  id: string;
  name: string;
  visibility: "public" | "unlisted";
  status: "draft" | "published";
  currentVersionId: string | null;
  versions: Array<{
    id: string;
    version: number;
    publishedAt: string;
    current: boolean;
    resolutionKind: "static" | "provider";
  }>;
  defaultConfigurationId: string | null;
  optionCount: number;
  surfaceCount: number | null;
  manufacturingFormats: Array<"pdf" | "svg">;
  inspectUrl: string | null;
  /** Manufacturing-fact provenance for the default configuration (#24). */
  provenance: ProductProvenanceDiagnostics | null;
  validation: {
    passed: boolean;
    issues: ProductValidationIssueDto[];
  };
};
