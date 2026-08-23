import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, normalize, relative, resolve } from "node:path";
import type { ObjectStore, StoredObject } from "@/platform/storage/object-store";

type Metadata = { contentType: string };

function assertStorageKey(key: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_\-.]{0,511}$/.test(key) || key.includes("..")) {
    throw new Error("Invalid object-store key.");
  }
}

export class FilesystemObjectStore implements ObjectStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    assertStorageKey(key);
    const target = resolve(this.root, normalize(key));
    const pathFromRoot = relative(this.root, target);
    if (!pathFromRoot || pathFromRoot.startsWith("..") || pathFromRoot.startsWith("/")) {
      throw new Error("Object-store key escaped its configured root.");
    }
    return target;
  }

  private metadataPath(key: string) {
    return `${this.pathFor(key)}.metadata.json`;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const target = this.pathFor(key);
    const metadataTarget = this.metadataPath(key);
    await mkdir(dirname(target), { recursive: true });
    const nonce = `${process.pid}-${crypto.randomUUID()}`;
    const temporary = `${target}.${nonce}.tmp`;
    const metadataTemporary = `${metadataTarget}.${nonce}.tmp`;
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await writeFile(
      metadataTemporary,
      JSON.stringify({ contentType } satisfies Metadata),
      { flag: "wx", mode: 0o600 },
    );
    await rename(temporary, target);
    await rename(metadataTemporary, metadataTarget);
  }

  async get(key: string): Promise<StoredObject | null> {
    const target = this.pathFor(key);
    try {
      const [bytes, metadataRaw, information] = await Promise.all([
        readFile(target),
        readFile(this.metadataPath(key), "utf8"),
        stat(target),
      ]);
      const metadata = JSON.parse(metadataRaw) as Metadata;
      return {
        bytes,
        contentType: metadata.contentType || "application/octet-stream",
        byteSize: information.size,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const source = await this.get(sourceKey);
    if (!source) throw new Error(`Source object ${sourceKey} does not exist.`);
    await this.put(destinationKey, source.bytes, source.contentType);
  }

  async delete(key: string): Promise<void> {
    await Promise.all([
      rm(this.pathFor(key), { force: true }),
      rm(this.metadataPath(key), { force: true }),
    ]);
  }
}

export function projectAssetStorageKey(
  projectId: string,
  assetId: string,
  extension: "png" | "jpg" | "webp",
) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(projectId) || !uuid.test(assetId)) {
    throw new Error("Project and asset ids must be UUIDs.");
  }
  return `projects/${projectId}/${assetId}.${extension}`;
}

export function productionArtifactStorageKey(
  projectId: string,
  artifactId: string,
  extension: "pdf",
) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(projectId) || !uuid.test(artifactId)) {
    throw new Error("Project and production artifact ids must be UUIDs.");
  }
  return `production/${projectId}/${artifactId}.${extension}`;
}
