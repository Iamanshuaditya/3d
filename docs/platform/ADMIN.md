# Product operations and admin boundary

Status: the catalogue read model, revisioned product-draft service, resolved validation, atomic immutable publishing, and audit trail are implemented. `/admin/products` remains a local-development-only, read-only operator view. Production operator authentication and mutation routes are intentionally not implemented yet.

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

There are no browser publish/delete controls and no admin HTTP mutations. `ProductPublishingService` requires a trusted `ProductOperator` for every call and independently checks `products:read`, `products:edit`, or `products:publish`. A future request adapter must authenticate the operator and construct that context; request JSON can never supply it.

The default deployment therefore has no remote path to product mutations. This avoids creating an unauthenticated production control plane merely to demonstrate UI.

## Revisioned publishing workflow

Drafts live in `product_drafts`, separate from `product_definitions`. This fixes a structural flaw in the earlier `saveDraft(ProductDefinition)` seam: code-catalog synchronization can no longer replace an operator's in-progress draft, and the draft carries both the editable definition snapshot and its static/provider resolution spec.

```text
current ProductVersion (optional)
        │
        ▼
ProductDraft revision 1..n
        │ update resets validation
        ▼
resolve exact candidate + validate default configuration
        │ report is bound to draft revision
        ▼
validated
        │ re-resolve + compare report + base-version CAS
        ▼
new immutable ProductVersion + definition pointer + audit event
```

Important behavior:

- content updates use optimistic revision compare-and-swap and invalidate prior validation;
- validation uses the same provider registry and resolved-contract checks as the operator inventory;
- a draft remembers `baseVersionId`; another publication makes it stale rather than silently rebasing it;
- publish re-runs validation and requires the result to match the reviewed report;
- the version row, current-definition pointer, draft status, and `version_published` audit event commit in one SQLite transaction;
- retrying an already completed publish is idempotent;
- a published draft cannot be edited;
- audit events retain actor ID, action, draft revision, product/version identity, and time without storing artwork or credentials.

SQLite schema v7 adds `product_drafts` and append-only `product_audit_events`. Internal draft documents contain engine/provider details and are not public DTOs.

## Onboarding relationship

The existing `product-onboarding` CLI, Python mesh/UV tools, validators, and visual harnesses remain authoritative for geometry work. A future admin UI should submit bounded jobs to those tools and present their reports/previews. It must not reimplement GLB geometry processing in TypeScript or let a browser directly edit generated files.

## Required next step before production admin UI/API

1. Connect an authenticated operator identity provider.
2. Define roles for catalogue read, draft edit, validation, and publish.
3. Add CSRF protection and shared rate limits at the mutation routes; define audit retention policy.
4. Add safe admin DTO parsers; never serialize a static `ProductConfig` or provider parameters wholesale.
5. Connect onboarding-job report IDs/checksums to draft validation.
6. Expose create/update/validate/publish only through the authenticated DAL/route boundary.

Until these are present, product changes continue through reviewed source fixtures/onboarding outputs or direct trusted server use of `ProductPublishingService`.
