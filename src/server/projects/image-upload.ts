import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ProjectAsset } from "@/platform/projects/types";
import { ValidationError } from "@/platform/projects/errors";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_PIXELS = 40_000_000;

const MIME_BY_FORMAT = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;

const EXTENSION_BY_FORMAT = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
} as const;

export type ValidatedImageUpload = {
  bytes: Uint8Array;
  filename: string;
  mimeType: ProjectAsset["mimeType"];
  extension: "png" | "jpg" | "webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

function safeFilename(input: string) {
  const basename = input.split(/[\\/]/).at(-1) || "artwork";
  const normalized = basename
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._ ()-]/gu, "_")
    .trim();
  return (normalized || "artwork").slice(0, 180);
}

function orientedDimensions(width: number, height: number, orientation?: number) {
  return orientation && orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

export async function validateImageUpload(
  bytes: Uint8Array,
  filename: string,
): Promise<ValidatedImageUpload> {
  if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError(
      "UPLOAD_SIZE_INVALID",
      `Artwork must be between 1 byte and ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }

  try {
    const decoder = sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_UPLOAD_PIXELS,
      sequentialRead: true,
    });
    const metadata = await decoder.metadata();
    const format = metadata.format as keyof typeof MIME_BY_FORMAT | undefined;
    if (!format || !MIME_BY_FORMAT[format]) {
      throw new ValidationError(
        "UPLOAD_TYPE_UNSUPPORTED",
        "Artwork must decode as PNG, JPEG, or WebP.",
      );
    }
    if (!metadata.width || !metadata.height) {
      throw new ValidationError("UPLOAD_DECODE_FAILED", "Artwork dimensions are unavailable.");
    }
    if ((metadata.pages ?? 1) !== 1) {
      throw new ValidationError(
        "UPLOAD_ANIMATION_UNSUPPORTED",
        "Animated or multi-page artwork is not supported.",
      );
    }
    // `stats()` forces a full decode. Metadata alone is insufficient because a
    // truncated image may still contain a valid header and dimensions.
    await decoder.stats();
    const dimensions = orientedDimensions(metadata.width, metadata.height, metadata.orientation);
    return {
      bytes,
      filename: safeFilename(filename),
      mimeType: MIME_BY_FORMAT[format],
      extension: EXTENSION_BY_FORMAT[format],
      byteSize: bytes.byteLength,
      width: dimensions.width,
      height: dimensions.height,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(
      "UPLOAD_DECODE_FAILED",
      "The uploaded file could not be safely decoded as PNG, JPEG, or WebP.",
    );
  }
}

