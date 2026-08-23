import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ValidationError } from "@/platform/projects/errors";
import { openVortexDatabase } from "@/server/persistence/database";
import { ProductionFontService } from "@/server/production/production-font-service";
import { SqliteProductionFontRepository } from "@/server/production/sqlite-production-font-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";

function minimalSfntHeader() {
  const tags = ["head", "cmap", "name", "maxp"];
  const directoryEnd = 12 + tags.length * 16;
  const bytes = new Uint8Array(directoryEnd + tags.length);
  bytes.set([0x00, 0x01, 0x00, 0x00, 0x00, tags.length], 0);
  const view = new DataView(bytes.buffer);
  tags.forEach((tag, index) => {
    const directoryOffset = 12 + index * 16;
    bytes.set(new TextEncoder().encode(tag), directoryOffset);
    view.setUint32(directoryOffset + 8, directoryEnd + index);
    view.setUint32(directoryOffset + 12, 1);
  });
  return bytes;
}

test("production font registry pins private immutable bytes and licensing provenance", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "vortex-production-font-"));
  const database = openVortexDatabase(":memory:");
  const objectStore = new FilesystemObjectStore(join(directory, "objects"));
  const repository = new SqliteProductionFontRepository(database);
  const service = new ProductionFontService(
    repository,
    objectStore,
    () => "36d4836c-4ceb-4cc0-a6ec-90efa60dc953",
    () => "2026-08-24T12:00:00.000Z",
  );
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const font = await service.register({
    approvedBy: "licensed-font-operator",
    family: "Approved Sans",
    weight: 400,
    style: "normal",
    filename: "../approved sans.ttf",
    licenseName: "Internal test licence",
    licenseReference: "contract-font-test-2026",
    bytes: minimalSfntHeader(),
  });
  assert.equal(font.filename, "_approved_sans.ttf");
  assert.match(font.sha256, /^[a-f0-9]{64}$/);
  assert.equal(font.licenseReference, "contract-font-test-2026");
  assert.equal((await service.list()).length, 1);
  assert.equal((await service.find("approved sans", 400, "normal"))?.id, font.id);
  assert.deepEqual([...(await service.read(font.id)).object.bytes], [...minimalSfntHeader()]);

  const stored = await repository.findById(font.id);
  assert.ok(stored);
  await objectStore.put(stored.storageKey, new Uint8Array([0, 1, 2]), stored.mimeType);
  await assert.rejects(
    () => service.read(font.id),
    (error) => error instanceof ValidationError && error.code === "PRODUCTION_FONT_INTEGRITY_FAILED",
  );
});

test("font registry rejects unsupported bytes and incomplete licensing metadata", async () => {
  const database = openVortexDatabase(":memory:");
  const service = new ProductionFontService(
    new SqliteProductionFontRepository(database),
    new FilesystemObjectStore(join(tmpdir(), `vortex-font-invalid-${crypto.randomUUID()}`)),
  );
  await assert.rejects(
    () => service.register({
      approvedBy: "operator",
      family: "Approved Sans",
      weight: 450,
      style: "normal",
      filename: "font.woff2",
      licenseName: "",
      licenseReference: "",
      bytes: new TextEncoder().encode("wOF2not-a-font"),
    }),
    (error) => error instanceof ValidationError && error.code === "PRODUCTION_FONT_METADATA_INVALID",
  );
  database.close();
});
