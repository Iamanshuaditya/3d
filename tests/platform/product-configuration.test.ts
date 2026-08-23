import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { getProduct, PRODUCTS } from "@/lib/configurator/product-config";
import {
  legacyDefinitionSnapshot,
  legacyProductVersion,
} from "@/lib/configurator/product-definitions";
import {
  resolveProductConfiguration,
  validateProductVersion,
} from "@/platform/products/configuration-resolver";
import { ProductDomainError } from "@/platform/products/errors";
import type {
  ProductConfigurationProvider,
  ProductDefinition,
  ProductDefinitionSnapshot,
  ProductVersion,
} from "@/platform/products/types";
import type { ProjectOwner } from "@/platform/projects/types";
import { openVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { ProjectService } from "@/server/projects/project-service";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import type { ProductConfig } from "@/types/configurator";

const publishedAt = "2026-08-23T08:00:00.000Z";
const guest: ProjectOwner = {
  type: "guest",
  id: "9fc45dc3-a727-4373-9780-f64d7c2cb2f0",
};

function baseConfig(id: string, surfaceId = "front"): ProductConfig {
  const source = getProduct("tshirt");
  assert.ok(source);
  const config = structuredClone(source);
  config.id = id;
  config.name = "Versioned test product";
  config.editableSurfaces = [{ ...config.editableSurfaces[0], id: surfaceId }];
  delete config.productVersionId;
  delete config.configurationId;
  delete config.optionSelection;
  return config;
}

const configurableDefinition: ProductDefinitionSnapshot = {
  name: "Configurable pouch",
  options: [
    {
      id: "material",
      label: "Material",
      kind: "select",
      required: true,
      defaultValue: "clear",
      values: [
        { value: "clear", label: "Clear barrier", productionValue: "CLR" },
        { value: "kraft", label: "Kraft", productionValue: "KFT" },
      ],
    },
    {
      id: "finish",
      label: "Finish",
      kind: "select",
      required: true,
      defaultValue: "matte",
      values: [
        { value: "matte", label: "Matte" },
        {
          value: "gloss",
          label: "Gloss",
          availableWhen: {
            all: [{ optionId: "material", operator: "not_equals", value: "kraft" }],
          },
        },
      ],
    },
    {
      id: "width",
      label: "Width",
      kind: "dimension",
      required: true,
      min: 2,
      max: 8,
      step: 0.25,
      unit: "in",
      productionUnit: "mm",
      defaultValue: 3.25,
    },
    {
      id: "zipper",
      label: "Zipper",
      kind: "boolean",
      defaultValue: true,
      visibleWhen: {
        all: [{ optionId: "material", operator: "equals", value: "clear" }],
      },
      productionValues: { true: "ZIP", false: "NO_ZIP" },
    },
  ],
  presentation: { mode: "packaging" },
  capabilities: {
    multiSurface: false,
    embroideryPreview: false,
    unfolding: false,
    parameterizedDimensions: true,
    templates: false,
  },
  templateCompatibility: ["configurable-pouch"],
};

function configurableVersion(): ProductVersion {
  return {
    id: "configurable-pouch@1",
    productId: "configurable-pouch",
    version: 1,
    status: "published",
    definition: structuredClone(configurableDefinition),
    resolution: { kind: "provider", providerId: "test-pouch" },
    publishedAt,
  };
}

test("configuration resolver validates dependencies and produces stable production values", () => {
  const provider: ProductConfigurationProvider = {
    resolve({ options }) {
      const config = baseConfig("configurable-pouch");
      config.editableSurfaces[0].physicalWidthCm = Number(options.width.productionValue) / 10;
      return config;
    },
  };
  const version = configurableVersion();
  const first = resolveProductConfiguration(
    version,
    { width: 3.5, finish: "gloss", material: "clear" },
    { "test-pouch": provider },
  );
  const reordered = resolveProductConfiguration(
    version,
    { material: "clear", finish: "gloss", width: 3.5 },
    { "test-pouch": provider },
  );

  assert.equal(first.configurationId, reordered.configurationId);
  assert.equal(first.options.material.productionValue, "CLR");
  assert.equal(first.options.width.productionValue, 88.89999999999999);
  assert.equal(first.options.zipper.productionValue, "ZIP");
  assert.equal(first.productConfig.editableSurfaces[0].physicalWidthCm, 8.889999999999999);
  assert.equal(first.productConfig.productVersionId, version.id);
  assert.equal(first.productConfig.configurationId, first.configurationId);

  assert.throws(
    () => resolveProductConfiguration(
      version,
      { material: "kraft", finish: "gloss" },
      { "test-pouch": provider },
    ),
    (error) => error instanceof ProductDomainError && error.code === "OPTION_VALUE_UNAVAILABLE",
  );
  assert.throws(
    () => resolveProductConfiguration(
      version,
      { material: "kraft", zipper: true },
      { "test-pouch": provider },
    ),
    (error) => error instanceof ProductDomainError && error.code === "OPTION_NOT_VISIBLE",
  );
});

test("invalid option schemas and missing providers fail before Studio receives a config", () => {
  const version = configurableVersion();
  const invalid = structuredClone(version);
  invalid.definition.options[1].visibleWhen = {
    all: [{ optionId: "missing", operator: "equals", value: true }],
  };
  assert.throws(
    () => validateProductVersion(invalid),
    (error) => error instanceof ProductDomainError && error.code === "UNKNOWN_OPTION_DEPENDENCY",
  );
  assert.throws(
    () => resolveProductConfiguration(version),
    (error) => error instanceof ProductDomainError && error.code === "RESOLUTION_PROVIDER_MISSING",
  );
});

test("the compatibility adapter preserves every registered engine configuration", () => {
  for (const source of Object.values(PRODUCTS)) {
    const resolved = resolveProductConfiguration(legacyProductVersion(source));
    const engineConfig = structuredClone(resolved.productConfig);
    delete engineConfig.productVersionId;
    delete engineConfig.configurationId;
    delete engineConfig.optionSelection;
    assert.deepEqual(engineConfig, source, `${source.id} changed while passing through the adapter`);
  }

  assert.equal(legacyDefinitionSnapshot(PRODUCTS["mailer-box-001"]).presentation.mode, "packaging");
  assert.equal(legacyDefinitionSnapshot(PRODUCTS.tshirt).presentation.mode, "garment");
  assert.equal(legacyDefinitionSnapshot(PRODUCTS["bottle-001"]).presentation.mode, "2d-3d-split");
  assert.equal(legacyDefinitionSnapshot(PRODUCTS["mailer-box-001"]).capabilities.unfolding, true);
  assert.equal(
    legacyDefinitionSnapshot(PRODUCTS["burger-box-001"]).capabilities.unfolding,
    false,
    "an open/close clamshell must not advertise progressive unfolding",
  );
  assert.equal(
    legacyDefinitionSnapshot(PRODUCTS["mailer-box-001"]).capabilities.parameterizedDimensions,
    false,
    "the fixed mailer spec must not pretend to be a parameterized product",
  );
});

function versionFixture(
  productId: string,
  versionNumber: number,
  surfaceId: string,
): { definition: ProductDefinition; version: ProductVersion } {
  const id = `${productId}@${versionNumber}`;
  const snapshot: ProductDefinitionSnapshot = {
    name: "Versioned test product",
    options: [],
    presentation: { mode: "2d-3d-split" },
    capabilities: {
      multiSurface: false,
      embroideryPreview: false,
      unfolding: false,
      parameterizedDimensions: false,
      templates: false,
    },
    templateCompatibility: [productId],
  };
  return {
    definition: {
      id: productId,
      status: "published",
      currentVersionId: id,
      createdAt: publishedAt,
      updatedAt: publishedAt,
      ...structuredClone(snapshot),
    },
    version: {
      id,
      productId,
      version: versionNumber,
      status: "published",
      definition: snapshot,
      resolution: { kind: "static", productConfig: baseConfig(productId, surfaceId) },
      publishedAt,
    },
  };
}

async function catalogFixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "vortex-product-test-"));
  const database = openVortexDatabase(":memory:");
  const catalog = new ProductCatalogService(
    new SqliteProductCatalogRepository(database),
    {},
    {},
    {},
  );
  const projects = new ProjectService(
    new SqliteProjectRepository(database),
    new FilesystemObjectStore(directory),
    undefined,
    undefined,
    catalog,
  );
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { catalog, projects };
}

test("published product versions are immutable and version numbers cannot be reused", async (t) => {
  const { catalog } = await catalogFixture(t);
  const first = versionFixture("immutable-product", 1, "front-v1");
  await catalog.publish(first.definition, first.version);

  const mutation = structuredClone(first.version);
  if (mutation.resolution.kind !== "static") assert.fail("expected static fixture");
  mutation.resolution.productConfig.editableSurfaces[0].physicalWidthCm += 1;
  await assert.rejects(
    () => catalog.publish(first.definition, mutation),
    (error) => error instanceof ProductDomainError && error.code === "PUBLISHED_VERSION_IMMUTABLE",
  );

  const conflicting = versionFixture("immutable-product", 1, "other");
  conflicting.version.id = "immutable-product@different-id";
  conflicting.definition.currentVersionId = conflicting.version.id;
  await assert.rejects(
    () => catalog.publish(conflicting.definition, conflicting.version),
    (error) =>
      error instanceof ProductDomainError && error.code === "PRODUCT_VERSION_NUMBER_CONFLICT",
  );
});

test("existing projects stay on version 1 after version 2 is published", async (t) => {
  const { catalog, projects } = await catalogFixture(t);
  const v1 = versionFixture("versioned-product", 1, "front-v1");
  const v2 = versionFixture("versioned-product", 2, "front-v2");
  await catalog.publish(v1.definition, v1.version);

  const oldProject = await projects.create(guest, "versioned-product", "Original");
  assert.equal(oldProject.productVersionId, "versioned-product@1");
  assert.deepEqual(Object.keys(oldProject.design.surfaces), ["front-v1"]);

  await catalog.publish(v2.definition, v2.version);
  const newProject = await projects.create(guest, "versioned-product", "New");
  assert.equal(newProject.productVersionId, "versioned-product@2");
  assert.deepEqual(Object.keys(newProject.design.surfaces), ["front-v2"]);

  const oldDesign = structuredClone(oldProject.design);
  const savedOldProject = await projects.update(guest, oldProject.id, {
    expectedRevision: oldProject.revision,
    design: oldDesign,
  });
  assert.equal(savedOldProject.revision, 2);
  assert.equal(savedOldProject.productVersionId, "versioned-product@1");
  assert.deepEqual(Object.keys(savedOldProject.design.surfaces), ["front-v1"]);
  assert.equal((await catalog.resolve("versioned-product", null)).productVersionId, "versioned-product@2");
  assert.equal(
    (await catalog.resolve("versioned-product", oldProject.productVersionId)).productConfig
      .editableSurfaces[0].id,
    "front-v1",
  );
});
