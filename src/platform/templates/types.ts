import type { DesignDocument, PersonalizationData } from "@/types/configurator";
import type { OptionSelection } from "@/platform/products/types";

export type TemplateTaxonomy = {
  category: string;
  subcategory?: string;
  tags: string[];
  style?: string;
  industry?: string;
  occasion?: string;
  colorFamilies: string[];
  languages: string[];
};

export type TemplateCompatibility = {
  productId: string;
  /** Published templates target immutable product/configuration identities. */
  productVersionId: string;
  configurationId: string;
  /** Reproduces the exact resolved configuration used to validate the document. */
  optionSelection: OptionSelection;
};

export type PlaceholderDefinition = {
  key: string;
  label: string;
  type: "text";
  required?: boolean;
  maxLength?: number;
};

export type DesignTemplateDefinition = {
  id: string;
  status: "draft" | "published";
  currentVersionId: string | null;
  name: string;
  description?: string;
  taxonomy: TemplateTaxonomy;
  createdAt: string;
  updatedAt: string;
};

export type DesignTemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  status: "published";
  name: string;
  description?: string;
  taxonomy: TemplateTaxonomy;
  compatibility: TemplateCompatibility[];
  designDocumentTemplate: DesignDocument;
  placeholderDefinitions: PlaceholderDefinition[];
  defaultPersonalization: PersonalizationData;
  /** Stable platform asset ids referenced by the document, when present. */
  assetIds: string[];
  publishedAt: string;
};

export type TemplateListQuery = {
  productId?: string;
  productVersionId?: string;
  configurationId?: string;
  category?: string;
  search?: string;
};

export type TemplateSummaryDto = {
  id: string;
  versionId: string;
  version: number;
  name: string;
  description?: string;
  taxonomy: TemplateTaxonomy;
  compatibility: TemplateCompatibility[];
  placeholderDefinitions: PlaceholderDefinition[];
  defaultPersonalization: PersonalizationData;
  previewUrl: string;
};

export type DesignTemplateDto = TemplateSummaryDto & {
  designDocumentTemplate: DesignDocument;
};

/** Foundation for bounded CSV imports without creating another design model. */
export type PersonalizationDataset = {
  id: string;
  columns: string[];
  rows: PersonalizationData[];
};

export type PersonalizedTemplateVariant = {
  templateVersionId: string;
  rowIndex: number;
  personalization: PersonalizationData;
};
