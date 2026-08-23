# Platform production-readiness report

Date: 2026-08-24
Base: `65b4b978625ded50faf18e457d0b264d0a683341` (`origin/main`)
Branch: `feat/platform-production-readiness`

## Executive summary

The platform now has real server-verifiable customer sessions while retaining signed guests, secure transactional guest-to-account claiming, reusable private catalogue artwork, protected operator product/template workflows, durable bounded GLB onboarding around the existing Python engine, private S3/R2-compatible object storage, durable bulk-personalization datasets/jobs, and an approved-font registry boundary.

It can support authenticated customers and permissioned operators as a production-oriented modular monolith when deployed with durable SQLite/volume or a reviewed single-node arrangement plus private object storage. Horizontal production and PostgreSQL remain intentionally gated rather than claimed prematurely.

## Architecture

```text
Customer
   │
Auth session / signed guest
   │
Project service ─── ObjectStore (filesystem | private S3/R2)
   │
DesignDocument + immutable revision
   ├── 2D
   ├── 3D
   └── Production (PDF | manufacturing SVG)

Operator
   │
Authenticated session + server RBAC
   │
Admin
   ├── Product drafts
   ├── Template drafts/assets
   ├── Production font registry
   └── Onboarding jobs
          │
          ▼
    existing Python CLI
          │
          ▼
    checksummed validation artifacts
          │
          ▼
    immutable ProductVersion provenance
```

## Database migrations

The starting schema was v8. All migrations are forward-only and preserve existing rows.

- v9: Better Auth users/sessions/accounts/verifications and the guest-claim ledger.
- v10: immutable private platform template assets.
- v11: explicit per-user operator permission grants.
- v12: durable onboarding jobs and checksummed input/output assets.
- v13: onboarding provenance on product drafts/versions and the extended audit action set.
- v14: owner-scoped expiring personalization datasets and bounded job lifecycle records.
- v15: immutable private production-font metadata, checksum, and licensing provenance.
- v16: revisioned template drafts and append-only template audit events.

The v2→v16 and v5→v16 migration tests prove historical project reopening and immutable PDF retention. Existing version, template, quote, and artifact tests continue exercising exact historical references. The PostgreSQL target DDL mirrors v16 and has a disposable verification harness; the runtime fails closed if PostgreSQL is selected because its repository/Auth adapters are not complete.

## Security

- Identity source: Better Auth verifies credential sessions server-side and the existing provider seam projects only a user owner into domain code.
- Guest claim: requires a valid HMAC-signed current guest cookie and a valid authenticated session from the same request; no guest/user ID body is accepted. The transfer/claim ledger is transactional, idempotent, concurrency-safe, and clears guest access.
- CSRF: state-changing versioned routes require same-origin browser context; mutation buckets are rate limited.
- Owner isolation: project, dataset, job, quote, asset, and artifact lookups include owner type and owner ID.
- Operator RBAC: permissions come from SQLite grants or explicit server bootstrap configuration, never request JSON.
- Uploads: artwork is decoded and pixel/byte bounded; GLB/manifest/font/CSV/draft input has explicit type and size limits.
- Object privacy: filesystem and S3/R2 objects remain private; public DTOs omit keys; authorized downloads verify content type/length/SHA-256.
- Onboarding isolation: controlled executable and argument arrays, per-job work directory, bounded runtime/memory proxies/output capture/artifacts, cleanup, structured failure states.
- Logging: stable IDs and duration only; no cookies, auth tokens, customer bytes, CSV values, or credentials.

## Verification

```text
lint:                 PASS (0 errors)
typecheck:            PASS (strict TypeScript, 0 errors)
tests:                PASS (156/156, 0 failed/skipped)
build:                PASS (Next.js 16.3.0 production build, 53 source route/page entries)
Python/onboarding:    PASS (18/18 manifests; one NumPy RuntimeWarning retained)
real onboarding job: PASS (inspect → build → validate → durable report/artifacts)
PostgreSQL harness:  SKIPPED (VORTEX_POSTGRES_TEST_URL not configured)
cloud object store:  CONTRACT PASS; live-provider restart test not run (no credentials)
browser E2E:         NOT RUN; no in-app or connected browser was available
```

The final full command was `NEXT_DIST_DIR=.next-codex-final npm run check`. The isolated directory avoided the unrelated live dev server's Next lock and was removed afterward. The local shell uses Node 22.22.2 and emits the repository's expected Node >=24 warning during install; CI is pinned to Node 24.

## Manual acceptance evidence

Browser flows A–D could not be executed because browser discovery returned no available browser. They are not represented as passed. Flow E was inapplicable without cloud credentials.

Equivalent non-browser automated coverage includes:

- real Better Auth credential session resolution, forged-session rejection, guest isolation, transactional/idempotent/concurrent claim, and removal of stale guest access;
- image-backed template upload/publication/preview/instantiation/reload-safe project copy and historical immutability;
- operator permission matrix, stale/unvalidated publication rejection, immutable product/template versions, and audit events;
- one real checked-in T-shirt GLB through inspect/build/validate plus persisted reports and hostile/failure cases;
- filesystem/S3 protocol contract tests and immutable production artifact checksum verification.

## Remaining limitations

- PostgreSQL is not a runnable adapter; SQLite is the only supported runtime database.
- The in-process limiter/job runners must become shared/distributed infrastructure before horizontal scale.
- No live R2/S3 restart test was possible without deployment credentials.
- Registered fonts are not yet injected into the renderer/artifact provenance; reproducibility warnings correctly remain.
- Supplier pricing, taxes, checkout/orders, and manufacturer acceptance remain external work.
- CFF2 remains gated by real partner CAD fixtures; embroidery remains visual-only, not machine output.
- Template operator authoring currently uses a safe structured document editor; full Studio reuse is a UX follow-up.
- Branch protection was not enabled because the configured GitHub CLI token is invalid. Apply `docs/platform/BRANCH-PROTECTION.md`.
- Browser acceptance flows remain outstanding in an environment with a connected browser.
- An unrelated Cloudflare/OpenNext worktree change currently reports a 26.4 MiB public GLB above Workers' 25 MiB asset limit; those user-owned changes were not staged or altered by this work.

## Exact files changed

### authentication

- `src/platform/projects/repository.ts`
- `src/platform/projects/types.ts`
- `src/server/auth/better-auth.ts`
- `src/server/auth/create-auth.ts`
- `src/server/auth/owner-context.ts`
- `src/server/persistence/sqlite-project-repository.ts`
- `src/server/projects/container.ts`
- `src/server/projects/project-service.ts`

### template assets

- `src/platform/templates/assets.ts`
- `src/platform/templates/drafts.ts`
- `src/server/templates/container.ts`
- `src/server/templates/sqlite-template-asset-repository.ts`
- `src/server/templates/sqlite-template-draft-repository.ts`
- `src/server/templates/template-asset-service.ts`
- `src/server/templates/template-catalog-service.ts`
- `src/server/templates/template-draft-service.ts`
- `src/server/templates/template-service.ts`

### admin

- `src/platform/operators/repository.ts`
- `src/platform/products/draft-repository.ts`
- `src/platform/products/drafts.ts`
- `src/server/operators/container.ts`
- `src/server/operators/operator-authorization-service.ts`
- `src/server/operators/sqlite-operator-grant-repository.ts`
- `src/server/products/admin-dto.ts`
- `src/server/products/product-publishing-service.ts`
- `src/server/products/sqlite-product-catalog-repository.ts`

### onboarding

- `src/platform/onboarding/types.ts`
- `src/server/onboarding/admin-dto.ts`
- `src/server/onboarding/container.ts`
- `src/server/onboarding/onboarding-runner.ts`
- `src/server/onboarding/onboarding-service.ts`
- `src/server/onboarding/sqlite-onboarding-job-repository.ts`

### storage and database

- `scripts/verify-postgresql-schema.mjs`
- `src/server/persistence/backend.ts`
- `src/server/persistence/database.ts`
- `src/server/storage/container.ts`
- `src/server/storage/filesystem-object-store.ts`
- `src/server/storage/s3-object-store.ts`
- `src/server/storage/storage-key.ts`

### bulk personalization

- `src/platform/personalization/repository.ts`
- `src/platform/personalization/types.ts`
- `src/server/personalization/container.ts`
- `src/server/personalization/personalization-runner.ts`
- `src/server/personalization/personalization-service.ts`
- `src/server/personalization/sqlite-personalization-repository.ts`

### production fonts

- `src/platform/production/fonts.ts`
- `src/server/production/container.ts`
- `src/server/production/production-font-service.ts`
- `src/server/production/production-service.ts`
- `src/server/production/sqlite-production-font-repository.ts`

### API

- `src/app/api/auth/[...all]/route.ts`
- `src/app/api/v1/admin/onboarding/jobs/[jobId]/assets/[assetId]/content/route.ts`
- `src/app/api/v1/admin/onboarding/jobs/[jobId]/attach/route.ts`
- `src/app/api/v1/admin/onboarding/jobs/[jobId]/route.ts`
- `src/app/api/v1/admin/onboarding/jobs/route.ts`
- `src/app/api/v1/admin/product-drafts/[draftId]/audit/route.ts`
- `src/app/api/v1/admin/product-drafts/[draftId]/publish/route.ts`
- `src/app/api/v1/admin/product-drafts/[draftId]/route.ts`
- `src/app/api/v1/admin/product-drafts/[draftId]/validate/route.ts`
- `src/app/api/v1/admin/product-drafts/route.ts`
- `src/app/api/v1/admin/production-fonts/route.ts`
- `src/app/api/v1/admin/products/[productId]/drafts/route.ts`
- `src/app/api/v1/admin/products/route.ts`
- `src/app/api/v1/admin/template-assets/route.ts`
- `src/app/api/v1/admin/template-drafts/[draftId]/audit/route.ts`
- `src/app/api/v1/admin/template-drafts/[draftId]/publish/route.ts`
- `src/app/api/v1/admin/template-drafts/[draftId]/route.ts`
- `src/app/api/v1/admin/template-drafts/[draftId]/validate/route.ts`
- `src/app/api/v1/admin/template-drafts/route.ts`
- `src/app/api/v1/personalization-datasets/[datasetId]/preview/route.ts`
- `src/app/api/v1/personalization-datasets/route.ts`
- `src/app/api/v1/personalization-jobs/[jobId]/cancel/route.ts`
- `src/app/api/v1/personalization-jobs/[jobId]/output/route.ts`
- `src/app/api/v1/personalization-jobs/[jobId]/retry/route.ts`
- `src/app/api/v1/personalization-jobs/[jobId]/route.ts`
- `src/app/api/v1/personalization-jobs/route.ts`
- `src/app/api/v1/session/claim/route.ts`
- `src/server/http/api.ts`

### UI

- `src/app/admin/products/page.tsx`
- `src/app/designs/page.tsx`
- `src/app/page.tsx`
- `src/app/sign-in/page.tsx`
- `src/components/admin/OnboardingPanel.tsx`
- `src/components/admin/ProductDraftPanel.tsx`
- `src/components/admin/TemplateAssetPanel.tsx`
- `src/components/admin/TemplateDraftPanel.tsx`
- `src/components/auth/AccountControl.tsx`
- `src/components/auth/SignInPanel.tsx`
- `src/components/studio/StudioTopBar.tsx`
- `src/components/templates/BulkPersonalizationPanel.tsx`
- `src/components/templates/TemplateBrowser.tsx`
- `src/lib/auth/client.ts`

### tests

- `tests/platform/authentication.test.ts`
- `tests/platform/object-store-contract.test.ts`
- `tests/platform/onboarding-jobs.test.ts`
- `tests/platform/operator-authorization.test.ts`
- `tests/platform/persistence-backend.test.ts`
- `tests/platform/personalization-lifecycle.test.ts`
- `tests/platform/product-publishing.test.ts`
- `tests/platform/production-artifact.test.ts`
- `tests/platform/production-fonts.test.ts`
- `tests/platform/project-persistence.test.ts`
- `tests/platform/template-drafts.test.ts`
- `tests/platform/template-system.test.ts`

### docs

- `docs/platform/ADMIN.md`
- `docs/platform/API.md`
- `docs/platform/ARCHITECTURE.md`
- `docs/platform/BRANCH-PROTECTION.md`
- `docs/platform/POSTGRESQL.md`
- `docs/platform/PRODUCTION-READINESS-REPORT.md`
- `docs/platform/PRODUCTION.md`
- `docs/platform/PROJECTS.md`
- `docs/platform/STORAGE.md`
- `docs/platform/TEMPLATES.md`
- `docs/platform/postgresql/schema.sql`

### CI and configuration

- `.env.example`
- `.github/workflows/ci.yml`
- `.gitignore`
- `eslint.config.mjs`
- `next.config.ts`
- `package-lock.json`
- `package.json`

## Git milestones

- `df5f200` — authenticated sessions and secure guest claiming.
- `c0026cb` — immutable platform template artwork.
- `2b9c0e3` — operator workflows and bounded onboarding jobs.
- `301ae28` — private S3-compatible object adapter.
- `50648a7` — durable bounded personalization workflows.
- `d11a571` — font registry and PostgreSQL migration boundary.
- `ad416a9` — operator template draft/immutable publish workflow.
- `fd3c74f` — CI and deployment-quality documentation.

No branch push or pull request was created.
