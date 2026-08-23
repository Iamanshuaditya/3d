import type { ProductConfig } from "@/types/configurator";

export type OptionScalar = string | number | boolean;
export type OptionSelection = Record<string, OptionScalar>;

export type OptionCondition =
  | {
      optionId: string;
      operator: "equals" | "not_equals" | "greater_than" | "greater_than_or_equal" | "less_than" | "less_than_or_equal";
      value: OptionScalar;
    }
  | {
      optionId: string;
      operator: "in" | "not_in";
      value: OptionScalar[];
    };

export type OptionRule = {
  all?: OptionCondition[];
  any?: OptionCondition[];
};

type ProductOptionBase = {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
  visibleWhen?: OptionRule;
  availableWhen?: OptionRule;
};

export type SelectOptionChoice = {
  value: string;
  label: string;
  productionValue?: OptionScalar;
  availableWhen?: OptionRule;
};

export type SelectProductOption = ProductOptionBase & {
  kind: "select";
  values: SelectOptionChoice[];
  defaultValue?: string;
};

export type NumberProductOption = ProductOptionBase & {
  kind: "number";
  min: number;
  max: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
};

export type DimensionProductOption = ProductOptionBase & {
  kind: "dimension";
  min: number;
  max: number;
  step?: number;
  unit: "mm" | "cm" | "in";
  /** Resolvers always receive the production value in this unit. */
  productionUnit: "mm";
  defaultValue?: number;
};

export type BooleanProductOption = ProductOptionBase & {
  kind: "boolean";
  defaultValue?: boolean;
  productionValues?: { true: OptionScalar; false: OptionScalar };
};

export type ProductOption =
  | SelectProductOption
  | NumberProductOption
  | DimensionProductOption
  | BooleanProductOption;

export type ProductPresentationMode =
  | "2d-first"
  | "2d-3d-split"
  | "packaging"
  | "garment";

export type ProductCapabilities = {
  multiSurface: boolean;
  embroideryPreview: boolean;
  unfolding: boolean;
  parameterizedDimensions: boolean;
  templates: boolean;
};

export type ProductDefinitionSnapshot = {
  name: string;
  description?: string;
  options: ProductOption[];
  presentation: { mode: ProductPresentationMode };
  capabilities: ProductCapabilities;
  templateCompatibility: string[];
};

export type ProductDefinition = ProductDefinitionSnapshot & {
  id: string;
  status: "draft" | "published";
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductResolutionSpec =
  | { kind: "static"; productConfig: ProductConfig }
  | { kind: "provider"; providerId: string; parameters?: Record<string, unknown> };

export type ProductVersion = {
  id: string;
  productId: string;
  version: number;
  status: "published";
  definition: ProductDefinitionSnapshot;
  resolution: ProductResolutionSpec;
  publishedAt: string;
};

export type ResolvedOptionValue = {
  optionId: string;
  kind: ProductOption["kind"];
  value: OptionScalar;
  productionValue: OptionScalar;
  displayLabel: string;
  unit?: string;
};

export type ResolvedProductConfiguration = {
  productId: string;
  productVersionId: string;
  configurationId: string;
  selection: OptionSelection;
  options: Record<string, ResolvedOptionValue>;
  productConfig: ProductConfig;
  presentation: ProductDefinitionSnapshot["presentation"];
  capabilities: ProductCapabilities;
  templateCompatibility: string[];
};

export type ProductConfigurationProviderContext = {
  version: ProductVersion;
  selection: OptionSelection;
  options: Readonly<Record<string, ResolvedOptionValue>>;
  parameters?: Record<string, unknown>;
};

export interface ProductConfigurationProvider {
  resolve(context: ProductConfigurationProviderContext): ProductConfig;
}

export interface ProductCatalogReader {
  currentVersion(productId: string): Promise<ProductVersion>;
  version(productId: string, versionId: string): Promise<ProductVersion>;
  definition(productId: string): Promise<ProductDefinition>;
  resolve(
    productId: string,
    versionId: string | null,
    selection?: OptionSelection,
  ): Promise<ResolvedProductConfiguration>;
}
