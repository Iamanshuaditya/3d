# Product domain

Status: P1 product definitions, option schemas, deterministic configuration resolution, immutable published versions, and the legacy `ProductConfig` adapter are implemented. P3 uses the resolved version's presentation mode and explicit surface navigation semantics. P5 publishes the first real dynamic provider: Mailer Box v3 resolves customer dimensions into one version-pinned structural contract. P6 exposes an explicit public DTO projection and a local operator validation inventory without leaking engine internals.

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

### Parameterized Mailer v3

`mailer-box-001@3` exposes bounded millimetre options for length, width, depth, and board thickness. The server validates both scalar bounds/steps and construction rules (`length >= width`, `depth <= width / 2`). `mailer-box-0427-v1` then creates one embedded `CartonSpec` containing:

- the physical blank dimensions;
- panel rectangles and hinge ownership;
- the authored unfold sequence;
- cut, crease, and bleed paths;
- board thickness.

The provider derives the editable surface size/rulers, editor pixel scale, section mapping, camera, and procedural model offset from that same result. The embedded spec is preferred over the legacy registry by `resolveCartonSpec()`, so Studio, Three.js, unfolding, PDF, and manufacturing SVG cannot independently select another carton definition.

Provider algorithms are published behavior. `mailer-box-0427-v1` must never be changed in a way that alters its output for an existing selection. A structural-algorithm change requires a new provider ID and a new `ProductVersion`.

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

T-shirt and Bottle current versions are version 2. Their geometry is unchanged; v2 publishes the first truthful editable-template capability and exact template-compatibility contract. Mailer Box v2 remains the immutable historical fixed configuration; v3 introduces the parameterized provider. Existing v1/v2 projects remain pinned, while the Mailer fixture template v2 targets only the default v3 configuration.

The P5 audit found a historical 2 mm drift: the fixed Mailer v2 editable surface is 376×554 mm while its structural spec is 376×552 mm. V2 is not silently rewritten. It remains reproducible and continues to open, but the manufacturing SVG capability refuses that mismatched configuration. New v3 default projects use the exact 376×552 mm authoritative structure. An explicit migration would be required to move old designs.

## Project binding

Every new project records:

- `productId`;
- `productVersionId`;
- `configurationId`;
- validated `optionSelection`.

Create, save validation, duplicate, and preview resolve the exact stored version and selection. Studio URLs carry version/selection provenance for server rendering and self-correct from the owner-authorized project DTO when an older link omits it. P0 rows using `<productId>@legacy-v1` remain resolvable through a narrow compatibility path.

## Public catalogue boundary

`ProductApiService` is the only mapper from the internal product catalogue to `/api/v1/products`. It returns explicit `ProductSummaryDto`, `ProductDetailDto`, and `ResolvedProductConfigurationDto` contracts. A resolved response includes customer options, physical surface geometry, presentation roles, capabilities, supported production formats, and version-bound links. Discovery uses `ProductDefinition.visibility`, not the legacy engine registry, so future database-authored products can become public without adding a product-name conditional. Pre-P6 rows missing this metadata fail closed as unlisted.

It intentionally omits:

- `ProductConfig` itself;
- model/texture URLs and mesh mapping names;
- provider IDs and provider parameters;
- carton hinge/path implementation details;
- ICC file locations;
- storage keys;
- production-only option values.

This keeps the public API evolvable while Studio and production continue consuming the richer internal resolved contract. Hidden registry fixtures are not a public discovery mechanism: list omits them and direct public reads/resolution fail with 404.

## Operator validation

`ProductOperationsService` resolves every current version at its default selection and checks the contracts required before an operator could safely publish or inspect it: valid option/version schema, editable surface identity and physical bounds, section bounds, presentation roles, GLB model presence, print-profile registration, folded-carton structure presence, and exact one-sheet structure/surface agreement. It also reports immutable version history, resolver kind, visibility, and truthful PDF/SVG availability.

The initial `/admin/products` surface is deliberately local-development-only and read-only. It proves the catalogue/admin read model without making unlisted metadata public or introducing unauthenticated publish controls. Draft persistence and immutable `publish()` already live in the domain service; authenticated operator mutation, GLB job orchestration, and approval policy remain subsequent work.

## Presentation and surface roles

`ProductVersion.presentation.mode` now drives Studio composition through `resolveStudioPresentation()`. Optional `EditableSurface.presentation` declares customer navigation as page, print area, or continuous production web. A page references one existing `SurfaceDesign`; mesh mappings remain a separate renderer concern.

Legacy configs remain source-compatible. Section-bearing packaging surfaces are inferred as continuous webs and other surfaces as print areas. Pages are never guessed. Adding authored page roles, page order, or new surfaces to a published product requires a new immutable product version. See `PRESENTATION.md` for the full contract.

## Remaining product limits

- Mailer Box is the first parameterized registered product; all other registered products continue through immutable static adapters until an authoritative provider can update their full 2D/3D/production contract.
- No current registered product supplies explicit front/back page metadata; the P3 contract has synthetic coverage until a real flat SKU is onboarded.
- Public product catalogue/detail/resolve endpoints are implemented. Authenticated product authoring and publishing HTTP endpoints are not.
- Published version storage is implemented, but migrations between versions are deliberately absent; existing projects stay pinned unless a future explicit migration workflow is approved.
- The web option form is a customer configuration surface, not an operator authoring UI. The operator page is currently a local read-only validation inventory; authenticated draft/publish controls remain.
