import type { DesignDocument, ProductConfig } from "@/types/configurator";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import { getPrinterProfile } from "./printer-profiles";
import type { NormalizedPrintJob } from "./types";

export function normalizePrintJob(
  product: ProductConfig,
  design: DesignDocument,
): NormalizedPrintJob {
  return {
    product,
    design,
    profile: getPrinterProfile(product.printProfileId),
    surfaces: product.editableSurfaces.map((surface) => ({
      surface,
      design: design.surfaces[surface.id] ?? { elements: [], background: null },
      dieline: resolveSurfaceDieline(product, surface),
    })),
  };
}
