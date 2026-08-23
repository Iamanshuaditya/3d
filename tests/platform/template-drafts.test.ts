import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProductOperator } from "@/platform/products/drafts";
import { PlatformError } from "@/platform/projects/errors";
import { openVortexDatabase } from "@/server/persistence/database";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import { SqliteTemplateAssetRepository } from "@/server/templates/sqlite-template-asset-repository";
import { SqliteTemplateCatalogRepository } from "@/server/templates/sqlite-template-catalog-repository";
import { SqliteTemplateDraftRepository } from "@/server/templates/sqlite-template-draft-repository";
import { TemplateAssetService } from "@/server/templates/template-asset-service";
import { TemplateCatalogService } from "@/server/templates/template-catalog-service";
import { TemplateDraftService } from "@/server/templates/template-draft-service";

const reader: ProductOperator = { id: "template-reader", permissions: ["templates:read"] };
const editor: ProductOperator = {
  id: "template-editor",
  permissions: ["templates:read", "templates:edit"],
};
const publisher: ProductOperator = {
  id: "template-publisher",
  permissions: ["templates:read", "templates:edit", "templates:publish"],
};

async function fixture() {
  const database = openVortexDatabase(":memory:");
  const products = new ProductCatalogService(new SqliteProductCatalogRepository(database));
  const assets = new TemplateAssetService(
    new SqliteTemplateAssetRepository(database),
    new FilesystemObjectStore(`/tmp/vortex-template-draft-${crypto.randomUUID()}`),
  );
  const repository = new SqliteTemplateCatalogRepository(database);
  const catalogue = new TemplateCatalogService(repository, products, assets);
  let sequence = 0;
  const service = new TemplateDraftService(
    new SqliteTemplateDraftRepository(database),
    repository,
    catalogue,
    () => `template-draft-id-${++sequence}`,
    () => `2026-08-24T12:00:${String(sequence).padStart(2, "0")}.000Z`,
  );
  await catalogue.list({});
  return { database, repository, catalogue, service };
}

test("operator template drafts validate and publish a new immutable version", async () => {
  const { database, repository, service } = await fixture();
  const original = await repository.findVersion("team-launch-shirt", "team-launch-shirt@1");
  assert.ok(original);
  await assert.rejects(
    () => service.create(reader, { templateId: "team-launch-shirt" }),
    (error) => error instanceof PlatformError && error.code === "OPERATOR_FORBIDDEN",
  );

  const draft = await service.create(editor, { templateId: "team-launch-shirt" });
  const document = structuredClone(draft.document);
  document.name = "Team launch shirt — revised";
  const updated = await service.update(editor, draft.id, 1, document);
  assert.equal(updated.revision, 2);
  const validated = await service.validate(editor, draft.id, 2);
  assert.equal(validated.status, "validated");
  assert.equal(validated.validation?.passed, true);
  await assert.rejects(
    () => service.publish(editor, draft.id, 2),
    (error) => error instanceof PlatformError && error.code === "OPERATOR_FORBIDDEN",
  );
  const published = await service.publish(publisher, draft.id, 2);
  assert.equal(published.version.id, "team-launch-shirt@2");
  assert.equal(published.draft.status, "published");
  assert.equal((await repository.findVersion("team-launch-shirt", "team-launch-shirt@1"))?.name, original.name);
  assert.equal((await repository.findCurrentVersion("team-launch-shirt"))?.name, document.name);
  assert.deepEqual(
    (await service.audit(reader, draft.id)).map((event) => event.action),
    ["draft_created", "draft_updated", "draft_validated", "version_published"],
  );
  database.close();
});

test("invalid assets fail validation and concurrent base versions cannot float", async () => {
  const { database, service } = await fixture();
  const invalid = await service.create(editor, { templateId: "team-launch-shirt" });
  const invalidDocument = structuredClone(invalid.document);
  invalidDocument.assetIds = ["missing-template-asset"];
  const invalidUpdated = await service.update(editor, invalid.id, 1, invalidDocument);
  const validation = await service.validate(editor, invalid.id, invalidUpdated.revision);
  assert.equal(validation.status, "draft");
  assert.equal(validation.validation?.passed, false);
  assert.ok(validation.validation?.issues.some((issue) => issue.code === "TEMPLATE_ASSET_MISMATCH"));

  const left = await service.create(editor, { templateId: "team-launch-shirt" });
  const right = await service.create(editor, { templateId: "team-launch-shirt" });
  await service.validate(editor, left.id, left.revision);
  await service.validate(editor, right.id, right.revision);
  await service.publish(publisher, left.id, left.revision);
  await assert.rejects(
    () => service.publish(publisher, right.id, right.revision),
    (error) => error instanceof PlatformError && error.code === "TEMPLATE_DRAFT_STALE",
  );
  database.close();
});
