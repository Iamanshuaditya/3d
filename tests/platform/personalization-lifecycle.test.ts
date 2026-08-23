import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { ProjectOwner } from "@/platform/projects/types";
import { PlatformError, ValidationError } from "@/platform/projects/errors";
import { openVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { PersonalizationRunner } from "@/server/personalization/personalization-runner";
import { PersonalizationService } from "@/server/personalization/personalization-service";
import { SqlitePersonalizationRepository } from "@/server/personalization/sqlite-personalization-repository";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import { SqliteTemplateAssetRepository } from "@/server/templates/sqlite-template-asset-repository";
import { SqliteTemplateCatalogRepository } from "@/server/templates/sqlite-template-catalog-repository";
import { TemplateAssetService } from "@/server/templates/template-asset-service";
import { TemplateCatalogService } from "@/server/templates/template-catalog-service";

const guest: ProjectOwner = { type: "guest", id: "0e2200cd-f712-4985-a60b-3ca0046967ab" };
const other: ProjectOwner = { type: "guest", id: "c12d4953-f4f3-4a55-8cfb-25cfa4b0cdb9" };
const user: ProjectOwner = { type: "user", id: "personalization-user" };

async function waitFor(
  service: PersonalizationService,
  owner: ProjectOwner,
  id: string,
  status: "completed" | "failed",
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const job = await service.getJob(owner, id);
    if (job.status === status) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`job ${id} did not reach ${status}`);
}

async function fixture(t: TestContext, options: { attachRunner?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "vortex-personalization-test-"));
  const database = openVortexDatabase(":memory:");
  const objectStore = new FilesystemObjectStore(join(directory, "objects"));
  const repository = new SqlitePersonalizationRepository(database);
  const products = new ProductCatalogService(new SqliteProductCatalogRepository(database));
  const assets = new TemplateAssetService(
    new SqliteTemplateAssetRepository(database),
    objectStore,
  );
  const templates = new TemplateCatalogService(
    new SqliteTemplateCatalogRepository(database),
    products,
    assets,
  );
  let now = "2026-08-24T12:00:00.000Z";
  const service = new PersonalizationService(
    repository,
    objectStore,
    templates,
    products,
    assets,
    () => crypto.randomUUID(),
    () => now,
  );
  if (options.attachRunner !== false) {
    const runner = new PersonalizationRunner(
      repository,
      objectStore,
      templates,
      (datasetId) => service.loadDataset(datasetId),
      () => now,
    );
    service.attachRunner(runner);
  }
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    database,
    objectStore,
    repository,
    service,
    setNow(value: string) { now = value; },
  };
}

async function validDataset(service: PersonalizationService, owner = guest) {
  return service.createDataset(owner, {
    templateId: "team-launch-shirt",
    templateVersionId: "team-launch-shirt@1",
    csv: new TextEncoder().encode(
      "company.name,company.tagline\nNorthstar,Launch safely\nAcme,Ship quality",
    ),
  });
}

test("datasets are owner scoped, validated, private, and visually previewable", async (t) => {
  const { service } = await fixture(t);
  const created = await validDataset(service);
  assert.equal(created.dataset.rowCount, 2);
  assert.deepEqual(created.previewRows, [0, 1]);
  assert.equal((await service.listDatasets(guest)).length, 1);
  assert.equal((await service.listDatasets(other)).length, 0);
  await assert.rejects(() => service.preview(other, created.dataset.id, 0), /not found/i);
  const preview = await service.preview(guest, created.dataset.id, 0);
  assert.equal(Buffer.from(preview.bytes).subarray(1, 4).toString("ascii"), "PNG");

  await assert.rejects(
    () => service.createDataset(guest, {
      templateId: "team-launch-shirt",
      templateVersionId: "team-launch-shirt@1",
      csv: new TextEncoder().encode("company.name,company.tagline\n,missing name"),
    }),
    (error) => error instanceof ValidationError &&
      error.code === "PERSONALIZATION_DATASET_INVALID" &&
      typeof error.details?.report === "object",
  );
});

test("bounded jobs generate a checksum-verified normal-document manifest idempotently", async (t) => {
  const { service } = await fixture(t);
  const { dataset } = await validDataset(service);
  const first = await service.createJob(guest, dataset.id, "bulk-request-0001");
  const repeated = await service.createJob(guest, dataset.id, "bulk-request-0001");
  assert.equal(first.id, repeated.id);
  const completed = await waitFor(service, guest, first.id, "completed");
  assert.equal(completed.processed, 2);
  assert.equal(completed.failed, 0);
  assert.match(completed.outputSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.ok(completed.downloadUrl);
  await assert.rejects(() => service.getJob(other, first.id), /not found/i);

  const { object } = await service.readOutput(guest, first.id);
  const lines = new TextDecoder().decode(object.bytes).trim().split("\n").map((line) => JSON.parse(line) as {
    kind: string;
    design?: { surfaces: Record<string, unknown> };
  });
  assert.equal(lines[0].kind, "vortex-personalization-manifest");
  assert.equal(lines.filter((line) => line.kind === "variant").length, 2);
  assert.ok(lines[1].design?.surfaces);
});

test("queued jobs cancel safely and failed attempts have bounded retries", async (t) => {
  const queuedFixture = await fixture(t, { attachRunner: false });
  const { dataset } = await validDataset(queuedFixture.service);
  const queued = await queuedFixture.service.createJob(guest, dataset.id, "bulk-request-cancel");
  assert.equal((await queuedFixture.service.cancel(guest, queued.id)).status, "cancelled");

  const failingFixture = await fixture(t);
  const failingDataset = await validDataset(failingFixture.service);
  const internal = await failingFixture.repository.findDataset(
    failingDataset.dataset.id,
    guest,
  );
  assert.ok(internal);
  await failingFixture.objectStore.delete(internal.storageKey);
  const failed = await failingFixture.service.createJob(
    guest,
    failingDataset.dataset.id,
    "bulk-request-failure",
  );
  const firstFailure = await waitFor(failingFixture.service, guest, failed.id, "failed");
  assert.equal(firstFailure.attempt, 1);
  const retried = await failingFixture.service.retry(guest, failed.id);
  assert.equal(retried.status, "queued");
  const secondFailure = await waitFor(failingFixture.service, guest, failed.id, "failed");
  assert.equal(secondFailure.attempt, 2);
});

test("guest claim transfers datasets and jobs atomically and stale guest writes fail", async (t) => {
  const { database, service } = await fixture(t, { attachRunner: false });
  const { dataset } = await validDataset(service);
  const job = await service.createJob(guest, dataset.id, "bulk-request-claim");
  const projectRepository = new SqliteProjectRepository(database);
  const claim = await projectRepository.claimAll(
    guest,
    user as Extract<ProjectOwner, { type: "user" }>,
    "2026-08-24T12:01:00.000Z",
  );
  assert.deepEqual(claim, { kind: "claimed", count: 0 });
  assert.equal((await service.listDatasets(guest)).length, 0);
  assert.equal((await service.listDatasets(user)).length, 1);
  assert.equal((await service.getJob(user, job.id)).status, "queued");
  await assert.rejects(
    () => validDataset(service),
    (error) => error instanceof PlatformError && error.code === "GUEST_IDENTITY_CLAIMED",
  );
});

test("expired private datasets and outputs are removed by retention cleanup", async (t) => {
  const { service, repository, objectStore, setNow } = await fixture(t);
  const { dataset } = await validDataset(service);
  const internal = await repository.findDataset(dataset.id, guest);
  assert.ok(internal);
  setNow("2026-09-24T12:00:01.000Z");
  assert.equal(await service.purgeExpired(), 1);
  assert.equal(await objectStore.get(internal.storageKey), null);
  assert.equal((await service.listDatasets(guest)).length, 0);
});
