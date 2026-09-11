import { generateProductionPdf } from "@/lib/print/generate-production-pdf";
import { supportsManufacturingSvg } from "@/lib/print/manufacturing-geometry";
import { resolveCartonSpec } from "@/lib/configurator/carton-spec";
import type { ProductionExporter } from "@/platform/production/exporter";
import { createServerIccProfileLoader } from "./server-icc-profile";
import { createServerProductionArtworkRenderer } from "./server-production-artwork";

export class PdfProductionExporter implements ProductionExporter {
  readonly kind = "pdf" as const;
  readonly mimeType = "application/pdf" as const;
  private readonly loadProfile = createServerIccProfileLoader();

  supports(job: Parameters<ProductionExporter["supports"]>[0]) {
    return !job.product.previewOnly &&
      (!resolveCartonSpec(job.product) || supportsManufacturingSvg(job.product));
  }

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
