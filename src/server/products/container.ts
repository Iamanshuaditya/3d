import { getVortexDatabase } from "@/server/persistence/database";
import { ProductCatalogService } from "./product-catalog-service";
import { SqliteProductCatalogRepository } from "./sqlite-product-catalog-repository";

let singleton: ProductCatalogService | null = null;

export function getProductCatalogService() {
  singleton ??= new ProductCatalogService(
    new SqliteProductCatalogRepository(getVortexDatabase()),
  );
  return singleton;
}
