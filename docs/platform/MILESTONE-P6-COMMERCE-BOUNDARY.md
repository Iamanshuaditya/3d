# Milestone P6.4 — immutable price quote boundary

Date: 2026-08-24

## 1. Existing-system discovery

The repository had no price, quantity, cart, checkout, or order arithmetic. It already had the correct identities to build on: immutable `ProductVersion`, deterministic `configurationId`, owner-scoped project APIs, and immutable production artifacts. Adding price fields to React or `ProductConfig` would have mixed supplier policy into the customization engine and allowed browser claims to drift from server resolution.

## 2. Architecture chosen

- `PricingProvider` receives a trusted `ResolvedProductConfiguration` and quantity.
- `PricingService` resolves public product/version/options itself and validates provider output.
- money uses overflow-checked integer minor units; line arithmetic and total are recomputed server-side;
- `PriceQuote` is owner-scoped, immutable, expiring, version/configuration bound, and idempotent;
- SQLite schema v8 persists provider provenance internally without exposing it publicly;
- the API accepts no price, total, currency, configuration ID, discount, tax, or shipping claims;
- a static development estimate proves the seam but is disabled in production by default.

## 3. Files added or changed

Domain and persistence:

- `src/platform/pricing/types.ts`
- `src/platform/pricing/repository.ts`
- `src/server/pricing/sqlite-price-quote-repository.ts`
- `src/server/persistence/database.ts`

Services and API:

- `src/server/pricing/pricing-service.ts`
- `src/server/pricing/static-pricing-provider.ts`
- `src/server/pricing/container.ts`
- `src/app/api/v1/products/[productId]/quotes/route.ts`
- `src/app/api/v1/price-quotes/[quoteId]/route.ts`
- `src/platform/products/public-types.ts`
- `src/server/products/product-api-service.ts`

Tests/docs:

- `tests/platform/pricing.test.ts`
- `tests/platform/production-artifact.test.ts`
- `docs/platform/COMMERCE.md`
- `docs/platform/API.md`
- `docs/platform/ARCHITECTURE.md`
- `docs/platform/MILESTONE-P6-COMMERCE-BOUNDARY.md`

## 4. Working end to end

- request an exact version/configuration/quantity quote;
- reject invalid, hidden, or unpriced configurations;
- apply explicit volume tiers inside the provider, never the UI;
- persist one immutable row under concurrent/retried requests;
- detect idempotency-key reuse with different commercial input;
- read only with the same guest/future-user owner;
- derive active/expired status without mutating the row;
- retain an old quote after a new product version publishes;
- fail closed and store nothing when provider arithmetic is inconsistent.

## 5. Verification

- ESLint: passed.
- strict TypeScript: passed.
- pricing integration tests: 6/6 passed.
- focused product/API/production regression tests: 19/19 passed.
- complete Node test suite: 125/125 passed.
- optimized Next.js production build: passed, including both quote routes.
- live localhost API: HTTP 201 with schema v8 and an owner-scoped `tshirt@2|` estimate.

## 6. Remaining limitations and risks

- The checked-in price rule is a local development estimate for `tshirt@2|`, not production pricing.
- No supplier/factory/storefront provider is connected.
- Quotes do not calculate tax or shipping and are not cart reservations.
- No order links a quote, project revision, and approved production artifact yet.
- The rate limiter remains process-local and must become shared before horizontal scaling.
- Guest-to-user quote claim is not implemented; short-lived guest quotes can be regenerated after authentication.

## 7. Next highest-value milestone

Connect a real contract pricing adapter before exposing customer checkout. Then add a minimal order eligibility boundary referencing—not copying—an active quote, exact project revision, and approved immutable production artifact. Operator identity/onboarding-job orchestration remains the parallel admin dependency.
