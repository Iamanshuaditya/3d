import { EDITORIAL_PRODUCTS, type EditorialProduct } from "@/lib/editorial/products";
import { supportsManufacturingSvg } from "@/lib/print/manufacturing-geometry";
import { getProductCatalogService } from "./container";

export async function getEditorialCatalog(): Promise<EditorialProduct[]> {
  const catalog = getProductCatalogService();
  const visibleIds = new Set((await catalog.listDefinitions())
    .filter((definition) => definition.currentVersionId && definition.visibility === "public")
    .map((definition) => definition.id));
  const products = await Promise.all(EDITORIAL_PRODUCTS.filter((product) => visibleIds.has(product.id)).map(async product => {
    try {
      const {productConfig: config} = await catalog.resolve(product.id, null, {});
      return {...product, previewOnly: Boolean(config.previewOnly), outputs: config.previewOnly ? product.outputs : ["Print PDF", ...(supportsManufacturingSvg(config) ? ["Dieline SVG"] : []), "3D preview"]};
    } catch { return null; }
  }));
  return products.filter((product): product is EditorialProduct => product !== null);
}
