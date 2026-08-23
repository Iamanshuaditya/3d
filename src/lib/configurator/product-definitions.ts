import { PRODUCTS } from "./product-config";
import type { ProductConfig } from "@/types/configurator";
import type {
  ProductDefinition,
  ProductDefinitionSnapshot,
  ProductPresentationMode,
  ProductVersion,
} from "@/platform/products/types";
import { resolveProductPresentation } from "./presentation";
import { MAILER_BOX_PROVIDER_ID } from "./product-configuration-providers";

const LEGACY_PUBLISHED_AT = "2026-08-23T00:00:00.000Z";

/**
 * Bump the value for a product whenever its resolved physical/production
 * contract changes. The persistent catalog rejects changed bytes under an
 * existing number, making accidental published-version mutation fail loudly.
 */
export const PRODUCT_VERSION_NUMBERS: Readonly<Record<string, number>> = {
  // v2 publishes the first compatible editable-template catalogue. Engine
  // geometry is unchanged; the immutable capability snapshot is not.
  "bottle-001": 2,
  // v3 replaces the fixed 240×160×60 engine snapshot with a versioned
  // parameterized provider and pins the complete structural spec per resolve.
  "mailer-box-001": 3,
  tshirt: 2,
  // v1 was briefly published in the development catalogue with an inaccurate
  // progressive-unfold capability. The clamshell itself is unchanged; v2
  // corrects the immutable capability snapshot rather than mutating v1.
  "burger-box-001": 2,
};

const TEMPLATE_ENABLED_PRODUCT_IDS = new Set([
  "bottle-001",
  "mailer-box-001",
  "tshirt",
]);

function presentationMode(config: ProductConfig): ProductPresentationMode {
  if (config.editableSurfaces.some((surface) => surface.renderModes?.includes("embroidery"))) {
    return "garment";
  }
  if (config.family === "folded-carton") return "packaging";
  return "2d-3d-split";
}

export function legacyDefinitionSnapshot(config: ProductConfig): ProductDefinitionSnapshot {
  const renderModes = new Set(config.editableSurfaces.flatMap((surface) => surface.renderModes ?? []));
  const structuralPresentation = resolveProductPresentation(config);
  return {
    name: config.name,
    description: `Compatibility definition for the existing ${config.name} engine configuration.`,
    // Options remain empty until a real resolver changes all affected physical
    // and production contracts. We do not expose cosmetic choices that the
    // current engine cannot truthfully resolve.
    options: [],
    presentation: { mode: presentationMode(config) },
    capabilities: {
      multiSurface: config.editableSurfaces.length > 1,
      embroideryPreview: renderModes.has("embroidery"),
      unfolding: structuralPresentation.mode === "progressive-unfold",
      parameterizedDimensions: false,
      templates: TEMPLATE_ENABLED_PRODUCT_IDS.has(config.id),
    },
    templateCompatibility: [config.id],
  };
}

export function legacyProductVersion(
  config: ProductConfig,
  version = PRODUCT_VERSION_NUMBERS[config.id] ?? 1,
): ProductVersion {
  const id = `${config.id}@${version}`;
  return {
    id,
    productId: config.id,
    version,
    status: "published",
    definition: legacyDefinitionSnapshot(config),
    resolution: {
      kind: "static",
      productConfig: { ...structuredClone(config), productVersionId: id },
    },
    publishedAt: LEGACY_PUBLISHED_AT,
  };
}

export function legacyProductDefinition(config: ProductConfig): ProductDefinition {
  const version = legacyProductVersion(config);
  return {
    id: config.id,
    status: "published",
    currentVersionId: version.id,
    createdAt: LEGACY_PUBLISHED_AT,
    updatedAt: LEGACY_PUBLISHED_AT,
    ...version.definition,
  };
}

function currentProductVersion(config: ProductConfig): ProductVersion {
  if (config.id !== "mailer-box-001") return legacyProductVersion(config);
  const version = PRODUCT_VERSION_NUMBERS[config.id];
  const definition: ProductDefinitionSnapshot = {
    ...legacyDefinitionSnapshot(config),
    name: "Custom Mailer Box",
    description:
      "Parameterized FEFCO 0427-style mailer derived from one versioned physical structure.",
    options: [
      {
        id: "length",
        label: "Length",
        description: "Internal long side of the assembled tray.",
        kind: "dimension",
        required: true,
        min: 120,
        max: 500,
        step: 10,
        unit: "mm",
        productionUnit: "mm",
        defaultValue: 240,
      },
      {
        id: "width",
        label: "Width",
        description: "Internal short side of the assembled tray.",
        kind: "dimension",
        required: true,
        min: 80,
        max: 400,
        step: 10,
        unit: "mm",
        productionUnit: "mm",
        defaultValue: 160,
      },
      {
        id: "depth",
        label: "Depth",
        description: "Assembled wall height.",
        kind: "dimension",
        required: true,
        min: 35,
        max: 180,
        step: 5,
        unit: "mm",
        productionUnit: "mm",
        defaultValue: 60,
      },
      {
        id: "board_thickness",
        label: "Board thickness",
        kind: "dimension",
        required: true,
        min: 1,
        max: 3,
        step: 0.25,
        unit: "mm",
        productionUnit: "mm",
        defaultValue: 1.5,
      },
    ],
    capabilities: {
      ...legacyDefinitionSnapshot(config).capabilities,
      parameterizedDimensions: true,
    },
  };
  return {
    id: `${config.id}@${version}`,
    productId: config.id,
    version,
    status: "published",
    definition,
    resolution: {
      kind: "provider",
      providerId: MAILER_BOX_PROVIDER_ID,
      parameters: { structure: "FEFCO-0427", structureVersion: 1 },
    },
    publishedAt: LEGACY_PUBLISHED_AT,
  };
}

function currentProductDefinition(
  config: ProductConfig,
  version: ProductVersion,
): ProductDefinition {
  return {
    id: config.id,
    status: "published",
    currentVersionId: version.id,
    createdAt: LEGACY_PUBLISHED_AT,
    updatedAt: version.publishedAt,
    ...structuredClone(version.definition),
  };
}

export const CODE_PRODUCT_VERSIONS: Readonly<Record<string, ProductVersion>> = Object.fromEntries(
  Object.values(PRODUCTS).map((config) => {
    const version = currentProductVersion(config);
    return [version.id, version];
  }),
);

export const CODE_PRODUCT_DEFINITIONS: Readonly<Record<string, ProductDefinition>> =
  Object.fromEntries(
    Object.values(PRODUCTS).map((config) => {
      const version = CODE_PRODUCT_VERSIONS[`${config.id}@${PRODUCT_VERSION_NUMBERS[config.id] ?? 1}`];
      return [config.id, currentProductDefinition(config, version)];
    }),
  );
