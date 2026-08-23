import {
  normalizeManufacturingGeometry,
  supportsManufacturingSvg,
} from "@/lib/print/manufacturing-geometry";
import { generateManufacturingSvg } from "@/lib/print/generate-manufacturing-svg";
import type { ProductionExporter } from "@/platform/production/exporter";

export class SvgProductionExporter implements ProductionExporter {
  readonly kind = "svg" as const;
  readonly mimeType = "image/svg+xml" as const;

  supports(job: Parameters<ProductionExporter["supports"]>[0]) {
    if (!supportsManufacturingSvg(job.product)) return false;
    try {
      normalizeManufacturingGeometry(job);
      return true;
    } catch {
      return false;
    }
  }

  async export(request: Parameters<ProductionExporter["export"]>[0]) {
    const geometry = normalizeManufacturingGeometry(request.job);
    const source = generateManufacturingSvg(geometry, request.job.profile);
    return {
      bytes: new TextEncoder().encode(source),
      filename: `${request.job.product.id}-dieline.svg`,
    };
  }
}
