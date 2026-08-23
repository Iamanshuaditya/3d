import { getVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { getProductCatalogService } from "@/server/products/container";
import { getObjectStore } from "@/server/storage/container";
import { ProjectService } from "./project-service";

let singleton: ProjectService | null = null;

export function getProjectService() {
  if (singleton) return singleton;
  singleton = new ProjectService(
    new SqliteProjectRepository(getVortexDatabase()),
    getObjectStore(),
    undefined,
    undefined,
    getProductCatalogService(),
  );
  return singleton;
}
