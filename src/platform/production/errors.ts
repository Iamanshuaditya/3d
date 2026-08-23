import type { PreflightReport } from "@/lib/print/types";
import { PlatformError } from "@/platform/projects/errors";

export class ProductionPreflightError extends PlatformError {
  constructor(report: PreflightReport) {
    super(
      "PRODUCTION_PREFLIGHT_FAILED",
      "Production preflight failed. Resolve the reported issues before generating artwork.",
      422,
      { report },
    );
  }
}

