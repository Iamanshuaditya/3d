import { PRODUCTS } from "./product-config";
import type { ProductConfig } from "@/types/configurator";
import type {
  ProductDefinition,
  ProductDefinitionSnapshot,
  ProductPresentationMode,
  ProductVersion,
} from "@/platform/products/types";
import { resolveProductPresentation } from "./presentation";

const LEGACY_PUBLISHED_AT = "2026-08-23T00:00:00.000Z";

/**
 * Bump the value for a product whenever its resolved physical/production
 * contract changes. The persistent catalog rejects changed bytes under an
 * existing number, making accidental published-version mutation fail loudly.
 */
export const PRODUCT_VERSION_NUMBERS: Readonly<Record<string, number>> = {
  // v1 was briefly published in the development catalogue with an inaccurate
  // progressive-unfold capability. The clamshell itself is unchanged; v2
  // corrects the immutable capability snapshot rather than mutating v1.
  "burger-box-001": 2,
};

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
      templates: false,
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

export const CODE_PRODUCT_VERSIONS: Readonly<Record<string, ProductVersion>> = Object.fromEntries(
  Object.values(PRODUCTS).map((config) => {
    const version = legacyProductVersion(config);
    return [version.id, version];
  }),
);

export const CODE_PRODUCT_DEFINITIONS: Readonly<Record<string, ProductDefinition>> =
  Object.fromEntries(
    Object.values(PRODUCTS).map((config) => [config.id, legacyProductDefinition(config)]),
  );
