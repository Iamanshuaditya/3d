import { getVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { getProductCatalogService } from "@/server/products/container";
import { getObjectStore } from "@/server/storage/container";
import { PdfProductionExporter } from "./pdf-production-exporter";
import { ProductionService } from "./production-service";
import { SqliteProductionArtifactRepository } from "./sqlite-production-artifact-repository";
import { SvgProductionExporter } from "./svg-production-exporter";

let singleton: ProductionService | null = null;

export function getProductionService() {
  if (singleton) return singleton;
  const database = getVortexDatabase();
  singleton = new ProductionService(
    new SqliteProjectRepository(database),
    new SqliteProductionArtifactRepository(database),
    getObjectStore(),
    getProductCatalogService(),
    [new PdfProductionExporter(), new SvgProductionExporter()],
  );
  return singleton;
}
