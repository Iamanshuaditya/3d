import { getVortexDatabase } from "@/server/persistence/database";
import { getProjectService } from "@/server/projects/container";
import { getProductCatalogService } from "@/server/products/container";
import { SqliteTemplateCatalogRepository } from "./sqlite-template-catalog-repository";
import { TemplateCatalogService } from "./template-catalog-service";
import { TemplateService } from "./template-service";

let catalogue: TemplateCatalogService | null = null;
let service: TemplateService | null = null;

export function getTemplateCatalogService() {
  catalogue ??= new TemplateCatalogService(
    new SqliteTemplateCatalogRepository(getVortexDatabase()),
    getProductCatalogService(),
  );
  return catalogue;
}

export function getTemplateService() {
  service ??= new TemplateService(
    getTemplateCatalogService(),
    getProductCatalogService(),
    getProjectService(),
  );
  return service;
}
