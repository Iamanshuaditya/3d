import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { getProduct } from "@/lib/configurator/product-config";
import { legacyDefinitionSnapshot } from "@/lib/configurator/product-definitions";
import type {
  ProductDraftDocument,
  ProductOperator,
} from "@/platform/products/drafts";
import { ProductDomainError } from "@/platform/products/errors";
import { openVortexDatabase } from "@/server/persistence/database";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { ProductPublishingService } from "@/server/products/product-publishing-service";
import { productDraftAdminDto } from "@/server/products/admin-dto";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";

const editor: ProductOperator = {
  id: "operator.editor",
  permissions: ["products:read", "products:edit", "products:validate"],
};
const publisher: ProductOperator = {
  id: "operator.publisher",
  permissions: ["products:read", "products:publish"],
};
const viewer: ProductOperator = {
  id: "operator.viewer",
  permissions: ["products:read"],
};

function fixture(t: TestContext) {
  const database = openVortexDatabase(":memory:");
  const repository = new SqliteProductCatalogRepository(database);
  const catalog = new ProductCatalogService(repository);
  let clockTick = 0;
  let idTick = 0;
  const service = new ProductPublishingService(
    catalog,
    repository,
    () => new Date(Date.UTC(2026, 7, 23, 20, 0, clockTick++)).toISOString(),
    () => `product-admin-id-${++idTick}`,
  );
  t.after(() => database.close());
  return { database, catalog, service };
}

test("revisioned product drafts validate and publish an immutable next version", async (t) => {
  const { catalog, service } = fixture(t);
  const draft = await service.createFromCurrent(editor, "tshirt");
  assert.equal(draft.baseVersionId, "tshirt@2");
  assert.equal(draft.revision, 1);
  assert.equal(draft.status, "draft");
  const safeDto = productDraftAdminDto(draft);
  assert.equal(safeDto.metadata.resolutionKind, "static");
  assert.equal(JSON.stringify(safeDto).includes("productConfig"), false);
  assert.equal(JSON.stringify(safeDto).includes("providerId"), false);

  const document = structuredClone(draft.document);
  document.definition.name = "Classic T-Shirt — reviewed";
  const updated = await service.update(editor, draft.id, 1, document);
  assert.equal(updated.revision, 2);
  assert.equal(updated.validation, null);
  await assert.rejects(
    () => service.update(editor, draft.id, 1, document),
    (error) =>
      error instanceof ProductDomainError &&
      error.code === "PRODUCT_DRAFT_REVISION_CONFLICT" &&
      error.details?.currentRevision === 2,
  );

  const validated = await service.validate(editor, draft.id, 2);
  assert.equal(validated.status, "validated");
  assert.equal(validated.validation?.passed, true);
  assert.equal(validated.validation?.configurationId, "tshirt@3|");

  const result = await service.publish(publisher, draft.id, 2);
  assert.equal(result.draft.status, "published");
  assert.equal(result.draft.publishedVersionId, "tshirt@3");
  assert.equal(result.version.definition.name, "Classic T-Shirt — reviewed");
  assert.equal((await catalog.currentVersion("tshirt")).id, "tshirt@3");
  assert.deepEqual(
    (await catalog.listVersions("tshirt")).map((version) => version.id),
    ["tshirt@3", "tshirt@2"],
  );
  assert.notEqual(
    (await catalog.version("tshirt", "tshirt@2")).definition.name,
    result.version.definition.name,
  );

  const audit = await service.audit(viewer, draft.id);
  assert.deepEqual(audit.map((event) => event.action), [
    "draft_created",
    "draft_updated",
    "draft_validated",
    "version_published",
  ]);
  assert.equal(audit.at(-1)?.productVersionId, "tshirt@3");

  const retry = await service.publish(publisher, draft.id, 2);
  assert.equal(retry.version.id, "tshirt@3");
  assert.equal((await service.audit(viewer, draft.id)).length, audit.length);
  await assert.rejects(
    () => service.update(editor, draft.id, 2, document),
    (error) =>
      error instanceof ProductDomainError && error.code === "PRODUCT_DRAFT_ALREADY_PUBLISHED",
  );
});

test("invalid resolved contracts fail validation and cannot publish", async (t) => {
  const { catalog, service } = fixture(t);
  const source = getProduct("tshirt");
  assert.ok(source);
  const productId = "invalid-operator-product";
  const document: ProductDraftDocument = {
    productId,
    visibility: "unlisted",
    definition: {
      ...legacyDefinitionSnapshot(source),
      name: "Invalid operator product",
      templateCompatibility: [productId],
    },
    resolution: {
      kind: "static",
      productConfig: {
        ...structuredClone(source),
        id: productId,
        name: "Invalid operator product",
        modelUrl: "",
      },
    },
  };
  const draft = await service.createNew(editor, document);
  const validated = await service.validate(editor, draft.id, draft.revision);

  assert.equal(validated.status, "draft");
  assert.equal(validated.validation?.passed, false);
  assert.ok(validated.validation?.issues.some((issue) => issue.code === "MODEL_REQUIRED"));
  await assert.rejects(
    () => service.publish(publisher, draft.id, draft.revision),
    (error) =>
      error instanceof ProductDomainError && error.code === "PRODUCT_DRAFT_NOT_VALIDATED",
  );
  await assert.rejects(
    () => catalog.currentVersion(productId),
    (error) => error instanceof ProductDomainError && error.code === "PRODUCT_NOT_FOUND",
  );
  assert.deepEqual(
    (await service.audit(viewer, draft.id)).map((event) => event.action),
    ["draft_created", "draft_validation_failed"],
  );
});

test("a concurrent publication makes another draft stale before it can publish", async (t) => {
  const { catalog, service } = fixture(t);
  const first = await service.createFromCurrent(editor, "tshirt");
  const second = await service.createFromCurrent(editor, "tshirt");
  await service.validate(editor, first.id, 1);
  await service.validate(editor, second.id, 1);

  assert.equal((await service.publish(publisher, first.id, 1)).version.id, "tshirt@3");
  await assert.rejects(
    () => service.publish(publisher, second.id, 1),
    (error) =>
      error instanceof ProductDomainError && error.code === "PRODUCT_DRAFT_VALIDATION_FAILED",
  );
  const stale = await service.get(viewer, second.id);
  assert.equal(stale.status, "draft");
  assert.ok(stale.validation?.issues.some(
    (issue) => issue.code === "PRODUCT_DRAFT_BASE_STALE",
  ));
  assert.equal((await catalog.currentVersion("tshirt")).id, "tshirt@3");
  assert.deepEqual(
    (await service.audit(viewer, second.id)).map((event) => event.action),
    ["draft_created", "draft_validated", "draft_validation_failed"],
  );
});

test("operator permissions are checked at the service data boundary", async (t) => {
  const { service } = fixture(t);
  await assert.rejects(
    () => service.createFromCurrent(viewer, "tshirt"),
    (error) => error instanceof ProductDomainError && error.code === "OPERATOR_FORBIDDEN",
  );
  const draft = await service.createFromCurrent(editor, "tshirt");
  await service.validate(editor, draft.id, 1);
  await assert.rejects(
    () => service.publish(editor, draft.id, 1),
    (error) => error instanceof ProductDomainError && error.code === "OPERATOR_FORBIDDEN",
  );
});

test("passed onboarding provenance is revisioned and frozen onto publication", async (t) => {
  const { database, service } = fixture(t);
  const draft = await service.createFromCurrent(editor, "tshirt");
  const jobId = "f0474c8b-c37a-4617-bbbb-4184aaca7bb1";
  const inputAssetId = "545d822b-a35d-439f-8bad-da842b2d45f7";
  const reportAssetId = "a8c73d71-28e8-4b16-a4bb-44c0f9467970";
  const reportChecksum = "a".repeat(64);
  const toolVersion = "b".repeat(64);
  database.prepare(`
    INSERT INTO onboarding_assets (
      id, job_id, role, filename, mime_type, byte_size, sha256, storage_key, created_at
    ) VALUES (?, ?, 'input_glb', 'source.glb', 'model/gltf-binary', 12, ?, ?, ?)
  `).run(inputAssetId, jobId, "c".repeat(64), `onboarding/${jobId}/input`, draft.createdAt);
  database.prepare(`
    INSERT INTO onboarding_assets (
      id, job_id, role, filename, mime_type, byte_size, sha256, storage_key, created_at
    ) VALUES (?, ?, 'validation_report', 'report.json', 'application/json', 20, ?, ?, ?)
  `).run(reportAssetId, jobId, reportChecksum, `onboarding/${jobId}/report`, draft.createdAt);
  database.prepare(`
    INSERT INTO onboarding_jobs (
      id, operator_id, product_id, draft_id, status, input_asset_id,
      manifest_asset_id, command_version, started_at, completed_at,
      report_asset_id, error_code, stdout_text, stderr_text, created_at
    ) VALUES (?, ?, 'tshirt', ?, 'passed', ?, NULL, ?, ?, ?, ?, NULL, '', '', ?)
  `).run(
    jobId,
    editor.id,
    draft.id,
    inputAssetId,
    toolVersion,
    draft.createdAt,
    draft.createdAt,
    reportAssetId,
    draft.createdAt,
  );

  const attached = await service.attachOnboarding(editor, draft.id, 1, {
    jobId,
    reportChecksum,
    toolVersion,
  });
  assert.equal(attached.revision, 2);
  assert.deepEqual(attached.onboardingProvenance, { jobId, reportChecksum, toolVersion });
  const validated = await service.validate(editor, draft.id, 2);
  assert.equal(validated.validation?.passed, true);
  const published = await service.publish(publisher, draft.id, 2);
  assert.equal(published.version.id, "tshirt@3");
  assert.deepEqual(database.prepare(`
    SELECT onboarding_job_id, report_sha256, tool_version
    FROM product_version_onboarding_provenance WHERE product_version_id = 'tshirt@3'
  `).get(), {
    onboarding_job_id: jobId,
    report_sha256: reportChecksum,
    tool_version: toolVersion,
  });
  assert.deepEqual(
    (await service.audit(viewer, draft.id)).map((event) => event.action),
    ["draft_created", "onboarding_attached", "draft_validated", "version_published"],
  );
});
