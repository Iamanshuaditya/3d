import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import Database from "better-sqlite3";
import sharp from "sharp";
import { createEmptyDocument } from "@/lib/configurator/design-state";
import { getProduct } from "@/lib/configurator/product-config";
import { DEFAULT_EMBROIDERY } from "@/types/embroidery";
import type { DesignDocument, ImageElement, TextElement } from "@/types/configurator";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/projects/errors";
import type { ProjectOwner } from "@/platform/projects/types";
import { openVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { ProjectService } from "@/server/projects/project-service";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";

const guest: ProjectOwner = {
  type: "guest",
  id: "31547fc2-615a-4c04-a2d4-91f5bed3df5f",
};
const otherGuest: ProjectOwner = {
  type: "guest",
  id: "a58e13d8-6953-4e85-aab0-d788578e42aa",
};

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "vortex-project-test-"));
  const database = openVortexDatabase(":memory:");
  const repository = new SqliteProjectRepository(database);
  const service = new ProjectService(repository, new FilesystemObjectStore(directory));
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { service, repository };
}

function addText(document: DesignDocument, text: string): DesignDocument {
  const next = structuredClone(document);
  const surface = Object.values(next.surfaces)[0];
  const element: TextElement = {
    id: `text-${text}`,
    type: "text",
    text,
    x: 40,
    y: 50,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    fontFamily: "Arial",
    fontSize: 48,
    fill: "#111111",
  };
  surface.elements.push(element);
  return next;
}

test("T-shirt artwork, transforms, and embroidery survive a full project reopen", async (t) => {
  const { service, repository } = await fixture(t);
  const created = await service.create(guest, "tshirt", "Critical persistence test");
  const png = await sharp({
    create: {
      width: 96,
      height: 48,
      channels: 4,
      background: { r: 24, g: 92, b: 178, alpha: 1 },
    },
  }).png().toBuffer();
  const asset = await service.uploadArtwork(guest, created.id, "../logo.not-really-png", png);

  const design = structuredClone(created.design);
  const surface = design.surfaces["front-chest"];
  const image: ImageElement = {
    id: "critical-logo",
    type: "image",
    assetId: asset.id,
    // Runtime locators are never the persistent identity and must be stripped.
    src: "blob:ephemeral-runtime-url",
    sourcePixelWidth: 1,
    sourcePixelHeight: 1,
    sourceName: "spoofed.exe",
    sourceMimeType: "application/octet-stream",
    x: 143.25,
    y: 88.5,
    width: 240,
    height: 120,
    rotation: 12,
    scaleX: 1.35,
    scaleY: 0.82,
    opacity: 0.91,
    treatment: {
      mode: "embroidery",
      settings: { ...DEFAULT_EMBROIDERY, densityMm: 0.62, sheen: 0.73, maxColours: 5 },
    },
  };
  surface.elements.push(image);

  const saved = await service.update(guest, created.id, {
    expectedRevision: created.revision,
    design,
  });
  assert.equal(saved.revision, 2);

  // This is the server equivalent of a browser process disappearing: reopen
  // from the database and object store, with no blob/object URL available.
  const reopened = await service.open(guest, created.id);
  const restored = reopened.design.surfaces["front-chest"].elements[0];
  assert.equal(restored.type, "image");
  if (restored.type !== "image") assert.fail("expected an image element");
  assert.equal(restored.assetId, asset.id);
  assert.equal(restored.src, asset.readUrl);
  assert.deepEqual(
    {
      x: restored.x,
      y: restored.y,
      width: restored.width,
      height: restored.height,
      rotation: restored.rotation,
      scaleX: restored.scaleX,
      scaleY: restored.scaleY,
      opacity: restored.opacity,
    },
    {
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
      rotation: image.rotation,
      scaleX: image.scaleX,
      scaleY: image.scaleY,
      opacity: image.opacity,
    },
  );
  assert.deepEqual(restored.treatment, image.treatment);
  assert.equal(restored.sourcePixelWidth, 96, "server metadata must override client claims");
  assert.equal(restored.sourcePixelHeight, 48);
  assert.equal(restored.sourceMimeType, "image/png");

  const immutable = await repository.findRevision(created.id, 2, guest);
  const persisted = immutable?.design.surfaces["front-chest"].elements[0];
  assert.equal(persisted?.type, "image");
  if (persisted?.type === "image") assert.equal(persisted.src, undefined);

  const bytes = await service.readAsset(guest, created.id, asset.id);
  assert.equal(Buffer.compare(Buffer.from(bytes.object.bytes), png), 0);
  await assert.rejects(() => service.open(otherGuest, created.id), NotFoundError);
  await assert.rejects(
    () => service.readAsset(otherGuest, created.id, asset.id),
    NotFoundError,
  );
});

test("same-revision concurrent saves cannot overwrite one another", async (t) => {
  const { service, repository } = await fixture(t);
  const created = await service.create(guest, "tshirt");
  const first = addText(created.design, "first request");
  const second = addText(created.design, "second request");

  const outcomes = await Promise.allSettled([
    service.update(guest, created.id, { expectedRevision: 1, design: first }),
    service.update(guest, created.id, { expectedRevision: 1, design: second }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof ConflictError);
  assert.deepEqual(rejected.reason.details, { currentRevision: 2 });

  const current = await service.open(guest, created.id);
  assert.equal(current.revision, 2);
  assert.equal((await repository.findRevision(created.id, 1, guest))?.revision, 1);
  assert.equal((await repository.findRevision(created.id, 2, guest))?.revision, 2);
  assert.equal(await repository.findRevision(created.id, 3, guest), null);
});

test("duplicate copies stable artwork and archive removes a project from the library", async (t) => {
  const { service } = await fixture(t);
  const created = await service.create(guest, "tshirt", "Team shirt");
  const png = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 255, g: 90, b: 40, alpha: 1 },
    },
  }).png().toBuffer();
  const asset = await service.uploadArtwork(guest, created.id, "logo.png", png);
  const design = structuredClone(created.design);
  design.surfaces["front-chest"].elements.push({
    id: "logo",
    type: "image",
    assetId: asset.id,
    src: asset.readUrl,
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
  });
  await service.update(guest, created.id, { expectedRevision: 1, design });

  const copy = await service.duplicate(guest, created.id);
  assert.notEqual(copy.id, created.id);
  assert.equal(copy.title, "Team shirt copy");
  assert.equal(copy.assets.length, 1);
  assert.notEqual(copy.assets[0].id, asset.id);
  const copiedElement = copy.design.surfaces["front-chest"].elements[0];
  assert.equal(copiedElement.type, "image");
  if (copiedElement.type === "image") assert.equal(copiedElement.assetId, copy.assets[0].id);

  const copiedBytes = await service.readAsset(guest, copy.id, copy.assets[0].id);
  assert.equal(Buffer.compare(Buffer.from(copiedBytes.object.bytes), png), 0);
  assert.equal((await service.list(guest)).length, 2);
  await service.archive(guest, created.id);
  assert.deepEqual((await service.list(guest)).map((project) => project.id), [copy.id]);
  await assert.rejects(
    () => service.update(guest, created.id, { expectedRevision: 2, design }),
    (error) => error instanceof ValidationError && error.code === "PROJECT_ARCHIVED",
  );
});

test("guest projects can be claimed by an authenticated owner without exposing them", async (t) => {
  const { service } = await fixture(t);
  const user: Extract<ProjectOwner, { type: "user" }> = {
    type: "user",
    id: "user-42",
  };
  const created = await service.create(guest, "tshirt");

  assert.equal(await service.claimGuestProjects(guest, user), 1);
  await assert.rejects(() => service.open(guest, created.id), NotFoundError);
  assert.equal((await service.open(user, created.id)).ownerType, "user");
});

test("project creation is idempotent per owner and client request", async (t) => {
  const { service } = await fixture(t);
  const creationKey = "e7bc0298-6d21-41fb-bf31-992034579133";

  const first = await service.create(guest, "tshirt", undefined, creationKey);
  const retry = await service.create(guest, "tshirt", undefined, creationKey);
  assert.equal(retry.id, first.id);
  assert.equal((await service.list(guest)).length, 1);

  const independentOwner = await service.create(otherGuest, "tshirt", undefined, creationKey);
  assert.notEqual(independentOwner.id, first.id);
  await assert.rejects(
    () => service.create(guest, "mug", undefined, creationKey),
    (error) => error instanceof ValidationError && error.code === "CREATION_KEY_REUSED",
  );
});

test("preview caches do not change design revision or customer edit time", async (t) => {
  const { service } = await fixture(t);
  const created = await service.create(guest, "tshirt");
  const preview = await service.generatePreview(guest, created.id);

  assert.equal(preview.revision, created.revision);
  assert.equal(preview.updatedAt, created.updatedAt);
  assert.match(preview.previewUrl ?? "", /\/content$/);
});

test("schema v2 projects migrate and reopen against their legacy product version", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "vortex-v2-migration-test-"));
  const filename = join(directory, "vortex.sqlite");
  const oldDatabase = new Database(filename);
  oldDatabase.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (1, '2026-08-23T00:00:00.000Z');
    INSERT INTO schema_migrations VALUES (2, '2026-08-23T00:00:01.000Z');

    CREATE TABLE design_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_version_id TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      status TEXT NOT NULL,
      design_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      preview_asset_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      creation_key TEXT
    );
    CREATE UNIQUE INDEX design_projects_owner_creation_key_idx
      ON design_projects(owner_type, owner_id, creation_key);
    CREATE TABLE project_revisions (
      project_id TEXT NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      design_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, revision)
    );
    CREATE TABLE project_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
  const product = getProduct("tshirt");
  assert.ok(product);
  const design = createEmptyDocument(product);
  const oldProjectId = "3d52386d-304b-419a-8a49-a6a5ed26e348";
  const now = "2026-08-23T00:00:02.000Z";
  oldDatabase.prepare(`
    INSERT INTO design_projects (
      id, title, product_id, product_version_id, owner_type, owner_id,
      status, design_json, revision, created_at, updated_at
    ) VALUES (?, 'Legacy shirt', 'tshirt', 'tshirt@legacy-v1', ?, ?, 'draft', ?, 1, ?, ?)
  `).run(oldProjectId, guest.type, guest.id, JSON.stringify(design), now, now);
  oldDatabase.prepare(`
    INSERT INTO project_revisions(project_id, revision, design_json, created_at)
    VALUES (?, 1, ?, ?)
  `).run(oldProjectId, JSON.stringify(design), now);
  oldDatabase.close();

  const database = openVortexDatabase(filename);
  const repository = new SqliteProjectRepository(database);
  const catalog = new ProductCatalogService(new SqliteProductCatalogRepository(database));
  const service = new ProjectService(
    repository,
    new FilesystemObjectStore(join(directory, "objects")),
    undefined,
    undefined,
    catalog,
  );
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const reopened = await service.open(guest, oldProjectId);
  assert.equal(reopened.productVersionId, "tshirt@legacy-v1");
  assert.equal(reopened.configurationId, "tshirt@legacy-v1|");
  assert.deepEqual(reopened.optionSelection, {});
  const saved = await service.update(guest, oldProjectId, {
    expectedRevision: 1,
    design: addText(reopened.design, "after migration"),
  });
  assert.equal(saved.revision, 2);

  const current = await service.create(guest, "tshirt", "Current shirt");
  assert.equal(current.productVersionId, "tshirt@1");
});
