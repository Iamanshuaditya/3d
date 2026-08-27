import type { ProductConfig } from "@/types/configurator";

/**
 * The fixed product-experience benchmark set (#23).
 *
 * These five products are not a sample of the catalogue; each one is the
 * cheapest fixture that can expose a specific class of customer-facing
 * regression, and together they cover every construction the editor supports.
 */
export const PRODUCT_EXPERIENCE_FIXTURES = [
  {
    id: "visiting-card",
    productId: "kraft-visiting-card-88.9x50.8",
    label: "Kraft visiting card",
    /** Smallest surface: a 1 mm placement error is visible at 100% zoom. */
    rationale: "flat sheet, no folding, tight safe area",
    artwork: "chirality-probe",
    supportsUnfold: false,
  },
  {
    id: "measured-pouch-web",
    productId: "nexibles-rstz-190x265-110",
    label: "Nexibles RSTZ measured web",
    /** Source-measured, so a drift in web width or repeat is a hard failure. */
    rationale: "measured production web with technical bands",
    artwork: "chirality-probe",
    supportsUnfold: false,
  },
  {
    id: "light-pouch",
    productId: "pouch-fb-130",
    label: "Flat-bottom pouch, unprinted film",
    /**
     * White film on a light background is the disappearing-product case, and a
     * flat-bottom wrap is the only construction that exercises all four printed
     * web columns — the front/right/back/left tiling a stand-up pouch never uses.
     */
    rationale: "light substrate, and the full four-column printed wrap",
    artwork: "none",
    supportsUnfold: false,
  },
  {
    id: "dark-pouch",
    productId: "pouch-3ss-130",
    label: "Three-side-seal pouch, dark artwork",
    /** Near-black artwork is the case a dark background would lose. */
    rationale: "dark artwork against the preview background",
    artwork: "dark-flood",
    supportsUnfold: false,
  },
  {
    id: "complex-carton",
    productId: "mailer-box-001",
    label: "Corrugated mailer carton",
    /** Folds and unfolds, so it exercises reframing and the flat dieline view. */
    rationale: "multi-panel carton with fold and unfold states",
    artwork: "chirality-probe",
    supportsUnfold: true,
  },
] as const;

export type ProductExperienceFixture = (typeof PRODUCT_EXPERIENCE_FIXTURES)[number];
export type ProductExperienceFixtureId = ProductExperienceFixture["id"];

/**
 * Capture states. `appliesTo` keeps the matrix honest: a flat sheet has no
 * unfold state and an empty surface has no crop state, so those combinations
 * are absent rather than captured and quietly ignored.
 */
export const PRODUCT_EXPERIENCE_STATES = [
  { id: "empty-editor", surface: "2d", needsArtwork: false, needsUnfold: false },
  { id: "artwork-placed", surface: "2d", needsArtwork: true, needsUnfold: false },
  { id: "artwork-selected", surface: "2d", needsArtwork: true, needsUnfold: false },
  { id: "artwork-snapped", surface: "2d", needsArtwork: true, needsUnfold: false },
  { id: "artwork-fit", surface: "2d", needsArtwork: true, needsUnfold: false },
  { id: "artwork-fill", surface: "2d", needsArtwork: true, needsUnfold: false },
  { id: "artwork-crop", surface: "2d", needsArtwork: true, needsUnfold: false },
  { id: "3d-front", surface: "3d", needsArtwork: false, needsUnfold: false },
  { id: "3d-back", surface: "3d", needsArtwork: false, needsUnfold: false },
  { id: "3d-angled", surface: "3d", needsArtwork: false, needsUnfold: false },
  { id: "dieline-flat", surface: "2d", needsArtwork: false, needsUnfold: true },
] as const;

export type ProductExperienceState = (typeof PRODUCT_EXPERIENCE_STATES)[number];
export type ProductExperienceStateId = ProductExperienceState["id"];

export type ProductExperienceCapture = Readonly<{
  id: string;
  fixtureId: ProductExperienceFixtureId;
  productId: string;
  stateId: ProductExperienceStateId;
  surface: "2d" | "3d";
}>;

/** Every capture this harness is expected to produce, in a stable order. */
export function buildProductExperienceMatrix(): readonly ProductExperienceCapture[] {
  const captures: ProductExperienceCapture[] = [];
  for (const fixture of PRODUCT_EXPERIENCE_FIXTURES) {
    for (const state of PRODUCT_EXPERIENCE_STATES) {
      if (state.needsArtwork && fixture.artwork === "none") continue;
      if (state.needsUnfold && !fixture.supportsUnfold) continue;
      captures.push({
        id: `${fixture.id}--${state.id}`,
        fixtureId: fixture.id,
        productId: fixture.productId,
        stateId: state.id,
        surface: state.surface,
      });
    }
  }
  return captures;
}

export function findProductExperienceFixture(
  id: string,
): ProductExperienceFixture | undefined {
  return PRODUCT_EXPERIENCE_FIXTURES.find((fixture) => fixture.id === id);
}

export function findProductExperienceCapture(
  id: string,
): ProductExperienceCapture | undefined {
  return buildProductExperienceMatrix().find((capture) => capture.id === id);
}

/** Products the harness needs resolvable before it can run at all. */
export function requiredProductIds(): readonly string[] {
  return PRODUCT_EXPERIENCE_FIXTURES.map((fixture) => fixture.productId);
}

export function missingFixtureProducts(
  resolve: (productId: string) => ProductConfig | undefined,
): readonly string[] {
  return requiredProductIds().filter((productId) => !resolve(productId));
}
