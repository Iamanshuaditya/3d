import type {
  BooleanProductOption,
  DimensionProductOption,
  NumberProductOption,
  OptionCondition,
  OptionRule,
  OptionScalar,
  OptionSelection,
  ProductConfigurationProvider,
  ProductOption,
  ProductVersion,
  ResolvedOptionValue,
  ResolvedProductConfiguration,
  SelectProductOption,
} from "./types";
import { ProductDomainError } from "./errors";

const STEP_EPSILON = 1e-8;
const OPTION_VALUE_MAX_LENGTH = 512;
const OPTION_COUNT_MAX = 64;

export function parseOptionSelection(value: unknown): OptionSelection {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ProductDomainError("OPTION_SELECTION_INVALID", "Product options must be an object.");
  }
  const entries = Object.entries(value);
  if (entries.length > OPTION_COUNT_MAX) {
    throw new ProductDomainError(
      "OPTION_SELECTION_INVALID",
      `A configuration cannot contain more than ${OPTION_COUNT_MAX} options.`,
    );
  }
  const selection: OptionSelection = {};
  for (const [key, raw] of entries) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(key)) {
      throw new ProductDomainError("OPTION_SELECTION_INVALID", `Option key ${key} is invalid.`);
    }
    if (
      (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") ||
      (typeof raw === "number" && !Number.isFinite(raw)) ||
      (typeof raw === "string" && raw.length > OPTION_VALUE_MAX_LENGTH)
    ) {
      throw new ProductDomainError(
        "OPTION_SELECTION_INVALID",
        `Option ${key} must contain a finite scalar value.`,
      );
    }
    selection[key] = raw;
  }
  return selection;
}

function valueEquals(left: OptionScalar | undefined, right: OptionScalar) {
  return typeof left === typeof right && left === right;
}

function conditionMatches(condition: OptionCondition, values: OptionSelection) {
  const actual = values[condition.optionId];
  switch (condition.operator) {
    case "equals":
      return valueEquals(actual, condition.value);
    case "not_equals":
      return !valueEquals(actual, condition.value);
    case "in":
      return condition.value.some((candidate) => valueEquals(actual, candidate));
    case "not_in":
      return !condition.value.some((candidate) => valueEquals(actual, candidate));
    case "greater_than":
      return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "greater_than_or_equal":
      return typeof actual === "number" && typeof condition.value === "number" && actual >= condition.value;
    case "less_than":
      return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "less_than_or_equal":
      return typeof actual === "number" && typeof condition.value === "number" && actual <= condition.value;
  }
}

function ruleMatches(rule: OptionRule | undefined, values: OptionSelection) {
  if (!rule) return true;
  const all = rule.all ?? [];
  const any = rule.any ?? [];
  return all.every((condition) => conditionMatches(condition, values)) &&
    (!any.length || any.some((condition) => conditionMatches(condition, values)));
}

function optionDefault(option: ProductOption): OptionScalar | undefined {
  return option.defaultValue;
}

function validateConditions(option: ProductOption, optionIds: Set<string>) {
  const rules: OptionRule[] = [option.visibleWhen, option.availableWhen].filter(
    (rule): rule is OptionRule => Boolean(rule),
  );
  if (option.kind === "select") {
    for (const choice of option.values) {
      if (choice.availableWhen) rules.push(choice.availableWhen);
    }
  }
  for (const rule of rules) {
    for (const condition of [...(rule.all ?? []), ...(rule.any ?? [])]) {
      if (!optionIds.has(condition.optionId)) {
        throw new ProductDomainError(
          "UNKNOWN_OPTION_DEPENDENCY",
          `Option ${option.id} depends on unknown option ${condition.optionId}.`,
        );
      }
      if (condition.optionId === option.id) {
        throw new ProductDomainError(
          "SELF_OPTION_DEPENDENCY",
          `Option ${option.id} cannot depend on itself.`,
        );
      }
    }
  }
}

function validateNumericOption(option: NumberProductOption | DimensionProductOption) {
  if (
    !Number.isFinite(option.min) ||
    !Number.isFinite(option.max) ||
    option.min > option.max ||
    (option.step !== undefined && (!Number.isFinite(option.step) || option.step <= 0))
  ) {
    throw new ProductDomainError("INVALID_OPTION_SCHEMA", `Option ${option.id} has invalid bounds.`);
  }
}

export function validateProductVersion(version: ProductVersion) {
  if (version.status !== "published") {
    throw new ProductDomainError("VERSION_NOT_PUBLISHED", "Only published product versions resolve.");
  }
  if (version.resolution.kind === "static" && version.resolution.productConfig.id !== version.productId) {
    throw new ProductDomainError(
      "PRODUCT_VERSION_MISMATCH",
      "The resolved product config belongs to another product.",
    );
  }
  const optionIds = new Set<string>();
  for (const option of version.definition.options) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(option.id) || optionIds.has(option.id)) {
      throw new ProductDomainError("INVALID_OPTION_SCHEMA", `Option id ${option.id} is invalid or duplicated.`);
    }
    optionIds.add(option.id);
    if (option.kind === "select") {
      const values = new Set<string>();
      for (const choice of option.values) {
        if (!choice.value || values.has(choice.value)) {
          throw new ProductDomainError(
            "INVALID_OPTION_SCHEMA",
            `Option ${option.id} has an invalid or duplicated choice.`,
          );
        }
        values.add(choice.value);
      }
    } else if (option.kind === "number" || option.kind === "dimension") {
      validateNumericOption(option);
    }
  }
  for (const option of version.definition.options) validateConditions(option, optionIds);
}

function stepAligned(value: number, option: NumberProductOption | DimensionProductOption) {
  if (!option.step) return true;
  const steps = (value - option.min) / option.step;
  return Math.abs(steps - Math.round(steps)) <= STEP_EPSILON;
}

function resolveSelect(
  option: SelectProductOption,
  raw: OptionScalar,
  merged: OptionSelection,
): ResolvedOptionValue {
  if (typeof raw !== "string") {
    throw new ProductDomainError("OPTION_TYPE_INVALID", `${option.label} must be a selection.`);
  }
  const choice = option.values.find((candidate) => candidate.value === raw);
  if (!choice) {
    throw new ProductDomainError("OPTION_VALUE_INVALID", `${raw} is not valid for ${option.label}.`);
  }
  if (!ruleMatches(choice.availableWhen, merged)) {
    throw new ProductDomainError(
      "OPTION_VALUE_UNAVAILABLE",
      `${choice.label} is unavailable for the selected configuration.`,
      { optionId: option.id, value: raw },
    );
  }
  return {
    optionId: option.id,
    kind: option.kind,
    value: raw,
    productionValue: choice.productionValue ?? raw,
    displayLabel: choice.label,
  };
}

function resolveNumber(
  option: NumberProductOption | DimensionProductOption,
  raw: OptionScalar,
): ResolvedOptionValue {
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    raw < option.min ||
    raw > option.max ||
    !stepAligned(raw, option)
  ) {
    throw new ProductDomainError(
      "OPTION_VALUE_INVALID",
      `${option.label} must be between ${option.min} and ${option.max}${option.step ? ` in steps of ${option.step}` : ""}.`,
      { optionId: option.id, value: raw },
    );
  }
  let productionValue = raw;
  if (option.kind === "dimension") {
    productionValue = option.unit === "in" ? raw * 25.4 : option.unit === "cm" ? raw * 10 : raw;
  }
  return {
    optionId: option.id,
    kind: option.kind,
    value: raw,
    productionValue,
    displayLabel: `${raw}${option.unit ? ` ${option.unit}` : ""}`,
    unit: option.unit,
  };
}

function resolveBoolean(option: BooleanProductOption, raw: OptionScalar): ResolvedOptionValue {
  if (typeof raw !== "boolean") {
    throw new ProductDomainError("OPTION_TYPE_INVALID", `${option.label} must be true or false.`);
  }
  return {
    optionId: option.id,
    kind: option.kind,
    value: raw,
    productionValue: option.productionValues?.[raw ? "true" : "false"] ?? raw,
    displayLabel: raw ? "Yes" : "No",
  };
}

function encodeIdentity(value: OptionScalar) {
  const type = typeof value === "string" ? "s" : typeof value === "number" ? "n" : "b";
  return `${type}:${encodeURIComponent(String(value))}`;
}

function configurationId(versionId: string, selection: OptionSelection) {
  const values = Object.entries(selection)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeIdentity(value)}`)
    .join("&");
  return `${versionId}|${values}`;
}

export function resolveProductConfiguration(
  version: ProductVersion,
  input: OptionSelection = {},
  providers: Readonly<Record<string, ProductConfigurationProvider>> = {},
): ResolvedProductConfiguration {
  validateProductVersion(version);
  const optionsById = new Map(version.definition.options.map((option) => [option.id, option]));
  for (const key of Object.keys(input)) {
    if (!optionsById.has(key)) {
      throw new ProductDomainError("UNKNOWN_OPTION", `Unknown product option ${key}.`, { optionId: key });
    }
  }

  const merged: OptionSelection = Object.create(null) as OptionSelection;
  for (const option of version.definition.options) {
    const defaultValue = optionDefault(option);
    if (defaultValue !== undefined) merged[option.id] = defaultValue;
  }
  Object.assign(merged, input);

  const resolved: Record<string, ResolvedOptionValue> = Object.create(null) as Record<
    string,
    ResolvedOptionValue
  >;
  const selection: OptionSelection = Object.create(null) as OptionSelection;
  for (const option of version.definition.options) {
    const supplied = Object.hasOwn(input, option.id);
    if (!ruleMatches(option.visibleWhen, merged)) {
      if (supplied) {
        throw new ProductDomainError(
          "OPTION_NOT_VISIBLE",
          `${option.label} is not applicable to this configuration.`,
          { optionId: option.id },
        );
      }
      continue;
    }
    if (!ruleMatches(option.availableWhen, merged)) {
      if (supplied || option.required) {
        throw new ProductDomainError(
          "OPTION_UNAVAILABLE",
          `${option.label} is unavailable for this configuration.`,
          { optionId: option.id },
        );
      }
      continue;
    }
    const raw = merged[option.id];
    if (raw === undefined) {
      if (option.required) {
        throw new ProductDomainError("OPTION_REQUIRED", `${option.label} is required.`, {
          optionId: option.id,
        });
      }
      continue;
    }
    const value = option.kind === "select"
      ? resolveSelect(option, raw, merged)
      : option.kind === "boolean"
        ? resolveBoolean(option, raw)
        : resolveNumber(option, raw);
    resolved[option.id] = value;
    selection[option.id] = value.value;
  }

  let productConfig;
  if (version.resolution.kind === "static") {
    productConfig = structuredClone(version.resolution.productConfig);
  } else {
    const provider = providers[version.resolution.providerId];
    if (!provider) {
      throw new ProductDomainError(
        "RESOLUTION_PROVIDER_MISSING",
        `Product resolver ${version.resolution.providerId} is not registered.`,
      );
    }
    productConfig = provider.resolve({
      version,
      selection,
      options: resolved,
      parameters: version.resolution.parameters,
    });
  }
  if (productConfig.id !== version.productId) {
    throw new ProductDomainError(
      "PRODUCT_VERSION_MISMATCH",
      "The configuration provider returned a different product.",
    );
  }
  const resolvedConfigurationId = configurationId(version.id, selection);
  productConfig.productVersionId = version.id;
  productConfig.configurationId = resolvedConfigurationId;
  productConfig.optionSelection = { ...selection };

  return {
    productId: version.productId,
    productVersionId: version.id,
    configurationId: resolvedConfigurationId,
    selection: { ...selection },
    options: resolved,
    productConfig,
    presentation: version.definition.presentation,
    capabilities: version.definition.capabilities,
    templateCompatibility: [...version.definition.templateCompatibility],
  };
}
