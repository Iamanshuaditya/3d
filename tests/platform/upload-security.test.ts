import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { ValidationError } from "@/platform/projects/errors";
import { validateImageUpload } from "@/server/projects/image-upload";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";

test("image uploads use decoded bytes rather than filename or claimed extension", async () => {
  const bytes = await sharp({
    create: {
      width: 20,
      height: 10,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 1 },
    },
  }).webp().toBuffer();
  const upload = await validateImageUpload(bytes, "../../payload.exe");

  assert.equal(upload.mimeType, "image/webp");
  assert.equal(upload.extension, "webp");
  assert.equal(upload.width, 20);
  assert.equal(upload.height, 10);
  assert.equal(upload.filename.includes("/"), false);
  assert.match(upload.sha256, /^[0-9a-f]{64}$/);
});

test("invalid and polyglot-like bytes are rejected by the image decoder", async () => {
  await assert.rejects(
    () => validateImageUpload(Buffer.from("<script>alert(1)</script>"), "art.png"),
    (error) => error instanceof ValidationError && error.code === "UPLOAD_DECODE_FAILED",
  );
});

test("filesystem object keys cannot escape their configured root", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "vortex-store-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FilesystemObjectStore(directory);

  await assert.rejects(() => store.put("../escape.png", new Uint8Array([1]), "image/png"));
  await assert.rejects(() => store.get("/absolute.png"));
  await store.put("projects/safe/art.png", new Uint8Array([1, 2, 3]), "image/png");
  const restored = await store.get("projects/safe/art.png");
  assert.deepEqual([...restored!.bytes], [1, 2, 3]);
});
