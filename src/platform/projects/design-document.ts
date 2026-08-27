import type {
  DesignDocument,
  DesignElement,
  ImageElement,
  ImageCrop,
  SurfaceDesign,
  TextElement,
} from "@/types/configurator";
import {
  PROJECT_MAX_ELEMENTS,
  PROJECT_MAX_SURFACES,
  PROJECT_TITLE_MAX_LENGTH,
} from "./types";
import { ValidationError } from "./errors";
import { parsePersonalizationData } from "@/platform/templates/personalization";
import { TemplateDomainError } from "@/platform/templates/errors";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, max = 512): string {
  const value = record[key];
  if (typeof value !== "string" || !value.length || value.length > max) {
    throw new ValidationError("INVALID_DESIGN", `${key} must be a non-empty string.`);
  }
  return value;
}

function optionalString(record: JsonRecord, key: string, max = 512): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max) {
    throw new ValidationError("INVALID_DESIGN", `${key} must be a string.`);
  }
  return value;
}

function requiredNumber(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError("INVALID_DESIGN", `${key} must be a finite number.`);
  }
  return value;
}

function boundedNumber(
  record: JsonRecord,
  key: string,
  options: { min: number; max: number; integer?: boolean },
): number {
  const value = requiredNumber(record, key);
  if (value < options.min || value > options.max || (options.integer && !Number.isInteger(value))) {
    throw new ValidationError(
      "INVALID_DESIGN",
      `${key} must be between ${options.min} and ${options.max}.`,
    );
  }
  return value;
}

function optionalPositiveInteger(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ValidationError("INVALID_DESIGN", `${key} must be a positive integer.`);
  }
  return value as number;
}

function optionalBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ValidationError("INVALID_DESIGN", `${key} must be a boolean.`);
  }
  return value;
}

function parseTreatment(value: unknown): ImageElement["treatment"] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || (value.mode !== "print" && value.mode !== "embroidery")) {
    throw new ValidationError("INVALID_DESIGN", "Artwork treatment is invalid.");
  }
  if (value.mode === "print") return { mode: "print" };
  if (!isRecord(value.settings)) {
    throw new ValidationError("INVALID_DESIGN", "Embroidery settings are missing.");
  }
  const settings = value.settings;
  return {
    mode: "embroidery",
    settings: {
      densityMm: boundedNumber(settings, "densityMm", { min: 0.1, max: 5 }),
      threadWidthMm: boundedNumber(settings, "threadWidthMm", { min: 0.05, max: 5 }),
      stitchLengthMm: boundedNumber(settings, "stitchLengthMm", { min: 0.1, max: 20 }),
      maxColours: boundedNumber(settings, "maxColours", { min: 1, max: 16, integer: true }),
      sheen: boundedNumber(settings, "sheen", { min: 0, max: 1 }),
      satinMaxWidthMm: boundedNumber(settings, "satinMaxWidthMm", { min: 0.1, max: 50 }),
      reliefMm: boundedNumber(settings, "reliefMm", { min: 0, max: 10 }),
    },
  };
}

function parseCrop(value: unknown): ImageCrop | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new ValidationError("INVALID_DESIGN", "Image crop is invalid.");
  }
  const crop = {
    x: boundedNumber(value, "x", { min: 0, max: 1 }),
    y: boundedNumber(value, "y", { min: 0, max: 1 }),
    width: boundedNumber(value, "width", { min: 0.01, max: 1 }),
    height: boundedNumber(value, "height", { min: 0.01, max: 1 }),
  };
  if (crop.x + crop.width > 1.000_001 || crop.y + crop.height > 1.000_001) {
    throw new ValidationError("INVALID_DESIGN", "Image crop falls outside its source asset.");
  }
  return crop;
}

function transform(record: JsonRecord) {
  return {
    x: boundedNumber(record, "x", { min: -10_000_000, max: 10_000_000 }),
    y: boundedNumber(record, "y", { min: -10_000_000, max: 10_000_000 }),
    rotation: boundedNumber(record, "rotation", { min: -36_000, max: 36_000 }),
    scaleX: boundedNumber(record, "scaleX", { min: -100, max: 100 }),
    scaleY: boundedNumber(record, "scaleY", { min: -100, max: 100 }),
    opacity: boundedNumber(record, "opacity", { min: 0, max: 1 }),
  };
}

function parseBinding(value: unknown): TextElement["binding"] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.type !== "field") {
    throw new ValidationError("INVALID_DESIGN", "Text binding is invalid.");
  }
  const key = requiredString(value, "key", 128);
  if (!/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/i.test(key)) {
    throw new ValidationError("INVALID_DESIGN", `Text binding ${key} is invalid.`);
  }
  return {
    type: "field",
    key,
    fallback: optionalString(value, "fallback", 2_000),
  };
}

function parseElement(value: unknown): DesignElement {
  if (!isRecord(value)) {
    throw new ValidationError("INVALID_DESIGN", "A design element is invalid.");
  }
  const id = requiredString(value, "id", 128);
  if (value.type === "image") {
    const assetId = optionalString(value, "assetId", 128);
    const src = optionalString(value, "src", 4_096);
    if (!assetId && !src) {
      throw new ValidationError(
        "INVALID_DESIGN",
        `Image element ${id} has neither a stable asset id nor a runtime source.`,
      );
    }
    return {
      id,
      type: "image",
      ...(assetId ? { assetId } : {}),
      ...(src ? { src } : {}),
      sourcePixelWidth: optionalPositiveInteger(value, "sourcePixelWidth"),
      sourcePixelHeight: optionalPositiveInteger(value, "sourcePixelHeight"),
      sourceName: optionalString(value, "sourceName", 255),
      sourceMimeType: optionalString(value, "sourceMimeType", 128),
      crop: parseCrop(value.crop),
      width: boundedNumber(value, "width", { min: 0.001, max: 10_000_000 }),
      height: boundedNumber(value, "height", { min: 0.001, max: 10_000_000 }),
      ...transform(value),
      locked: optionalBoolean(value, "locked"),
      treatment: parseTreatment(value.treatment),
    };
  }
  if (value.type === "text") {
    const parsed: TextElement = {
      id,
      type: "text",
      text: typeof value.text === "string" && value.text.length <= 20_000
        ? value.text
        : (() => {
            throw new ValidationError("INVALID_DESIGN", `Text element ${id} is invalid.`);
          })(),
      fontFamily: requiredString(value, "fontFamily", 256),
      fontSize: boundedNumber(value, "fontSize", { min: 0.1, max: 10_000 }),
      fill: requiredString(value, "fill", 128),
      ...transform(value),
      locked: optionalBoolean(value, "locked"),
      binding: parseBinding(value.binding),
    };
    return parsed;
  }
  throw new ValidationError("INVALID_DESIGN", `Element ${id} has an unknown type.`);
}

function parseSurface(value: unknown): SurfaceDesign {
  if (!isRecord(value) || !Array.isArray(value.elements)) {
    throw new ValidationError("INVALID_DESIGN", "A surface design is invalid.");
  }
  const background = value.background;
  if (background !== null && (typeof background !== "string" || background.length > 128)) {
    throw new ValidationError("INVALID_DESIGN", "Surface background is invalid.");
  }
  return {
    background,
    elements: value.elements.map(parseElement),
  };
}

export function parseDesignDocument(value: unknown): DesignDocument {
  if (!isRecord(value) || !isRecord(value.surfaces)) {
    throw new ValidationError("INVALID_DESIGN", "Design document is invalid.");
  }
  const productId = requiredString(value, "productId", 128);
  const entries = Object.entries(value.surfaces);
  if (!entries.length || entries.length > PROJECT_MAX_SURFACES) {
    throw new ValidationError("INVALID_DESIGN", "Design surface count is invalid.");
  }
  let elementCount = 0;
  const elementIds = new Set<string>();
  const surfaces: DesignDocument["surfaces"] = {};
  for (const [surfaceId, surface] of entries) {
    if (!surfaceId || surfaceId.length > 128) {
      throw new ValidationError("INVALID_DESIGN", "A surface id is invalid.");
    }
    const parsed = parseSurface(surface);
    elementCount += parsed.elements.length;
    if (elementCount > PROJECT_MAX_ELEMENTS) {
      throw new ValidationError("INVALID_DESIGN", "Design has too many elements.");
    }
    for (const element of parsed.elements) {
      if (elementIds.has(element.id)) {
        throw new ValidationError("INVALID_DESIGN", `Element id ${element.id} is duplicated.`);
      }
      elementIds.add(element.id);
    }
    surfaces[surfaceId] = parsed;
  }
  let personalization;
  try {
    personalization = value.personalization === undefined
      ? undefined
      : parsePersonalizationData(value.personalization);
  } catch (error) {
    if (error instanceof TemplateDomainError) {
      throw new ValidationError("INVALID_DESIGN", error.message);
    }
    throw error;
  }
  return { productId, surfaces, ...(personalization ? { personalization } : {}) };
}

export function normalizeProjectTitle(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") {
    throw new ValidationError("INVALID_TITLE", "Project title must be text.");
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > PROJECT_TITLE_MAX_LENGTH) {
    throw new ValidationError(
      "INVALID_TITLE",
      `Project title must be between 1 and ${PROJECT_TITLE_MAX_LENGTH} characters.`,
    );
  }
  return normalized;
}

export function collectAssetIds(design: DesignDocument): string[] {
  const ids = new Set<string>();
  for (const surface of Object.values(design.surfaces)) {
    for (const element of surface.elements) {
      if (element.type === "image" && element.assetId) ids.add(element.assetId);
    }
  }
  return [...ids];
}

/** Remove browser-only locators before a document becomes an immutable revision. */
export function stripRuntimeImageSources(design: DesignDocument): DesignDocument {
  return {
    ...design,
    surfaces: Object.fromEntries(
      Object.entries(design.surfaces).map(([surfaceId, surface]) => [
        surfaceId,
        {
          ...surface,
          elements: surface.elements.map((element) => {
            if (element.type !== "image" || !element.assetId) return element;
            const persistent = { ...element };
            delete persistent.src;
            return persistent;
          }),
        },
      ]),
    ),
  };
}

export function hydrateImageSources(
  design: DesignDocument,
  sourceFor: (assetId: string) => string,
): DesignDocument {
  return {
    ...design,
    surfaces: Object.fromEntries(
      Object.entries(design.surfaces).map(([surfaceId, surface]) => [
        surfaceId,
        {
          ...surface,
          elements: surface.elements.map((element) =>
            element.type === "image" && element.assetId
              ? { ...element, src: sourceFor(element.assetId) }
              : element,
          ),
        },
      ]),
    ),
  };
}

export function replaceAssetIds(
  design: DesignDocument,
  replacements: ReadonlyMap<string, string>,
): DesignDocument {
  return {
    ...design,
    surfaces: Object.fromEntries(
      Object.entries(design.surfaces).map(([surfaceId, surface]) => [
        surfaceId,
        {
          ...surface,
          elements: surface.elements.map((element) => {
            if (element.type !== "image" || !element.assetId) return element;
            const replacement = replacements.get(element.assetId);
            return replacement ? { ...element, assetId: replacement, src: undefined } : element;
          }),
        },
      ]),
    ),
  };
}
