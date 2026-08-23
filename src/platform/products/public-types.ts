export type PublicOptionScalar = string | number | boolean;

export type ProductOptionConditionDto = {
  optionId: string;
  operator:
    | "equals"
    | "not_equals"
    | "in"
    | "not_in"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal";
  value: PublicOptionScalar | PublicOptionScalar[];
};

export type ProductOptionRuleDto = {
  all?: ProductOptionConditionDto[];
  any?: ProductOptionConditionDto[];
};

type ProductOptionBaseDto = {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  visibleWhen?: ProductOptionRuleDto;
  availableWhen?: ProductOptionRuleDto;
};

export type ProductOptionDto =
  | (ProductOptionBaseDto & {
      kind: "select";
      defaultValue?: string;
      values: Array<{
        value: string;
        label: string;
        availableWhen?: ProductOptionRuleDto;
      }>;
    })
  | (ProductOptionBaseDto & {
      kind: "number";
      min: number;
      max: number;
      step?: number;
      unit?: string;
      defaultValue?: number;
    })
  | (ProductOptionBaseDto & {
      kind: "dimension";
      min: number;
      max: number;
      step?: number;
      unit: "mm" | "cm" | "in";
      productionUnit: "mm";
      defaultValue?: number;
    })
  | (ProductOptionBaseDto & {
      kind: "boolean";
      defaultValue?: boolean;
    });

export type ProductCapabilitiesDto = {
  multiSurface: boolean;
  embroideryPreview: boolean;
  unfolding: boolean;
  parameterizedDimensions: boolean;
  templates: boolean;
};

export type ProductVersionReferenceDto = {
  id: string;
  version: number;
  publishedAt: string;
  current: boolean;
};

export type ProductSummaryDto = {
  id: string;
  name: string;
  description: string | null;
  status: "published";
  visibility: "public" | "unlisted";
  currentVersion: ProductVersionReferenceDto;
  presentationMode: "2d-first" | "2d-3d-split" | "packaging" | "garment";
  capabilities: ProductCapabilitiesDto;
  configurable: boolean;
  options: ProductOptionDto[];
  links: {
    self: string;
    resolve: string;
    quotes: string;
    templates: string;
  };
};

export type ProductDetailDto = ProductSummaryDto & {
  selectedVersion: ProductVersionReferenceDto;
  versions: ProductVersionReferenceDto[];
  templateCompatibility: string[];
};

export type ResolvedProductSurfaceDto = {
  id: string;
  label: string;
  navigation: {
    id: string;
    kind: "page" | "print-area" | "continuous-web";
    order: number;
    pageNumber?: number;
    side?: "front" | "back" | "inside" | "outside";
  };
  physical: {
    widthMm: number;
    heightMm: number;
    displayUnit: "cm" | "in";
  };
  renderModes: Array<"print" | "embroidery">;
  regions: Array<{
    id: string;
    label: string;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
    rotationDegrees: number;
  }>;
};

export type ResolvedProductConfigurationDto = {
  productId: string;
  name: string;
  productVersionId: string;
  configurationId: string;
  selection: Record<string, PublicOptionScalar>;
  resolvedOptions: Record<
    string,
    {
      kind: "select" | "number" | "dimension" | "boolean";
      value: PublicOptionScalar;
      displayLabel: string;
      unit?: string;
    }
  >;
  presentation: {
    mode: "2d-first" | "2d-3d-split" | "packaging" | "garment";
    previewKind: "2d-proof" | "3d-product";
    navigationLabel: "Pages" | "Print areas" | "Printable surfaces";
  };
  capabilities: ProductCapabilitiesDto;
  surfaces: ResolvedProductSurfaceDto[];
  production: {
    profileId: string;
    standard: "PDF/X-4";
    approval: "generic" | "simulated-company" | "factory-approved";
    formats: Array<"pdf" | "svg">;
  };
  templateCompatibility: string[];
  links: {
    product: string;
    quotes: string;
    studio: string;
    templates: string;
  };
};
