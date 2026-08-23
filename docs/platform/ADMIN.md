# Product operations and admin boundary

Status: the catalogue read model and validation service are implemented. `/admin/products` is a local-development-only, read-only operator view. Production operator authentication and mutation routes are intentionally not implemented yet.

## Current operator surface

`ProductOperationsService` reads `ProductCatalogService`; it does not read `PRODUCTS` as a second catalogue. For each definition it lists immutable published versions, identifies the current version/resolver kind, resolves the default configuration, derives truthful production format support, and validates the engine-facing contract.

Validation currently checks:

- published option/version schema;
- at least one unique editable surface;
- finite positive editor and physical dimensions;
- physical section bounds;
- presentation/page-role resolution;
- GLB model presence;
- print-profile registration;
- folded-carton structural metadata;
- exact carton blank and one-sheet print-surface dimensions.

Failures are visible in the inventory and produce a structured `product.validation-failed` log with product ID and error count. Logs never include artwork or provider secrets.

## Security posture

The page exposes IDs and validation metadata for unlisted products, so it calls `notFound()` in production. `robots` is also set to `noindex, nofollow`. This is defense in depth for a development tool, not operator authentication.

There are no browser publish/delete controls and no admin HTTP mutations. `ProductCatalogService.saveDraft()` and `publish()` remain the single service boundary. `publish()` validates the snapshot and SQLite atomically rejects mutation/reuse of an immutable version. This avoids creating an unauthenticated production control plane merely to demonstrate UI.

## Onboarding relationship

The existing `product-onboarding` CLI, Python mesh/UV tools, validators, and visual harnesses remain authoritative for geometry work. A future admin UI should submit bounded jobs to those tools and present their reports/previews. It must not reimplement GLB geometry processing in TypeScript or let a browser directly edit generated files.

## Required next step before production admin

1. Connect an authenticated operator identity provider.
2. Define roles for catalogue read, draft edit, validation, and publish.
3. Add CSRF protection, audit records, and shared rate limits for mutations.
4. Validate an exact draft snapshot and generated onboarding report server-side.
5. Publish a new immutable `ProductVersion`; never edit a published row.
6. Retain actor, timestamp, input checksum, validation report, and output version.

Until these are present, product changes continue through reviewed source fixtures/onboarding outputs and the existing immutable catalogue service.
