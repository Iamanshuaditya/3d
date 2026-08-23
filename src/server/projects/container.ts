import { join } from "node:path";
import { getVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import { getProductCatalogService } from "@/server/products/container";
import { ProjectService } from "./project-service";

let singleton: ProjectService | null = null;

export function getProjectService() {
  if (singleton) return singleton;
  const dataRoot = process.env.VORTEX_DATA_DIR || join(process.cwd(), ".data");
  singleton = new ProjectService(
    new SqliteProjectRepository(getVortexDatabase()),
    new FilesystemObjectStore(join(dataRoot, "objects")),
    undefined,
    undefined,
    getProductCatalogService(),
  );
  return singleton;
}
