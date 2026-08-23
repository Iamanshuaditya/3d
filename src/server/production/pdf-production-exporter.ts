import { generateProductionPdf } from "@/lib/print/generate-production-pdf";
import type { ProductionExporter } from "@/platform/production/exporter";
import { createServerIccProfileLoader } from "./server-icc-profile";
import { createServerProductionArtworkRenderer } from "./server-production-artwork";

export class PdfProductionExporter implements ProductionExporter {
  readonly kind = "pdf" as const;
  readonly mimeType = "application/pdf" as const;
  private readonly loadProfile = createServerIccProfileLoader();

  async export(request: Parameters<ProductionExporter["export"]>[0]) {
    const result = await generateProductionPdf(request.job, {
      preflightReport: request.report,
      loadProfile: this.loadProfile,
      renderArtwork: createServerProductionArtworkRenderer({
        resolveAsset: request.resolveAsset,
        maximumRasterPixels: request.job.profile.maximumRasterPixels,
      }),
    });
    return { bytes: result.bytes, filename: result.fileName };
  }
}
