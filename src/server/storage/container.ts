import { join } from "node:path";
import type { ObjectStore } from "@/platform/storage/object-store";
import { FilesystemObjectStore } from "./filesystem-object-store";
import { S3ObjectStore } from "./s3-object-store";

let singleton: ObjectStore | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when VORTEX_OBJECT_STORE=s3.`);
  return value;
}

export function createConfiguredObjectStore(): ObjectStore {
  const kind = process.env.VORTEX_OBJECT_STORE?.trim() || "filesystem";
  if (kind === "filesystem") {
    const dataRoot = process.env.VORTEX_DATA_DIR || join(process.cwd(), ".data");
    return new FilesystemObjectStore(join(dataRoot, "objects"));
  }
  if (kind === "s3") {
    return new S3ObjectStore({
      endpoint: required("VORTEX_S3_ENDPOINT"),
      region: process.env.VORTEX_S3_REGION?.trim() || "auto",
      bucket: required("VORTEX_S3_BUCKET"),
      accessKeyId: required("VORTEX_S3_ACCESS_KEY_ID"),
      secretAccessKey: required("VORTEX_S3_SECRET_ACCESS_KEY"),
    });
  }
  throw new Error(`Unsupported VORTEX_OBJECT_STORE value: ${kind}.`);
}

export function getObjectStore(): ObjectStore {
  singleton ??= createConfiguredObjectStore();
  return singleton;
}
