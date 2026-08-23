import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { PRODUCTS, getProduct } from "@/lib/configurator/product-config";
import { PlatformError } from "@/platform/projects/errors";
import type {
  ProductDefinition,
  ProductDefinitionSnapshot,
  ProductVersion,
} from "@/platform/products/types";
import { openVortexDatabase } from "@/server/persistence/database";
import { ProductApiService } from "@/server/products/product-api-service";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { ProductOperationsService } from "@/server/products/product-operations-service";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";

function fixture(t: TestContext, withCodeCatalog = true) {
  const database = openVortexDatabase(":memory:");
  const catalog = withCodeCatalog
    ? new ProductCatalogService(new SqliteProductCatalogRepository(database))
    : new ProductCatalogService(
        new SqliteProductCatalogRepository(database),
        {},
        {},
        {},
      );
  t.after(() => database.close());
  return {
    catalog,
    api: new ProductApiService(catalog),
    operations: new ProductOperationsService(catalog),
  };
}

test("public product DTOs omit engine, provider, and storage internals", async (t) => {
  const { api } = fixture(t);
  const products = await api.list();
  const expected = Object.values(PRODUCTS).filter((product) => !product.hidden);

  assert.equal(products.length, expected.length);
  assert.deepEqual(
    products.map((product) => product.name),
    products.map((product) => product.name).toSorted(),
  );
  assert.ok(products.some((product) => product.id === "mailer-box-001"));
  assert.ok(products.every((product) => product.visibility === "public"));

  const detail = await api.get("mailer-box-001");
  const serialized = JSON.stringify({ products, detail });
  for (const internalKey of [
    "modelUrl",
    "meshName",
    "cartonSpec",
    "providerId",
    "productionValue",
    "storageKey",
    "iccProfileUrl",
  ]) {
    assert.equal(serialized.includes(`\"${internalKey}\"`), false, internalKey);
  }

  assert.equal(detail.currentVersion.id, "mailer-box-001@3");
  assert.equal(detail.selectedVersion.current, true);
  assert.equal(detail.links.quotes, "/api/v1/products/mailer-box-001/quotes");
  assert.equal(detail.capabilities.parameterizedDimensions, true);
  assert.deepEqual(
    detail.options.map((option) => option.id),
    ["length", "width", "depth", "board_thickness"],
  );

  const hidden = Object.values(PRODUCTS).find((product) => product.hidden);
  assert.ok(hidden);
  await assert.rejects(
    () => api.get(hidden.id),
    (error) => error instanceof PlatformError && error.status === 404,
  );
  await assert.rejects(
    () => api.resolve(hidden.id, null, {}),
    (error) => error instanceof PlatformError && error.status === 404,
  );
});

test("public resolution returns one safe authoritative mailer configuration", async (t) => {
  const { api } = fixture(t);
  const configuration = await api.resolve("mailer-box-001", null, {
    length: 200,
    width: 150,
    depth: 70,
    board_thickness: 1.5,
  });

  assert.equal(configuration.productVersionId, "mailer-box-001@3");
  assert.equal(configuration.presentation.mode, "packaging");
  assert.equal(configuration.capabilities.unfolding, true);
  assert.equal(configuration.surfaces.length, 1);
  assert.deepEqual(configuration.surfaces[0].physical, {
    widthMm: 356,
    heightMm: 568,
    displayUnit: "cm",
  });
  assert.deepEqual(configuration.production.formats, ["pdf", "svg"]);
  assert.equal(configuration.links.quotes, "/api/v1/products/mailer-box-001/quotes");
  assert.match(configuration.links.studio, /^\/studio\?/);
  assert.match(configuration.links.templates, /^\/templates\?/);
  assert.equal(JSON.stringify(configuration).includes("LID_TOP"), false);

  await assert.rejects(
    () => api.resolve("mailer-box-001", null, {
      length: 200,
      width: 150,
      depth: 80,
      board_thickness: 1.5,
    }),
    (error) =>
      error instanceof PlatformError &&
      error.status === 400 &&
      error.code === "CONFIGURATION_UNMANUFACTURABLE",
  );
  await assert.rejects(
    () => api.resolve("mailer-box-001", null, []),
    (error) =>
      error instanceof PlatformError &&
      error.status === 400 &&
      error.code === "OPTION_SELECTION_INVALID",
  );
});

test("database-authored public products are discoverable without a registry entry", async (t) => {
  const { catalog, api } = fixture(t, false);
  const source = getProduct("tshirt");
  assert.ok(source);
  const productId = "database-authored-product";
  const publishedAt = "2026-08-23T17:00:00.000Z";
  const snapshot: ProductDefinitionSnapshot = {
    name: "Database Authored Product",
    options: [],
    presentation: { mode: "garment" },
    capabilities: {
      multiSurface: false,
      embroideryPreview: true,
      unfolding: false,
      parameterizedDimensions: false,
      templates: false,
    },
    templateCompatibility: [productId],
  };
  const version: ProductVersion = {
    id: `${productId}@1`,
    productId,
    version: 1,
    status: "published",
    definition: structuredClone(snapshot),
    resolution: {
      kind: "static",
      productConfig: {
        ...structuredClone(source),
        id: productId,
        name: snapshot.name,
      },
    },
    publishedAt,
  };
  const definition: ProductDefinition = {
    id: productId,
    status: "published",
    visibility: "public",
    currentVersionId: version.id,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    ...structuredClone(snapshot),
  };
  await catalog.publish(definition, version);

  assert.deepEqual((await api.list()).map((product) => product.id), [productId]);
  assert.equal((await api.get(productId)).currentVersion.id, version.id);
  assert.equal((await api.resolve(productId, version.id, {})).productId, productId);
});

test("operator catalogue resolves and validates every current code product", async (t) => {
  const { operations } = fixture(t);
  const products = await operations.list();

  assert.equal(products.length, Object.keys(PRODUCTS).length);
  assert.ok(products.every((product) => product.currentVersionId));
  assert.ok(products.every((product) => product.versions.length >= 1));
  assert.ok(products.every((product) => product.validation.passed));
  assert.ok(products.every((product) => product.validation.issues.length === 0));
  assert.deepEqual(
    products.find((product) => product.id === "mailer-box-001")?.manufacturingFormats,
    ["pdf", "svg"],
  );
});

test("operator validation fails closed for an invalid resolved engine contract", async (t) => {
  const { catalog, operations } = fixture(t, false);
  const source = getProduct("tshirt");
  assert.ok(source);
  const productId = "broken-glb";
  const publishedAt = "2026-08-23T18:00:00.000Z";
  const snapshot: ProductDefinitionSnapshot = {
    name: "Broken GLB",
    options: [],
    presentation: { mode: "garment" },
    capabilities: {
      multiSurface: true,
      embroideryPreview: true,
      unfolding: false,
      parameterizedDimensions: false,
      templates: false,
    },
    templateCompatibility: [productId],
  };
  const version: ProductVersion = {
    id: `${productId}@1`,
    productId,
    version: 1,
    status: "published",
    definition: structuredClone(snapshot),
    resolution: {
      kind: "static",
      productConfig: {
        ...structuredClone(source),
        id: productId,
        name: snapshot.name,
        modelUrl: "",
      },
    },
    publishedAt,
  };
  const definition: ProductDefinition = {
    id: productId,
    status: "published",
    visibility: "unlisted",
    currentVersionId: version.id,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    ...structuredClone(snapshot),
  };
  await catalog.publish(definition, version);

  const [item] = await operations.list();
  assert.equal(item.validation.passed, false);
  assert.ok(item.validation.issues.some((issue) => issue.code === "MODEL_REQUIRED"));
});
