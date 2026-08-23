# P1 milestone report — versioned products and configurations

Date: 2026-08-23

Branch: `feat/vortex-platform-p0-projects`

Baseline: `main` at `c88b3fd`

## 1. What the repository already provided

`ProductConfig` was already a strong resolved engine contract: physical surfaces, mesh bindings, camera, material and print profile references, render modes, articulation, procedural carton/pouch selectors, and dielines. It was not a definition, option schema, published version, or historical catalogue. The correct change was to put a higher-level domain in front of it, not replace it.

The P0 project table recorded a placeholder version id but did not persist option selection or a deterministic resolved-configuration identity. Saves and previews looked up the current in-code product, so a later structural config edit could have changed an old project.

## 2. Architecture chosen

- `ProductDefinition` owns customer-facing schema, capabilities, presentation, and template compatibility.
- Immutable `ProductVersion` snapshots a definition plus either a static engine config or provider reference/parameters.
- One resolver validates defaults/dependencies/units and emits `ResolvedProductConfiguration` plus the existing `ProductConfig`.
- SQLite stores definitions and checksummed immutable versions in the existing database.
- Every project pins version, deterministic configuration identity, and validated selection.
- A static adapter covers all existing products without adding unsupported options.
- Historical P0 `@legacy-v1` projects use a narrow compatibility resolver; new projects use published numeric versions.

This keeps `DesignDocument` as design truth and leaves all 2D, 3D, unfolding, embroidery, onboarding, and print consumers unchanged.

## 3. Exact implementation areas

Core product domain:

- `src/platform/products/types.ts`
- `src/platform/products/configuration-resolver.ts`
- `src/platform/products/repository.ts`
- `src/platform/products/errors.ts`
- `src/lib/configurator/product-definitions.ts`
- `src/server/products/product-catalog-service.ts`
- `src/server/products/sqlite-product-catalog-repository.ts`
- `src/server/products/container.ts`

Persistence and project binding:

- `src/server/persistence/database.ts`
- `src/platform/projects/types.ts`
- `src/server/persistence/sqlite-project-repository.ts`
- `src/server/projects/project-service.ts`
- `src/server/projects/container.ts`
- `src/app/api/v1/projects/route.ts`

Studio/library integration:

- `src/app/studio/page.tsx`
- `src/lib/projects/client.ts`
- `src/lib/projects/use-project-session.ts`
- `src/components/projects/ProjectLibrary.tsx`
- `src/types/configurator.ts`

Tests:

- `tests/platform/product-configuration.test.ts`
- `tests/platform/project-persistence.test.ts`

## 4. Working end to end

- Registered products are lazily published to SQLite as immutable versions.
- New projects resolve the current version and persist its exact selection/configuration identity.
- Save surface validation, duplicate, and preview use that exact historical version.
- Publishing a structurally different v2 leaves v1 projects editable and sends only new projects to v2.
- Published bytes cannot be changed under an existing id or version number.
- Studio server-renders the selected version, corrects incomplete old links, and remounts history at configuration boundaries.
- P0 projects migrate and continue resolving as `@legacy-v1`.
- Existing products pass through the compatibility adapter without engine-config changes.

## 5. Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 89 passed, 0 failed after P1 tests.
- `npm run build`: passed with `/studio` server-rendered dynamically.
- Chrome on localhost:8082:
  - reopened an existing T-shirt project and corrected the URL to `tshirt@legacy-v1`;
  - restored its saved layer and reached `Saved`;
  - created a new T-shirt project pinned to `tshirt@1` and reached `Saved`;
  - opened a current Mailer Box `@1` project with no browser errors.

Existing Three.js deprecation warnings remain unrelated (`THREE.Clock` and `PCFSoftShadowMap`).

## 6. Remaining limits and risks

- No registered product exposes customer options yet. Resolver behavior is proven with a synthetic provider; a real provider must update all physical/production outputs together.
- There is no customer option-selection UI, public product API, or operator publishing UI yet.
- SQLite/local filesystem remain single-node adapters.
- Product migration is intentionally absent; automatic movement of paid/saved work between versions would violate reproducibility.
- The repository still has no real flat/front-back print SKU, so that migration class remains unclaimed.
- Parameterized packaging and manufacturing exporters remain P5.

## 7. Next highest-value milestone

P2: implement editable `DesignTemplate` records, template instantiation into ordinary `DesignDocument`/`DesignProject` values, semantic field bindings, a small fixture catalogue, and template browsing. This uses the new product-version compatibility boundary and does not introduce a second rendering engine.
