import { getVortexDatabase } from "@/server/persistence/database";
import { ProductCatalogService } from "./product-catalog-service";
import { ProductApiService } from "./product-api-service";
import { ProductOperationsService } from "./product-operations-service";
import { ProductPublishingService } from "./product-publishing-service";
import { SqliteProductCatalogRepository } from "./sqlite-product-catalog-repository";

let repository: SqliteProductCatalogRepository | null = null;
let singleton: ProductCatalogService | null = null;
let api: ProductApiService | null = null;
let operations: ProductOperationsService | null = null;
let publishing: ProductPublishingService | null = null;

function getProductRepository() {
  repository ??= new SqliteProductCatalogRepository(getVortexDatabase());
  return repository;
}

export function getProductCatalogService() {
  singleton ??= new ProductCatalogService(getProductRepository());
  return singleton;
}

export function getProductApiService() {
  api ??= new ProductApiService(getProductCatalogService());
  return api;
}

export function getProductOperationsService() {
  operations ??= new ProductOperationsService(getProductCatalogService());
  return operations;
}

/** Internal service. Callers must supply an identity from a trusted operator auth adapter. */
export function getProductPublishingService() {
  publishing ??= new ProductPublishingService(
    getProductCatalogService(),
    getProductRepository(),
  );
  return publishing;
}
