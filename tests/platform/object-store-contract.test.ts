import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ObjectStore } from "@/platform/storage/object-store";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import { S3ObjectStore } from "@/server/storage/s3-object-store";

type FakeObject = { bytes: Uint8Array; contentType: string };

function fakeS3() {
  const objects = new Map<string, FakeObject>();
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    const key = url.pathname.split("/").slice(2).map(decodeURIComponent).join("/");
    const authorization = request.headers.get("authorization");
    assert.match(authorization ?? "", /^AWS4-HMAC-SHA256 Credential=test-access\//);
    assert.equal(request.headers.has("x-amz-content-sha256"), true);

    if (request.method === "PUT") {
      const copySource = request.headers.get("x-amz-copy-source");
      if (copySource) {
        const sourceKey = copySource.split("/").slice(2).map(decodeURIComponent).join("/");
        const source = objects.get(sourceKey);
        if (!source) return new Response(null, { status: 404 });
        objects.set(key, { bytes: source.bytes.slice(), contentType: source.contentType });
      } else {
        objects.set(key, {
          bytes: new Uint8Array(await request.arrayBuffer()),
          contentType: request.headers.get("content-type") || "application/octet-stream",
        });
      }
      return new Response(null, { status: 200 });
    }
    if (request.method === "GET") {
      const object = objects.get(key);
      if (!object) return new Response(null, { status: 404 });
      return new Response(Uint8Array.from(object.bytes).buffer, {
        status: 200,
        headers: { "content-type": object.contentType },
      });
    }
    if (request.method === "DELETE") {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  };

  return {
    store: new S3ObjectStore(
      {
        endpoint: "https://account.r2.cloudflarestorage.com",
        region: "auto",
        bucket: "private-assets",
        accessKeyId: "test-access",
        secretAccessKey: "test-secret",
      },
      fetcher,
      () => new Date("2026-08-24T12:34:56.000Z"),
    ),
    requests,
  };
}

async function objectStoreContract(store: ObjectStore) {
  const bytes = new TextEncoder().encode("private artwork");
  assert.equal(await store.get("projects/missing/art.png"), null);
  await store.put("projects/one/art.png", bytes, "image/png");

  const stored = await store.get("projects/one/art.png");
  assert.ok(stored);
  assert.deepEqual([...stored.bytes], [...bytes]);
  assert.equal(stored.byteSize, bytes.byteLength);
  assert.equal(stored.contentType, "image/png");

  await store.copy("projects/one/art.png", "projects/two/copied.png");
  const copied = await store.get("projects/two/copied.png");
  assert.ok(copied);
  assert.deepEqual([...copied.bytes], [...bytes]);
  assert.equal(copied.contentType, "image/png");

  await store.delete("projects/one/art.png");
  await store.delete("projects/one/art.png");
  assert.equal(await store.get("projects/one/art.png"), null);

  await assert.rejects(() => store.get("../secrets"), /Invalid object-store key/);
  await assert.rejects(() => store.put("/absolute", bytes, "text/plain"), /Invalid object-store key/);
  await assert.rejects(() => store.copy("missing/source.png", "target.png"), /does not exist/);
}

test("filesystem object store satisfies the private storage contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vortex-object-store-"));
  await objectStoreContract(new FilesystemObjectStore(directory));
});

test("S3-compatible object store satisfies the private storage contract", async () => {
  const { store, requests } = fakeS3();
  await objectStoreContract(store);
  assert.equal(requests.every((request) => request.url.startsWith("https://")), true);
  assert.equal(
    requests.some((request) => request.headers.get("authorization")?.includes("test-secret")),
    false,
  );
});

test("S3-compatible storage requires HTTPS outside localhost", () => {
  assert.throws(
    () => new S3ObjectStore({
      endpoint: "http://storage.example.com",
      region: "us-east-1",
      bucket: "private-assets",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret",
    }),
    /must use HTTPS/,
  );
});
