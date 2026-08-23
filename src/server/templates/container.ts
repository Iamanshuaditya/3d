import { getVortexDatabase } from "@/server/persistence/database";
import { getProjectService } from "@/server/projects/container";
import { getProductCatalogService } from "@/server/products/container";
import { getObjectStore } from "@/server/storage/container";
import { SqliteTemplateAssetRepository } from "./sqlite-template-asset-repository";
import { TemplateAssetService } from "./template-asset-service";
import { SqliteTemplateCatalogRepository } from "./sqlite-template-catalog-repository";
import { TemplateCatalogService } from "./template-catalog-service";
import { TemplateService } from "./template-service";
import { TemplateDraftService } from "./template-draft-service";
import { SqliteTemplateDraftRepository } from "./sqlite-template-draft-repository";

let catalogue: TemplateCatalogService | null = null;
let service: TemplateService | null = null;
let assetService: TemplateAssetService | null = null;
let draftService: TemplateDraftService | null = null;

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

export function getTemplateDraftService() {
  draftService ??= new TemplateDraftService(
    new SqliteTemplateDraftRepository(getVortexDatabase()),
    new SqliteTemplateCatalogRepository(getVortexDatabase()),
    getTemplateCatalogService(),
  );
  return draftService;
}
