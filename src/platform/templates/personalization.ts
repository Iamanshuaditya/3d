import type {
  DesignDocument,
  PersonalizationData,
  PersonalizationScalar,
} from "@/types/configurator";
import type { PlaceholderDefinition } from "./types";
import { TemplateDomainError } from "./errors";

const MAX_DEPTH = 8;
const MAX_FIELDS = 256;
const MAX_STRING_LENGTH = 2_000;
const FIELD_KEY = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/i;

export function validateFieldKey(key: string) {
  if (!FIELD_KEY.test(key) || key.length > 128) {
    throw new TemplateDomainError("INVALID_FIELD_KEY", `Personalization field ${key} is invalid.`);
  }
}

export function parsePersonalizationData(value: unknown): PersonalizationData {
  if (value === undefined || value === null) return {};
  let fields = 0;

  const visit = (candidate: unknown, depth: number): PersonalizationData => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || depth > MAX_DEPTH) {
      throw new TemplateDomainError(
        "PERSONALIZATION_INVALID",
        "Personalization data must be a bounded object of scalar values.",
      );
    }
    const result: PersonalizationData = {};
    for (const [key, nested] of Object.entries(candidate)) {
      if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(key)) {
        throw new TemplateDomainError(
          "PERSONALIZATION_INVALID",
          `Personalization key ${key} is invalid.`,
        );
      }
      if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
        result[key] = visit(nested, depth + 1);
        continue;
      }
      if (
        nested !== null &&
        typeof nested !== "string" &&
        typeof nested !== "number" &&
        typeof nested !== "boolean"
      ) {
        throw new TemplateDomainError(
          "PERSONALIZATION_INVALID",
          `Personalization field ${key} must be a scalar value.`,
        );
      }
      if (
        (typeof nested === "number" && !Number.isFinite(nested)) ||
        (typeof nested === "string" && nested.length > MAX_STRING_LENGTH)
      ) {
        throw new TemplateDomainError(
          "PERSONALIZATION_INVALID",
          `Personalization field ${key} exceeds its limits.`,
        );
      }
      fields += 1;
      if (fields > MAX_FIELDS) {
        throw new TemplateDomainError(
          "PERSONALIZATION_INVALID",
          `Personalization cannot contain more than ${MAX_FIELDS} fields.`,
        );
      }
      result[key] = nested as PersonalizationScalar;
    }
    return result;
  };

  return visit(value, 1);
}

export function personalizationValue(
  data: PersonalizationData,
  key: string,
): PersonalizationScalar | undefined {
  validateFieldKey(key);
  let current: PersonalizationData | PersonalizationScalar = data;
  for (const segment of key.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
    if (current === undefined) return undefined;
  }
  return current && typeof current === "object" ? undefined : current;
}

export function mergePersonalizationData(
  base: PersonalizationData,
  override: PersonalizationData,
): PersonalizationData {
  const merged: PersonalizationData = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    merged[key] =
      value && typeof value === "object" && existing && typeof existing === "object"
        ? mergePersonalizationData(existing, value)
        : structuredClone(value);
  }
  return merged;
}

export function validatePlaceholderValues(
  definitions: PlaceholderDefinition[],
  data: PersonalizationData,
  options: { requireRequired?: boolean } = {},
) {
  for (const definition of definitions) {
    validateFieldKey(definition.key);
    const value = personalizationValue(data, definition.key);
    if (
      options.requireRequired !== false &&
      definition.required &&
      (value === undefined || value === null || value === "")
    ) {
      throw new TemplateDomainError(
        "PLACEHOLDER_REQUIRED",
        `${definition.label} is required.`,
        { key: definition.key },
      );
    }
    const rendered = value === undefined || value === null ? "" : String(value);
    if (definition.maxLength && rendered.length > definition.maxLength) {
      throw new TemplateDomainError(
        "PLACEHOLDER_TOO_LONG",
        `${definition.label} cannot exceed ${definition.maxLength} characters.`,
        { key: definition.key },
      );
    }
  }
}

export function applyPersonalization(
  document: DesignDocument,
  rawData: unknown,
): DesignDocument {
  const data = parsePersonalizationData(rawData);
  return {
    ...structuredClone(document),
    personalization: data,
    surfaces: Object.fromEntries(
      Object.entries(document.surfaces).map(([surfaceId, surface]) => [
        surfaceId,
        {
          ...surface,
          elements: surface.elements.map((element) => {
            if (element.type !== "text" || !element.binding) return structuredClone(element);
            const value = personalizationValue(data, element.binding.key);
            return {
              ...structuredClone(element),
              text: value === undefined || value === null
                ? element.binding.fallback ?? element.text
                : String(value),
            };
          }),
        },
      ]),
    ),
  };
}
