import { createHash } from "node:crypto";
import { NotFoundError, ValidationError } from "@/platform/projects/errors";
import type { ObjectStore, StoredObject } from "@/platform/storage/object-store";
import type {
  ProductionFont,
  ProductionFontDto,
  ProductionFontReader,
  ProductionFontRepository,
} from "@/platform/production/fonts";

export const MAX_PRODUCTION_FONT_BYTES = 10 * 1024 * 1024;
const TEXT = /^[\p{L}\p{N}][\p{L}\p{N} ._()/'&+-]{0,159}$/u;

function dto(font: ProductionFont): ProductionFontDto {
  const { storageKey, ...publicFont } = font;
  void storageKey;
  return publicFont;
}

function detectFont(bytes: Uint8Array) {
  if (bytes.byteLength < 12 || bytes.byteLength > MAX_PRODUCTION_FONT_BYTES) {
    throw new ValidationError("PRODUCTION_FONT_SIZE_INVALID", "Font file size is invalid.");
  }
  const signature = Buffer.from(bytes.subarray(0, 4));
  const ttf = signature.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || signature.toString("ascii") === "true";
  const otf = signature.toString("ascii") === "OTTO";
  if (!ttf && !otf) {
    throw new ValidationError("PRODUCTION_FONT_FORMAT_INVALID", "Only OpenType and TrueType font files are accepted.");
  }
  const tableCount = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(4);
  if (tableCount < 4 || tableCount > 128 || 12 + tableCount * 16 > bytes.byteLength) {
    throw new ValidationError("PRODUCTION_FONT_FORMAT_INVALID", "Font table directory is invalid.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tags = new Set<string>();
  for (let index = 0; index < tableCount; index += 1) {
    const directoryOffset = 12 + index * 16;
    const tag = new TextDecoder("ascii").decode(bytes.subarray(directoryOffset, directoryOffset + 4));
    const offset = view.getUint32(directoryOffset + 8);
    const length = view.getUint32(directoryOffset + 12);
    if (!/^[\x20-\x7e]{4}$/.test(tag) || !length || offset + length > bytes.byteLength) {
      throw new ValidationError("PRODUCTION_FONT_FORMAT_INVALID", "Font table directory is invalid.");
    }
    tags.add(tag);
  }
  if (["head", "cmap", "name", "maxp"].some((tag) => !tags.has(tag))) {
    throw new ValidationError("PRODUCTION_FONT_FORMAT_INVALID", "Font is missing required tables.");
  }
  return ttf
    ? { format: "ttf" as const, mimeType: "font/ttf" as const }
    : { format: "otf" as const, mimeType: "font/otf" as const };
}

export class ProductionFontService implements ProductionFontReader {
  constructor(
    private readonly repository: ProductionFontRepository,
    private readonly objectStore: ObjectStore,
    private readonly generateId: () => string = () => crypto.randomUUID(),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  find(family: string, weight: number, style: ProductionFont["style"]) {
    return this.repository.find(family, weight, style);
  }

  async list(): Promise<ProductionFontDto[]> {
    return (await this.repository.list()).map(dto);
  }

  async register(input: {
    approvedBy: string;
    family: string;
    weight: number;
    style: ProductionFont["style"];
    filename: string;
    licenseName: string;
    licenseReference: string;
    bytes: Uint8Array;
  }): Promise<ProductionFontDto> {
    const family = input.family.trim();
    const licenseName = input.licenseName.trim();
    const licenseReference = input.licenseReference.trim();
    if (!TEXT.test(family) || !TEXT.test(licenseName) ||
      !licenseReference || licenseReference.length > 500 ||
      !Number.isInteger(input.weight) || input.weight < 100 || input.weight > 900 ||
      input.weight % 100 !== 0 || !["normal", "italic"].includes(input.style)) {
      throw new ValidationError("PRODUCTION_FONT_METADATA_INVALID", "Font approval metadata is invalid.");
    }
    const detected = detectFont(input.bytes);
    const id = this.generateId();
    const storageKey = `production-fonts/${id}.${detected.format}`;
    const filename = input.filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "")
      .slice(-160) || `font.${detected.format}`;
    const font: ProductionFont = {
      id,
      family,
      weight: input.weight,
      style: input.style,
      format: detected.format,
      filename,
      mimeType: detected.mimeType,
      byteSize: input.bytes.byteLength,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      storageKey,
      licenseName,
      licenseReference,
      approvedBy: input.approvedBy,
      createdAt: this.clock(),
    };
    await this.objectStore.put(storageKey, input.bytes, detected.mimeType);
    try {
      await this.repository.create(font);
    } catch (error) {
      await this.objectStore.delete(storageKey);
      throw error;
    }
    console.info(JSON.stringify({
      scope: "vortex-platform",
      event: "production.font-registered",
      productionFontId: font.id,
      family: font.family,
      weight: font.weight,
      style: font.style,
      operatorId: font.approvedBy,
    }));
    return dto(font);
  }

  async read(id: string): Promise<{ font: ProductionFontDto; object: StoredObject }> {
    const font = await this.repository.findById(id);
    if (!font) throw new NotFoundError("Production font not found.");
    const object = await this.objectStore.get(font.storageKey);
    const sha256 = object ? createHash("sha256").update(object.bytes).digest("hex") : null;
    if (!object || object.contentType !== font.mimeType || object.byteSize !== font.byteSize || sha256 !== font.sha256) {
      throw new ValidationError("PRODUCTION_FONT_INTEGRITY_FAILED", "Production font failed integrity verification.");
    }
    return { font: dto(font), object };
  }
}
