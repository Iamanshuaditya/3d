import { getVortexDatabase } from "@/server/persistence/database";
import { ProductCatalogService } from "./product-catalog-service";
import { ProductApiService } from "./product-api-service";
import { ProductOperationsService } from "./product-operations-service";
import { SqliteProductCatalogRepository } from "./sqlite-product-catalog-repository";

let singleton: ProductCatalogService | null = null;
let api: ProductApiService | null = null;
let operations: ProductOperationsService | null = null;

export function getProductCatalogService() {
  singleton ??= new ProductCatalogService(
    new SqliteProductCatalogRepository(getVortexDatabase()),
  );
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
