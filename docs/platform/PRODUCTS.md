# Product domain

Status: P1 product definitions, option schemas, deterministic configuration resolution, immutable published versions, and the legacy `ProductConfig` adapter are implemented. No registered customer product currently exposes dynamic options; that remains intentional until a provider can truthfully update every affected physical and production contract.

## Domain separation

```text
ProductDefinition
      +
immutable ProductVersion
      +
OptionSelection
      │
      ▼
resolveProductConfiguration()
      │
      ▼
ResolvedProductConfiguration
      │
      └── ProductConfig → existing Studio / 2D / 3D / print engine
```

The existing `ProductConfig` remains the engine-facing resolved contract. `src/platform/products/types.ts` adds the higher-level domain without changing how the editor, Three.js renderers, unfolding system, embroidery preview, or print normalizer consume a product.

## Option schema

`ProductOption` supports:

- select values with customer labels and separate production values;
- bounded numeric values with step validation;
- dimensions in mm, cm, or inches, normalized to millimetres for providers;
- booleans with optional production values;
- defaults, required values, visibility rules, availability rules, and dependent select-value availability.

Option keys, counts, scalar types, finite numbers, and string lengths are bounded at the server boundary. Unknown options, hidden supplied values, unavailable combinations, bad steps, and missing resolver providers fail before Studio receives a configuration.

`configurationId` is deterministic over the immutable version id and sorted validated customer selection. Reordering JSON keys cannot create a second identity.

## Configuration providers

A `ProductVersion` resolves either through:

- `static`: an immutable snapshot of an existing `ProductConfig`; or
- `provider`: a registered `ProductConfigurationProvider` receiving the version, validated selection, normalized production values, and versioned provider parameters.

The provider must return a `ProductConfig` for the same product. The central resolver stamps it with `productVersionId`, `configurationId`, and the validated selection. UI components do not independently derive dimensions, surfaces, material, or production configuration.

## Publishing and persistence

SQLite schema v3 stores `product_definitions` and `product_versions` in the same platform database used by projects. A published version stores its full JSON snapshot and SHA-256 checksum.

Publishing rules:

1. The definition snapshot must exactly match the version snapshot.
2. A version id and `(productId, version number)` are unique.
3. Re-publishing identical bytes is idempotent.
4. Changed bytes under a published id fail with `PUBLISHED_VERSION_IMMUTABLE`.
5. Structural or capability changes require a new number.
6. Publishing v2 does not delete v1 or move existing projects.

`ProductCatalogService` synchronizes code-defined versions into SQLite and resolves historical records from SQLite, not from whichever config happens to be current in source code.

## Compatibility adapter

`src/lib/configurator/product-definitions.ts` creates a static definition/version for every current registry entry. It derives presentation and capabilities from existing contracts and exposes no fake customer options. Tests assert every adapted engine config equals the original after removing resolution provenance.

Current representative coverage includes:

- pouch: `pouch-001` and generated pouch SKUs;
- carton: `mailer-box-001` and `burger-box-001`;
- garment: `tshirt`;
- wrapped label: `bottle-001` and cylindrical onboarded products;
- articulated GLB: `counter-display`.

There is no registered flat/front-back print product yet, so none is falsely described as migrated. The resolver tests use a synthetic flat surface and parameterized provider until a real product is onboarded.

The Burger Box capability correction is version 2. Its geometry did not change; v1 had briefly recorded progressive unfolding even though the product only opens/closes. The correction was published as a new immutable snapshot instead of rewriting v1.

T-shirt, Mailer Box, and Bottle current versions are also version 2. Their geometry is unchanged; v2 publishes the first truthful editable-template capability and exact template-compatibility contract. Existing v1 projects remain pinned to v1, while the P2 fixture templates target only the new exact version/configuration identities.

## Project binding

Every new project records:

- `productId`;
- `productVersionId`;
- `configurationId`;
- validated `optionSelection`.

Create, save validation, duplicate, and preview resolve the exact stored version and selection. Studio URLs carry version/selection provenance for server rendering and self-correct from the owner-authorized project DTO when an older link omits it. P0 rows using `<productId>@legacy-v1` remain resolvable through a narrow compatibility path.

## Remaining P1 limits

- Existing registered products are static definitions; no customer option selector is shown yet.
- Parameterized packaging providers are P5 work and must derive 2D, 3D, unfolding, and production geometry from one structure.
- Product catalogue/resolve HTTP endpoints and admin publishing UI are P6 work. Template catalogue endpoints are already exposed by P2.
- Published version storage is implemented, but migrations between versions are deliberately absent; existing projects stay pinned unless a future explicit migration workflow is approved.
