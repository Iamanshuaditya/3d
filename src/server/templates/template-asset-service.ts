import { createHash } from "node:crypto";
import { NotFoundError, ValidationError } from "@/platform/projects/errors";
import type { ObjectStore, StoredObject } from "@/platform/storage/object-store";
import type {
  TemplateAsset,
  TemplateAssetReader,
  TemplateAssetRepository,
} from "@/platform/templates/assets";
import { validateImageUpload } from "@/server/projects/image-upload";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function templateAssetStorageKey(
  assetId: string,
  extension: "png" | "jpg" | "webp",
) {
  if (!UUID.test(assetId)) throw new Error("Template asset ids must be UUIDs.");
  return `template-assets/${assetId}.${extension}`;
}

export class TemplateAssetService implements TemplateAssetReader {
  constructor(
    private readonly repository: TemplateAssetRepository,
    private readonly objectStore: ObjectStore,
    private readonly generateId: () => string = () => crypto.randomUUID(),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  findById(id: string) {
    return this.repository.findById(id);
  }

  list() {
    return this.repository.list();
  }

  async upload(createdBy: string, filename: string, bytes: Uint8Array) {
    if (!createdBy.trim() || createdBy.length > 200) {
      throw new ValidationError("OPERATOR_ID_INVALID", "Operator identity is invalid.");
    }
    const upload = await validateImageUpload(bytes, filename);
    const id = this.generateId();
    const storageKey = templateAssetStorageKey(id, upload.extension);
    await this.objectStore.put(storageKey, upload.bytes, upload.mimeType);
    try {
      const asset = await this.repository.create({
        id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        byteSize: upload.byteSize,
        width: upload.width,
        height: upload.height,
        sha256: upload.sha256,
        storageKey,
        createdBy,
        createdAt: this.clock(),
      });
      console.info(JSON.stringify({
        scope: "vortex-platform",
        event: "template.asset-uploaded",
        templateAssetId: asset.id,
        operatorId: createdBy,
        byteSize: asset.byteSize,
        mimeType: asset.mimeType,
      }));
      return asset;
    } catch (error) {
      await this.objectStore.delete(storageKey);
      throw error;
    }
  }

  async read(id: string): Promise<{ asset: TemplateAsset; object: StoredObject }> {
    const asset = await this.repository.findById(id);
    if (!asset) throw new NotFoundError("Template asset not found.");
    const object = await this.objectStore.get(asset.storageKey);
    if (!object) throw new NotFoundError("Template asset bytes are unavailable.");
    const checksum = createHash("sha256").update(object.bytes).digest("hex");
    if (
      checksum !== asset.sha256 ||
      object.byteSize !== asset.byteSize ||
      object.contentType !== asset.mimeType
    ) {
      throw new ValidationError(
        "TEMPLATE_ASSET_INTEGRITY_FAILED",
        "Template asset bytes do not match the immutable catalogue record.",
      );
    }
    return { asset, object };
  }
}
