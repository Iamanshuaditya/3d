# Milestone P6 — public product API and operator foundation

Date: 2026-08-23

## 1. Existing-system discovery

P1 had already established a strong internal boundary: immutable definitions/versions resolve centrally into the existing `ProductConfig`. SQLite already enforced published-version immutability, and `ProductCatalogService` already owned draft/publish operations. What was missing was a safe public projection, catalogue/version listing contracts, and an operator view that exercised current products through the real resolver.

Serializing `ProductConfig` would have exposed GLB paths, texture paths, mesh names, UV/material configuration, provider internals, carton hinge geometry, and print implementation details. The registry also contains hidden diagnostic products that must not become publicly discoverable.

## 2. Architecture chosen

- `ProductApiService` projects internal versions/resolutions into explicit v1 DTOs.
- Catalogue discovery comes from `ProductDefinition.visibility`; it is not coupled to the legacy `ProductConfig` registry.
- Public list/detail/resolve routes are stateless and versioned under `/api/v1/products`.
- Hidden products are absent from list and return 404 for direct public detail/resolve.
- Physical surface geometry and capabilities are exposed because clients need them; engine/provider/storage details are not.
- `ProductOperationsService` is a separate read model over the same catalogue and resolver.
- `/admin/products` is local-only/read-only until real operator authorization exists.
- Existing `ProductCatalogService.saveDraft()`/`publish()` remains the mutation boundary and immutable-version authority.

This keeps Studio as one internal client while giving embedded/storefront clients a stable platform contract without weakening the engine contract.

## 3. Files added or changed

Domain/API contracts:

- `src/platform/products/public-types.ts`
- `src/platform/products/operations-types.ts`
- `src/platform/products/types.ts`
- `src/platform/products/repository.ts`

Server services/adapters:

- `src/server/products/product-api-service.ts`
- `src/server/products/product-operations-service.ts`
- `src/server/products/product-catalog-service.ts`
- `src/server/products/sqlite-product-catalog-repository.ts`
- `src/server/products/container.ts`

HTTP/UI:

- `src/app/api/v1/products/route.ts`
- `src/app/api/v1/products/[productId]/route.ts`
- `src/app/api/v1/products/[productId]/configurations/resolve/route.ts`
- `src/app/admin/products/page.tsx`
- `src/app/page.tsx`
- `src/app/templates/page.tsx`
- `src/app/studio/page.tsx`

Tests/docs:

- `tests/platform/product-api.test.ts`
- `docs/platform/API.md`
- `docs/platform/PRODUCTS.md`
- `docs/platform/ARCHITECTURE.md`
- `docs/platform/ADMIN.md`
- `docs/platform/MILESTONE-P6-PLATFORM-API.md`

## 4. Working end to end

- Customers/integrations can list public published products.
- They can read current or exact historical public product metadata.
- They can submit bounded option selections to the central resolver.
- The resolved DTO returns deterministic version/configuration identity, physical surfaces, page/area roles, capabilities, production formats, and Studio/template links.
- Mailer 200×150×70 mm resolves to the same 356×568 mm authoritative structure used by P5.
- Local operators can see every definition/version, default resolver outcome, visibility, surface/option counts, PDF/SVG support, and validation results.
- All 31 current code products pass the operations validation audit.
- A deliberately broken GLB produces `MODEL_REQUIRED` and fails closed.
- A database-authored public product absent from the legacy registry is discoverable, resolvable, and Studio-addressable.

## 5. Verification

Targeted checks:

- ESLint: passed.
- strict TypeScript: passed.
- `tests/platform/product-api.test.ts`: 5/5 passed.
- complete Node test suite: 115/115 passed.
- optimized Next.js production build: passed; product API and admin routes compiled as dynamic server routes.
- live `GET /api/v1/products`: HTTP 200, `Cache-Control: no-store`.
- live mailer resolve POST: HTTP 200; 356×568 mm; PDF/SVG.
- live `/admin/products`: HTTP 200 in development; 31/31 validation summary.

## 6. Remaining limitations and risks

- The operator UI is not production-enabled because there is no real operator authentication/authorization provider.
- There are no admin mutation routes, draft editor, approval workflow, or onboarding-job adapter.
- The current API is unpriced; no `PricingProvider` contract exists yet.
- Public API rate limiting/CORS policy must be finalized for embedded production clients at the deployment gateway/shared limiter.
- Only Mailer is dynamically parameterized; static compatibility versions still dominate the catalogue.
- Validation resolves default configurations. Exhaustive option-space validation needs product-specific representative matrices, not an unsafe Cartesian explosion.

## 7. Next highest-value milestone

Add authenticated operator draft/validate/publish workflow over the existing immutable service, including audit records and an adapter that runs the proven onboarding validation jobs. After that, add an isolated `PricingProvider`/quote boundary keyed by product version and `configurationId`; do not put price arithmetic in React.
