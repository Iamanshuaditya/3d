import { getVortexDatabase } from "@/server/persistence/database";
import { getProjectService } from "@/server/projects/container";
import { getProductCatalogService } from "@/server/products/container";
import { getObjectStore } from "@/server/storage/container";
import { SqliteTemplateAssetRepository } from "./sqlite-template-asset-repository";
import { TemplateAssetService } from "./template-asset-service";
import { SqliteTemplateCatalogRepository } from "./sqlite-template-catalog-repository";
import { TemplateCatalogService } from "./template-catalog-service";
import { TemplateService } from "./template-service";

let catalogue: TemplateCatalogService | null = null;
let service: TemplateService | null = null;
let assetService: TemplateAssetService | null = null;

export function getTemplateAssetService() {
  if (assetService) return assetService;
  assetService = new TemplateAssetService(
    new SqliteTemplateAssetRepository(getVortexDatabase()),
    getObjectStore(),
  );
  return assetService;
}

export function getTemplateCatalogService() {
  catalogue ??= new TemplateCatalogService(
    new SqliteTemplateCatalogRepository(getVortexDatabase()),
    getProductCatalogService(),
    getTemplateAssetService(),
  );
  return catalogue;
}

export function getTemplateService() {
  service ??= new TemplateService(
    getTemplateCatalogService(),
    getProductCatalogService(),
    getProjectService(),
    getTemplateAssetService(),
  );
  return service;
}
