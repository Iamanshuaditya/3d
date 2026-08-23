import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  CODE_TEMPLATE_DEFINITIONS,
  CODE_TEMPLATE_VERSIONS,
} from "@/lib/templates/fixtures";
import type { ProjectOwner } from "@/platform/projects/types";
import { TemplateDomainError } from "@/platform/templates/errors";
import {
  applyPersonalization,
  parsePersonalizationData,
  personalizationValue,
} from "@/platform/templates/personalization";
import type {
  DesignTemplateDefinition,
  DesignTemplateVersion,
} from "@/platform/templates/types";
import { openVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { ProjectService } from "@/server/projects/project-service";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import { SqliteTemplateCatalogRepository } from "@/server/templates/sqlite-template-catalog-repository";
import { SqliteTemplateAssetRepository } from "@/server/templates/sqlite-template-asset-repository";
import { TemplateAssetService } from "@/server/templates/template-asset-service";
import { TemplateCatalogService } from "@/server/templates/template-catalog-service";
import { TemplateService } from "@/server/templates/template-service";
import type { DesignDocument, ImageElement, TextElement } from "@/types/configurator";

const guest: ProjectOwner = {
  type: "guest",
  id: "ac553db7-77c7-4dcc-8866-d830e41840f6",
};

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "vortex-template-test-"));
  const database = openVortexDatabase(":memory:");
  const objectStore = new FilesystemObjectStore(join(directory, "objects"));
  const products = new ProductCatalogService(
    new SqliteProductCatalogRepository(database),
  );
  const projects = new ProjectService(
    new SqliteProjectRepository(database),
    objectStore,
    undefined,
    undefined,
    products,
  );
  const assets = new TemplateAssetService(
    new SqliteTemplateAssetRepository(database),
    objectStore,
  );
  const catalogue = new TemplateCatalogService(
    new SqliteTemplateCatalogRepository(database),
    products,
    assets,
  );
  const service = new TemplateService(catalogue, products, projects, assets);
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { database, products, projects, assets, catalogue, service };
}

function boundText(document: DesignDocument, key: string): TextElement {
  const element = Object.values(document.surfaces)
    .flatMap((surface) => surface.elements)
    .find((candidate) => candidate.type === "text" && candidate.binding?.key === key);
  assert.ok(element && element.type === "text", `missing bound text ${key}`);
  return element;
}

test("personalization uses explicit bindings, bounded nested data, and fallbacks", () => {
  const source = CODE_TEMPLATE_VERSIONS["team-launch-shirt@1"].designDocumentTemplate;
  const personalized = applyPersonalization(source, {
    company: { name: "ACME LABS", tagline: null },
  });
  assert.equal(boundText(personalized, "company.name").text, "ACME LABS");
  assert.equal(boundText(personalized, "company.tagline").text, "YOUR MESSAGE");
  assert.equal(personalizationValue(personalized.personalization ?? {}, "company.name"), "ACME LABS");
  assert.equal(boundText(personalized, "company.name").binding?.type, "field");

  assert.throws(
    () => parsePersonalizationData({ invalid: ["arrays are not values"] }),
    (error) => error instanceof TemplateDomainError && error.code === "PERSONALIZATION_INVALID",
  );
  let tooDeep: Record<string, unknown> = { value: "deep" };
  for (let depth = 0; depth < 9; depth += 1) tooDeep = { nested: tooDeep };
  assert.throws(
    () => parsePersonalizationData(tooDeep),
    (error) => error instanceof TemplateDomainError && error.code === "PERSONALIZATION_INVALID",
  );
});

test("template catalogue filters by exact product configuration and taxonomy", async (t) => {
  const { products, service } = await fixture(t);
  const shirt = await products.resolve("tshirt", null, {});
  const shirtTemplates = await service.list({
    productId: shirt.productId,
    productVersionId: shirt.productVersionId,
    configurationId: shirt.configurationId,
  });
  assert.deepEqual(shirtTemplates.map((template) => template.id), ["team-launch-shirt"]);
  assert.equal(shirtTemplates[0].previewUrl.includes("team-launch-shirt%401"), true);
  assert.equal((await service.list({ productId: "tshirt", search: "technology" })).length, 1);
  assert.equal((await service.list({ productId: "tshirt", category: "Packaging" })).length, 0);

  const mailer = await products.resolve("mailer-box-001", null, {});
  assert.deepEqual(
    (await service.list({
      productId: mailer.productId,
      productVersionId: mailer.productVersionId,
      configurationId: mailer.configurationId,
    })).map((template) => template.id),
    ["minimal-mailer"],
  );
});

test("published template compatibility cannot float across product versions", async (t) => {
  const { catalogue } = await fixture(t);
  const version = structuredClone(CODE_TEMPLATE_VERSIONS["team-launch-shirt@1"]);
  version.id = "team-launch-shirt@2";
  version.version = 2;
  version.publishedAt = "2026-08-23T12:30:00.000Z";
  version.compatibility = [{
    productId: "tshirt",
    optionSelection: {},
  }] as unknown as DesignTemplateVersion["compatibility"];
  const definition: DesignTemplateDefinition = {
    ...structuredClone(CODE_TEMPLATE_DEFINITIONS["team-launch-shirt"]),
    currentVersionId: version.id,
    updatedAt: version.publishedAt,
  };

  await assert.rejects(
    () => catalogue.publish(definition, version),
    (error) =>
      error instanceof TemplateDomainError &&
      error.code === "TEMPLATE_COMPATIBILITY_INEXACT",
  );
});

test("template instantiation creates a normal idempotent project with provenance", async (t) => {
  const { products, projects, service } = await fixture(t);
  const shirt = await products.resolve("tshirt", null, {});
  const request = {
    templateVersionId: "team-launch-shirt@1",
    productId: "tshirt",
    productVersionId: shirt.productVersionId,
    optionSelection: shirt.selection,
    personalization: {
      company: { name: "ACME LABS", tagline: "SHIP WITH CONFIDENCE" },
    },
    clientRequestId: "599508f7-bf78-492c-98dc-aad218b62d39",
  };
  const created = await service.instantiate(guest, "team-launch-shirt", request);
  const retry = await service.instantiate(guest, "team-launch-shirt", request);

  assert.equal(retry.id, created.id);
  assert.equal(created.revision, 1);
  assert.equal(created.productVersionId, shirt.productVersionId);
  assert.equal(created.configurationId, shirt.configurationId);
  assert.equal(created.sourceTemplateVersionId, "team-launch-shirt@1");
  assert.equal(boundText(created.design, "company.name").text, "ACME LABS");
  assert.equal(boundText(created.design, "company.tagline").text, "SHIP WITH CONFIDENCE");
  assert.equal((await projects.list(guest)).length, 1);

  const copy = await projects.duplicate(guest, created.id);
  assert.equal(copy.sourceTemplateVersionId, created.sourceTemplateVersionId);
  assert.equal(boundText(copy.design, "company.name").text, "ACME LABS");
});

test("manual text editing intentionally detaches a semantic binding", async (t) => {
  const { products, projects, service } = await fixture(t);
  const shirt = await products.resolve("tshirt", null, {});
  const created = await service.instantiate(guest, "team-launch-shirt", {
    templateVersionId: "team-launch-shirt@1",
    productId: "tshirt",
    productVersionId: shirt.productVersionId,
    optionSelection: {},
    personalization: { company: { name: "BOUND", tagline: "BOUND TAGLINE" } },
    clientRequestId: "105a25a2-96db-434a-a6c7-7ecf26562fe8",
  });
  const edited = structuredClone(created.design);
  const element = boundText(edited, "company.name");
  element.text = "MANUAL VALUE";
  delete element.binding;
  const saved = await projects.update(guest, created.id, {
    expectedRevision: created.revision,
    design: edited,
  });
  const reopened = await projects.open(guest, created.id);
  const restored = Object.values(reopened.design.surfaces)
    .flatMap((surface) => surface.elements)
    .find((candidate) => candidate.id === element.id);
  assert.equal(restored?.type, "text");
  if (restored?.type !== "text") assert.fail("expected edited text");
  assert.equal(restored.text, "MANUAL VALUE");
  assert.equal(restored.binding, undefined);
  assert.equal(saved.revision, 2);
});

test("published template versions are immutable and do not mutate existing projects", async (t) => {
  const { products, projects, catalogue, service } = await fixture(t);
  const shirt = await products.resolve("tshirt", null, {});
  const project = await service.instantiate(guest, "team-launch-shirt", {
    templateVersionId: "team-launch-shirt@1",
    productId: "tshirt",
    productVersionId: shirt.productVersionId,
    optionSelection: {},
    personalization: { company: { name: "VERSION ONE", tagline: "ORIGINAL" } },
    clientRequestId: "0a030be5-b083-45e5-b301-52ec731d87ee",
  });

  const v1 = structuredClone(CODE_TEMPLATE_VERSIONS["team-launch-shirt@1"]);
  const v2 = structuredClone(v1);
  v2.id = "team-launch-shirt@2";
  v2.version = 2;
  v2.publishedAt = "2026-08-23T13:00:00.000Z";
  boundText(v2.designDocumentTemplate, "company.name").fill = "#ff0000";
  const definition: DesignTemplateDefinition = {
    ...structuredClone(CODE_TEMPLATE_DEFINITIONS["team-launch-shirt"]),
    currentVersionId: v2.id,
    updatedAt: v2.publishedAt,
  };
  await catalogue.publish(definition, v2);
  assert.equal((await catalogue.version("team-launch-shirt")).id, v2.id);

  const reopened = await projects.open(guest, project.id);
  assert.equal(reopened.sourceTemplateVersionId, v1.id);
  assert.equal(boundText(reopened.design, "company.name").text, "VERSION ONE");
  assert.notEqual(boundText(reopened.design, "company.name").fill, "#ff0000");

  const mutation = structuredClone(v2);
  boundText(mutation.designDocumentTemplate, "company.name").fontSize += 1;
  await assert.rejects(
    () => catalogue.publish(definition, mutation),
    (error) => error instanceof TemplateDomainError && error.code === "PUBLISHED_TEMPLATE_IMMUTABLE",
  );
});

test("template preview is a real PNG rendered from the same document", async (t) => {
  const { service } = await fixture(t);
  const preview = await service.preview("team-launch-shirt", "team-launch-shirt@1");
  assert.equal(Buffer.from(preview.bytes).subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(preview.width > 0 && preview.height > 0);
});

test("immutable platform artwork previews and copies into an ordinary project", async (t) => {
  const { database, products, projects, assets, catalogue, service } = await fixture(t);
  const bytes = await import("sharp").then(({ default: sharp }) => sharp({
    create: {
      width: 80,
      height: 40,
      channels: 4,
      background: { r: 22, g: 105, b: 210, alpha: 1 },
    },
  }).png().toBuffer());
  const asset = await assets.upload("operator-template-publisher", "../brand-mark.png", bytes);

  const version = structuredClone(CODE_TEMPLATE_VERSIONS["team-launch-shirt@1"]);
  version.id = "image-shirt@1";
  version.templateId = "image-shirt";
  version.name = "Image shirt";
  version.assetIds = [asset.id];
  version.publishedAt = "2026-08-24T01:00:00.000Z";
  const image: ImageElement = {
    id: "catalogue-brand-mark",
    type: "image",
    assetId: asset.id,
    x: 60,
    y: 80,
    width: 200,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
  };
  version.designDocumentTemplate.surfaces["front-chest"].elements.push(image);
  const definition: DesignTemplateDefinition = {
    ...structuredClone(CODE_TEMPLATE_DEFINITIONS["team-launch-shirt"]),
    id: version.templateId,
    name: version.name,
    currentVersionId: version.id,
    updatedAt: version.publishedAt,
  };
  await catalogue.publish(definition, version);

  const preview = await service.preview(version.templateId, version.id);
  assert.equal(Buffer.from(preview.bytes).subarray(1, 4).toString("ascii"), "PNG");

  const shirt = await products.resolve("tshirt", null, {});
  const request = {
    templateVersionId: version.id,
    productId: "tshirt",
    productVersionId: shirt.productVersionId,
    optionSelection: {},
    personalization: { company: { name: "IMAGE", tagline: "PERSISTED" } },
    clientRequestId: "566783b4-1a5f-4f9d-848e-17a75d64a51e",
  };
  const created = await service.instantiate(guest, version.templateId, request);
  const retry = await service.instantiate(guest, version.templateId, request);
  assert.equal(retry.id, created.id);
  assert.equal(created.assets.length, 1);
  assert.notEqual(created.assets[0].id, asset.id, "catalogue bytes are copied into owner scope");
  const projectImage = created.design.surfaces["front-chest"].elements.find(
    (element) => element.id === image.id,
  );
  assert.equal(projectImage?.type, "image");
  if (projectImage?.type !== "image") assert.fail("expected image template layer");
  assert.equal(projectImage.assetId, created.assets[0].id);
  assert.match(projectImage.src ?? "", new RegExp(`/projects/${created.id}/assets/`));
  assert.equal(
    Buffer.compare(
      Buffer.from((await projects.readAsset(guest, created.id, created.assets[0].id)).object.bytes),
      bytes,
    ),
    0,
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM project_assets WHERE project_id = ?")
      .get(created.id) as { count: number }).count,
    1,
    "idempotent retries do not duplicate project artwork",
  );

  database.prepare(`
    UPDATE design_template_definitions
    SET status = 'draft', current_version_id = NULL
    WHERE id = ?
  `).run(version.templateId);
  const reopened = await projects.open(guest, created.id);
  assert.equal(reopened.assets.length, 1, "unpublishing cannot break an existing project");
  const duplicate = await projects.duplicate(guest, created.id);
  assert.equal(duplicate.assets.length, 1);
  assert.notEqual(duplicate.assets[0].id, reopened.assets[0].id);
});

test("publishing fails closed when a template asset is missing or URL-backed", async (t) => {
  const { catalogue } = await fixture(t);
  const version = structuredClone(CODE_TEMPLATE_VERSIONS["team-launch-shirt@1"]);
  version.id = "unsafe-image-shirt@1";
  version.templateId = "unsafe-image-shirt";
  version.name = "Unsafe image shirt";
  version.assetIds = ["28f8e2f7-ea91-45f1-87a5-61c6bb2e3c96"];
  version.publishedAt = "2026-08-24T01:15:00.000Z";
  const unsafeImage: ImageElement = {
    id: "unsafe-image",
    type: "image",
    assetId: version.assetIds[0],
    src: "https://example.test/not-durable.png",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
  };
  version.designDocumentTemplate.surfaces["front-chest"].elements.push(unsafeImage);
  const definition: DesignTemplateDefinition = {
    ...structuredClone(CODE_TEMPLATE_DEFINITIONS["team-launch-shirt"]),
    id: version.templateId,
    name: version.name,
    currentVersionId: version.id,
    updatedAt: version.publishedAt,
  };
  await assert.rejects(
    () => catalogue.publish(definition, version),
    (error) => error instanceof TemplateDomainError &&
      error.code === "TEMPLATE_ASSET_REFERENCE_INVALID",
  );

  delete unsafeImage.src;
  await assert.rejects(
    () => catalogue.publish(definition, version),
    (error) => error instanceof TemplateDomainError && error.code === "TEMPLATE_ASSET_MISSING",
  );
});

test("a template cannot instantiate against an unrelated product", async (t) => {
  const { products, service } = await fixture(t);
  const bottle = await products.resolve("bottle-001", null, {});
  await assert.rejects(
    () => service.instantiate(guest, "team-launch-shirt", {
      templateVersionId: "team-launch-shirt@1",
      productId: "bottle-001",
      productVersionId: bottle.productVersionId,
      optionSelection: {},
      personalization: {},
      clientRequestId: "97280e93-7541-4dc2-8818-774b06613319",
    }),
    (error) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "TEMPLATE_INCOMPATIBLE",
  );
});
