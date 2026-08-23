import { createEmptyDocument } from "@/lib/configurator/design-state";
import { PRODUCTS } from "@/lib/configurator/product-config";
import { legacyProductVersion } from "@/lib/configurator/product-definitions";
import { resolveProductConfiguration } from "@/platform/products/configuration-resolver";
import { applyPersonalization } from "@/platform/templates/personalization";
import type {
  DesignTemplateDefinition,
  DesignTemplateVersion,
  PlaceholderDefinition,
  TemplateTaxonomy,
} from "@/platform/templates/types";
import type { PersonalizationData, TextElement } from "@/types/configurator";

const PUBLISHED_AT = "2026-08-23T12:00:00.000Z";

type FixtureInput = {
  id: string;
  name: string;
  description: string;
  productId: "tshirt" | "mailer-box-001" | "bottle-001";
  taxonomy: TemplateTaxonomy;
  placeholders: PlaceholderDefinition[];
  personalization: PersonalizationData;
  background: string;
  elements: TextElement[];
};

function fixture(input: FixtureInput): {
  definition: DesignTemplateDefinition;
  version: DesignTemplateVersion;
} {
  const product = PRODUCTS[input.productId];
  const resolved = resolveProductConfiguration(legacyProductVersion(product));
  const document = createEmptyDocument(resolved.productConfig);
  const surfaceId = resolved.productConfig.editableSurfaces[0].id;
  document.surfaces[surfaceId] = {
    background: input.background,
    elements: input.elements,
  };
  const versionId = `${input.id}@1`;
  const version: DesignTemplateVersion = {
    id: versionId,
    templateId: input.id,
    version: 1,
    status: "published",
    name: input.name,
    description: input.description,
    taxonomy: structuredClone(input.taxonomy),
    compatibility: [
      {
        productId: input.productId,
        productVersionId: resolved.productVersionId,
        configurationId: resolved.configurationId,
        optionSelection: resolved.selection,
      },
    ],
    designDocumentTemplate: applyPersonalization(document, input.personalization),
    placeholderDefinitions: structuredClone(input.placeholders),
    defaultPersonalization: structuredClone(input.personalization),
    assetIds: [],
    publishedAt: PUBLISHED_AT,
  };
  return {
    definition: {
      id: input.id,
      status: "published",
      currentVersionId: versionId,
      name: input.name,
      description: input.description,
      taxonomy: structuredClone(input.taxonomy),
      createdAt: PUBLISHED_AT,
      updatedAt: PUBLISHED_AT,
    },
    version,
  };
}

const teamLaunch = fixture({
  id: "team-launch-shirt",
  name: "Team Launch",
  description: "A clean centered team mark for print or embroidery preview.",
  productId: "tshirt",
  taxonomy: {
    category: "Business",
    subcategory: "Team apparel",
    tags: ["team", "launch", "minimal", "logo"],
    style: "Minimal",
    industry: "Technology",
    occasion: "Launch",
    colorFamilies: ["neutral", "blue"],
    languages: ["en"],
  },
  placeholders: [
    {
      key: "company.name",
      label: "Company name",
      type: "text",
      required: true,
      maxLength: 40,
    },
    {
      key: "company.tagline",
      label: "Tagline",
      type: "text",
      maxLength: 64,
    },
  ],
  personalization: {
    company: { name: "NORTHSTAR", tagline: "BUILD WHAT MATTERS" },
  },
  background: "#ffffff",
  elements: [
    {
      id: "team-company-name",
      type: "text",
      text: "NORTHSTAR",
      x: 246,
      y: 400,
      fontFamily: "Arial, sans-serif",
      fontSize: 116,
      fill: "#123a63",
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      binding: { type: "field", key: "company.name", fallback: "YOUR TEAM" },
    },
    {
      id: "team-tagline",
      type: "text",
      text: "BUILD WHAT MATTERS",
      x: 342,
      y: 545,
      fontFamily: "Arial, sans-serif",
      fontSize: 42,
      fill: "#111827",
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.9,
      binding: { type: "field", key: "company.tagline", fallback: "YOUR MESSAGE" },
    },
  ],
});

const minimalMailer = fixture({
  id: "minimal-mailer",
  name: "Minimal Mailer",
  description: "A restrained identity treatment positioned on the box base panel.",
  productId: "mailer-box-001",
  taxonomy: {
    category: "Packaging",
    subcategory: "Shipping boxes",
    tags: ["mailer", "minimal", "organic", "ecommerce"],
    style: "Organic",
    industry: "Retail",
    occasion: "Everyday",
    colorFamilies: ["kraft", "green"],
    languages: ["en"],
  },
  placeholders: [
    {
      key: "company.name",
      label: "Brand name",
      type: "text",
      required: true,
      maxLength: 48,
    },
    {
      key: "company.website",
      label: "Website",
      type: "text",
      maxLength: 80,
    },
  ],
  personalization: {
    company: { name: "FIELD & FORM", website: "fieldandform.example" },
  },
  background: "#c79a63",
  elements: [
    {
      id: "mailer-brand",
      type: "text",
      text: "FIELD & FORM",
      x: 344,
      y: 970,
      fontFamily: "Georgia, serif",
      fontSize: 84,
      fill: "#173b2b",
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      binding: { type: "field", key: "company.name", fallback: "YOUR BRAND" },
    },
    {
      id: "mailer-website",
      type: "text",
      text: "fieldandform.example",
      x: 405,
      y: 1080,
      fontFamily: "Arial, sans-serif",
      fontSize: 34,
      fill: "#173b2b",
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.9,
      binding: { type: "field", key: "company.website", fallback: "example.com" },
    },
  ],
});

const botanicalBottle = fixture({
  id: "botanical-bottle-label",
  name: "Botanical Label",
  description: "A high-contrast wrapped label with editable product and maker fields.",
  productId: "bottle-001",
  taxonomy: {
    category: "Labels",
    subcategory: "Beverage",
    tags: ["botanical", "beverage", "label", "modern"],
    style: "Modern",
    industry: "Food & beverage",
    occasion: "Retail",
    colorFamilies: ["cream", "green"],
    languages: ["en"],
  },
  placeholders: [
    {
      key: "product.name",
      label: "Product name",
      type: "text",
      required: true,
      maxLength: 44,
    },
    {
      key: "company.name",
      label: "Maker",
      type: "text",
      maxLength: 64,
    },
  ],
  personalization: {
    product: { name: "WILD MINT" },
    company: { name: "NORTH CO. BOTANICALS" },
  },
  background: "#f1ead9",
  elements: [
    {
      id: "bottle-product-name",
      type: "text",
      text: "WILD MINT",
      x: 760,
      y: 150,
      fontFamily: "Georgia, serif",
      fontSize: 106,
      fill: "#19462f",
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      binding: { type: "field", key: "product.name", fallback: "PRODUCT NAME" },
    },
    {
      id: "bottle-maker",
      type: "text",
      text: "NORTH CO. BOTANICALS",
      x: 790,
      y: 300,
      fontFamily: "Arial, sans-serif",
      fontSize: 38,
      fill: "#19462f",
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.9,
      binding: { type: "field", key: "company.name", fallback: "MAKER NAME" },
    },
  ],
});

const FIXTURES = [teamLaunch, minimalMailer, botanicalBottle];

export const CODE_TEMPLATE_DEFINITIONS: Readonly<Record<string, DesignTemplateDefinition>> =
  Object.fromEntries(FIXTURES.map(({ definition }) => [definition.id, definition]));

export const CODE_TEMPLATE_VERSIONS: Readonly<Record<string, DesignTemplateVersion>> =
  Object.fromEntries(FIXTURES.map(({ version }) => [version.id, version]));
