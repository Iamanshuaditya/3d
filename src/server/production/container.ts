import { join } from "node:path";
import { getVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { getProductCatalogService } from "@/server/products/container";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import { PdfProductionExporter } from "./pdf-production-exporter";
import { ProductionService } from "./production-service";
import { SqliteProductionArtifactRepository } from "./sqlite-production-artifact-repository";

let singleton: ProductionService | null = null;

export function getProductionService() {
  if (singleton) return singleton;
  const database = getVortexDatabase();
  const dataRoot = process.env.VORTEX_DATA_DIR || join(process.cwd(), ".data");
  singleton = new ProductionService(
    new SqliteProjectRepository(database),
    new SqliteProductionArtifactRepository(database),
    new FilesystemObjectStore(join(dataRoot, "objects")),
    getProductCatalogService(),
    [new PdfProductionExporter()],
  );
  return singleton;
}

