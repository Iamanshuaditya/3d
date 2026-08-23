import { getVortexDatabase } from "@/server/persistence/database";
import { getProductCatalogService } from "@/server/products/container";
import { getObjectStore } from "@/server/storage/container";
import {
  getTemplateAssetService,
  getTemplateCatalogService,
} from "@/server/templates/container";
import { PersonalizationRunner } from "./personalization-runner";
import { PersonalizationService } from "./personalization-service";
import { SqlitePersonalizationRepository } from "./sqlite-personalization-repository";

let singleton: PersonalizationService | null = null;

export function getPersonalizationService() {
  if (singleton) return singleton;
  const repository = new SqlitePersonalizationRepository(getVortexDatabase());
  const objectStore = getObjectStore();
  const service = new PersonalizationService(
    repository,
    objectStore,
    getTemplateCatalogService(),
    getProductCatalogService(),
    getTemplateAssetService(),
  );
  const runner = new PersonalizationRunner(
    repository,
    objectStore,
    getTemplateCatalogService(),
    (datasetId) => service.loadDataset(datasetId),
  );
  service.attachRunner(runner);
  singleton = service;
  void service.recover().catch((error) => {
    console.error(JSON.stringify({
      scope: "vortex-platform",
      event: "personalization.recovery-failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }));
  });
  return service;
}
