# Milestone P6.3 — audited product drafts and publishing

Date: 2026-08-23

## 1. Existing-system discovery

The immutable `product_versions` table and `ProductCatalogService.publish()` were sound, but the earlier draft seam stored an incomplete `ProductDefinition` in the live catalogue row. It did not retain the static/provider resolution spec, carried no operator identity or audit history, and could be replaced when checked code fixtures synchronized on process startup. It was not safe to expose as an admin workflow.

The P6 operations validator also contained reusable product-contract checks, but they were private to the read-only inventory.

## 2. Architecture chosen

- `ProductDraftDocument` owns the proposed definition, visibility, and resolution spec.
- `ProductDraft` is separate from the published definition and uses content revisions.
- `ProductDraftValidationReport` is bound to one exact revision and records the candidate configuration identity.
- `ProductPublishingService` requires a trusted `ProductOperator` and checks read/edit/publish permissions close to data access.
- `validateResolvedProductContract()` is shared by draft validation and the operations inventory.
- publishing re-resolves the candidate, compares it with the reviewed report, checks the base version, and commits version/definition/draft/audit together.
- no HTTP mutation or browser button is exposed without a real authentication adapter.

This is a modular-monolith service boundary. It preserves the code/Python onboarding toolchain and the existing engine-facing `ProductConfig`.

## 3. Files added or changed

Domain/repositories:

- `src/platform/products/drafts.ts`
- `src/platform/products/draft-repository.ts`
- `src/server/persistence/database.ts`
- `src/server/products/sqlite-product-catalog-repository.ts`

Services:

- `src/server/products/product-contract-validator.ts`
- `src/server/products/product-publishing-service.ts`
- `src/server/products/product-catalog-service.ts`
- `src/server/products/product-operations-service.ts`
- `src/server/products/container.ts`

UI/tests/docs:

- `src/app/admin/products/page.tsx`
- `tests/platform/product-publishing.test.ts`
- `tests/platform/production-artifact.test.ts`
- `docs/platform/ADMIN.md`
- `docs/platform/PRODUCTS.md`
- `docs/platform/ARCHITECTURE.md`
- `docs/platform/API.md`
- `docs/platform/MILESTONE-P6-ADMIN-PUBLISHING.md`

## 4. Working end to end

- clone a draft from the current immutable product version;
- create a draft for a new product;
- revision-checked full-document update;
- validation through the real configuration provider and engine contract;
- failed validation persisted for operator review;
- validation invalidated by any content edit;
- stale-base detection when another draft publishes first;
- atomic publication of the next version, current pointer, draft status, and audit event;
- historical version remains byte-immutable and resolvable;
- idempotent completed-publish retry;
- append-only actor/action/revision/version audit history;
- denied edit/publish attempts for insufficient operator permissions.

## 5. Verification

- ESLint: passed.
- strict TypeScript: passed.
- product publishing integration tests: 4/4 passed.
- complete Node test suite: 119/119 passed.
- optimized Next.js production build: passed.
- existing production schema migration test passes through schema v7.
- local Chrome operator inventory remains read-only and reports 31/31 current products valid.

## 6. Remaining limitations and risks

- No concrete operator identity provider is selected; no admin mutation routes are exposed.
- Draft validation covers the default option selection. Product-specific representative option matrices are still needed.
- Onboarding CLI reports/previews are not yet persisted as signed draft validation inputs.
- Draft documents are internal and contain engine/provider fields. A future browser API needs explicit safe DTOs rather than direct serialization.
- Audit rows capture actor/action/revision/version/time, but a future compliance policy may require deployment ID, approval comment, and onboarding report checksum.
- Code-defined products remain source-synchronized; database-authored versions are preserved because older version numbers cannot replace newer current versions.

## 7. Next highest-value milestone

Connect a real operator authentication/role provider and bounded admin DTO/routes, then orchestrate existing onboarding validation jobs behind that boundary. If identity-provider selection remains external, proceed independently with the commerce boundary: `PricingProvider` and immutable quote DTOs keyed by exact product version/configuration/quantity.
