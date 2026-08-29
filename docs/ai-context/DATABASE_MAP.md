# Database Map

## Provider and layer

| Aspect | Value |
|---|---|
| Engine | **SQLite** via `better-sqlite3` (synchronous, in-process) |
| ORM | **None.** Hand-written SQL in `src/server/**/sqlite-*-repository.ts` |
| Schema + migrations | `src/server/persistence/database.ts` — 17 numbered, forward-only migrations in one file |
| Current version | `SCHEMA_VERSION = 17` (exported so tests assert against it) |
| File location | `${VORTEX_DATA_DIR ?? cwd/.data}/vortex.sqlite` |
| Pragmas | `foreign_keys = ON`, `busy_timeout = 5000`, `journal_mode = WAL` (skipped for `:memory:`) |
| Accessor | `getVortexDatabase()` — module singleton; calls `configuredPersistenceBackend()` first, which **throws** unless `VORTEX_DATABASE` is `sqlite` |
| Timestamps | TEXT ISO-8601 UTC, written by the application (`new Date().toISOString()`), not by SQLite |
| Soft delete | Only for projects (`status='archived'`). Nothing else is soft-deleted. |
| PostgreSQL | Target DDL exists at `docs/platform/postgresql/schema.sql` and is applied whole-file by `migratePostgres()`. Only two repositories are ported (job queue, rate limits). The application fails closed on `VORTEX_DATABASE=postgresql`. |

**Migration mechanics.** `migrate()` reads `MAX(version)` from
`schema_migrations` and runs each `if (current.version < N)` block inside
`database.transaction()`. A database *newer* than the runtime throws. There is no
down-migration path. Migrations 6 and 13 use the SQLite table-rebuild idiom
(`CREATE …_v6`, `INSERT SELECT *`, `DROP`, `RENAME`) to widen a CHECK constraint.

---

## Entity relationship map

```text
auth_users ─┬── auth_sessions        (CASCADE)
            ├── auth_accounts        (CASCADE)
            └── operator_grants      (CASCADE)     PK (user_id, permission)

auth_verifications                                  (standalone)

project_owner_claims  guest_id PK → user_id         (records the guest→user merge)

product_definitions ──< product_versions (RESTRICT)
        │                      │
        │                      ├──< price_quotes            (RESTRICT)
        │                      └─── product_version_onboarding_provenance (1:1, RESTRICT)
        │
        └(by product_id, no FK)── product_drafts ──< product_audit_events (RESTRICT)
                                        │
                                        └── onboarding_jobs.draft_id (SET NULL)

design_template_definitions ──< design_template_versions (RESTRICT)
template_drafts ──< template_draft_events (RESTRICT)
template_assets                                     (standalone, content-addressed)

design_projects ─┬──< project_revisions   (CASCADE)   PK (project_id, revision)
                 │           ▲
                 │           └── production_artifacts  (composite FK, RESTRICT)
                 └──< project_assets      (CASCADE)   kind ∈ {artwork, preview}

personalization_datasets ──< personalization_jobs (CASCADE)

production_fonts                                    (standalone registry)

rate_limit_windows                                  (shared coordination)
background_jobs                                     (shared coordination — SEE CAVEAT)

onboarding_jobs ──< onboarding_assets  (job_id is NOT a declared FK;
                    the FKs run the other way: jobs → assets, RESTRICT)
```

---

## Core entities

### `design_projects` — the customer's saved design

```text
Purpose        One customer design of one product configuration.
Primary key    id (TEXT, app-generated UUID v4)
Key fields     title, product_id, product_version_id, configuration_id,
               option_selection_json, source_template_version_id,
               owner_type ∈ {guest,user}, owner_id,
               status ∈ {draft, ready_for_preflight, production_ready, archived},
               design_json (the DesignDocument), revision (>= 1),
               preview_asset_id, creation_key, created_at, updated_at
Created by     ProjectService.create / createFromTemplate / duplicate
               → SqliteProjectRepository.create()
Updated by     ProjectService.update (revision+1 CAS), generatePreview
               (preview_asset_id), ProductionService (status only, via
               setStatusForRevision), claimAll (owner transfer)
Deleted by     Never. archive() sets status='archived'.
Constraints    UNIQUE(owner_type, owner_id, creation_key)  ← create idempotency
               INDEX(owner_type, owner_id, status, updated_at DESC)
Business rules • Every read is owner-scoped in SQL; there is no admin bypass.
               • revision is compare-and-swap: UPDATE … WHERE revision = ?
               • An archived project accepts no edits and no uploads.
               • configuration_id must re-resolve identically or the save is
                 rejected with PROJECT_CONFIGURATION_MISMATCH.
Files          src/server/persistence/sqlite-project-repository.ts
               src/server/projects/project-service.ts
               src/platform/projects/types.ts
```

`configuration_id` is the single most important derived field in the schema.
Format: `` `${productVersionId}|${key}=${type}:${urlEncodedValue}&…` `` with keys
sorted and values type-tagged `s:`/`n:`/`b:` — built by `configurationId()` in
`src/platform/products/configuration-resolver.ts`. It is the identity used to
match templates, price quotes and production artifacts to an exact product
configuration. Two selections that differ only in value *type* produce different
ids by design.

### `project_revisions` — immutable history

```text
Purpose        Frozen snapshot of the design at each revision.
Primary key    (project_id, revision)
Created by     SqliteProjectRepository.create (revision 1) and .update (N+1),
               inside the same transaction as the design_projects write.
Updated by     Never. Deleted only by CASCADE when a project row is deleted
               (which no code path does).
Why it matters Production binds to a revision, not to the live project. This is
               the row a production artifact's composite FK points at.
```

### `project_assets` — uploaded artwork and generated previews

```text
Primary key    id (UUID)
Key fields     project_id, kind ∈ {artwork, preview}, filename, mime_type ∈
               {image/png, image/jpeg, image/webp}, byte_size > 0,
               width > 0, height > 0, sha256, storage_key UNIQUE
Created by     ProjectService.uploadArtwork (artwork), .generatePreview (preview),
               .duplicate and .createFromTemplate (copies)
Deleted by     ProjectService.generatePreview deletes the superseded preview row
               and its bytes. Artwork is never deleted.
Constraints    storage_key UNIQUE — the object store is single-writer per key.
Note           storage_key is server-only and MUST NOT appear in a DTO
               (enforced by construction in ProjectService.assetDto).
```

Storage keys are built by `projectAssetStorageKey()` and
`productionArtifactStorageKey()` in
`src/server/storage/filesystem-object-store.ts`, both of which assert that the
project/asset ids are UUIDs before interpolating.

### `production_artifacts` — immutable print-ready output

```text
Primary key    id (UUID)
Key fields     project_id, project_revision, product_version_id,
               configuration_id, kind ∈ {pdf, svg}, mime_type (cross-checked
               against kind by a CHECK), filename, byte_size, sha256 (len 64),
               storage_key UNIQUE, preflight_report_json, created_at
Constraints    UNIQUE(project_id, project_revision, kind)  ← one artifact per
               revision per format, forever
               FOREIGN KEY (project_id, project_revision)
                 REFERENCES project_revisions(project_id, revision) RESTRICT
Created by     ProductionService.generate()
Updated by     Never.
Business rules • A regenerate request returns the existing artifact after
                 re-verifying bytes; it never re-exports.
               • created_at is taken from the preflight report, not the clock.
```

### `product_definitions` / `product_versions`

```text
product_definitions   id PK, status ∈ {draft, published}, definition_json
                      (carries visibility), current_version_id, timestamps
product_versions      id PK (format `${productId}@${n}`), product_id (RESTRICT),
                      version_number >= 1, version_json, sha256 (len 64),
                      published_at, UNIQUE(product_id, version_number)

Created by   ProductCatalogService.publish(), called from
             ProductPublishingService.publish() (operator) AND from
             synchronizeCodeCatalog() on first catalogue access.
Updated by   product_definitions.current_version_id only. product_versions rows
             are immutable and checksum-locked (canonicalJsonSha256).
```

**Important and non-obvious:** the catalogue is **seeded from code**.
`ProductCatalogService.ensureSynchronized()` publishes every entry of
`CODE_PRODUCT_VERSIONS` / `CODE_PRODUCT_DEFINITIONS`
(`src/lib/configurator/product-definitions.ts`, built from
`src/lib/configurator/product-config.ts`) on the first catalogue read of the
process. Adding a product in code therefore writes rows to the database. The same
pattern exists for templates via `CODE_TEMPLATE_DEFINITIONS` /
`CODE_TEMPLATE_VERSIONS` in `src/lib/templates/fixtures.ts`.

A legacy escape hatch also exists: `legacyP0Version()` synthesises a version for
the id `${productId}@legacy-v1` from `getProduct(productId)` when the database
has no such row.

### `product_drafts` / `product_audit_events`

```text
product_drafts       id PK, product_id, base_version_id, status ∈
                     {draft, validated, published}, revision >= 1,
                     document_json, validation_json, published_version_id,
                     onboarding_job_id, onboarding_report_sha256,
                     onboarding_tool_version, created_by, updated_by, timestamps
product_audit_events id PK, product_id, draft_id (RESTRICT), action ∈
                     {draft_created, draft_updated, draft_validated,
                      draft_validation_failed, onboarding_attached,
                      version_published}, actor_id, draft_revision,
                     product_version_id, created_at
```

Every mutating draft operation writes exactly one audit event in the same
transaction. `template_drafts` / `template_draft_events` mirror this without the
onboarding columns.

### `price_quotes`

```text
Primary key  id (UUID)
Key fields   owner_type/owner_id, request_key, request_fingerprint (sha256 of
             canonical {productId, productVersionId, optionSelection, quantity}),
             product_id, product_version_id (RESTRICT → product_versions),
             configuration_id, option_selection_json,
             quantity 1..1 000 000, quote_kind ∈ {estimate, contract},
             currency (len 3), line_items_json, total_amount_minor >= 0,
             tax_included/shipping_included 0|1, pricing_version,
             provider_id, provider_reference, created_at, expires_at
Constraints  UNIQUE(owner_type, owner_id, request_key)
Business     Replaying the same request_key with the SAME fingerprint returns
             the stored quote (200); with a DIFFERENT fingerprint it is a
             conflict. Quotes are immutable; "expired" is computed from
             expires_at at read time, never written.
Never expose provider_id, provider_reference, request_key, request_fingerprint
             or owner — PriceQuoteDto omits all of them by type.
```

### `personalization_datasets` / `personalization_jobs`

```text
datasets  id PK, domain_dataset_id (content hash of the parsed CSV),
          owner_type/owner_id, template_version_id, sha256, payload_sha256,
          storage_key UNIQUE, row_count 1..10 000, columns_json, report_json,
          created_at, expires_at  (= created_at + 30 days)
jobs      id PK, owner, dataset_id (CASCADE), template_version_id,
          status ∈ {queued, running, completed, failed, cancelled},
          processed <= total, failed <= total, total 1..10 000,
          attempt 0..3, max_attempts 1..3, idempotency_key,
          output_storage_key UNIQUE, output_sha256, output_byte_size,
          error_code, created_at/started_at/completed_at/updated_at

Retention  purgeExpired() runs opportunistically at the START of most
           PersonalizationService methods. It deletes the dataset row (jobs
           cascade) and every associated object. There is no scheduled sweeper.
```

### `onboarding_jobs` / `onboarding_assets`

```text
jobs    id PK, operator_id, product_id, draft_id (SET NULL), status ∈
        {queued, running, passed, failed, cancelled},
        input_asset_id (RESTRICT), manifest_asset_id (RESTRICT),
        command_version (= sha256 of onboard.py), started_at, completed_at,
        report_asset_id (RESTRICT), error_code, stdout_text, stderr_text
assets  id PK, job_id, role ∈ {input_glb, input_manifest, inspection,
        validation_report, product_glb, product_config, regions, diagnostic,
        uv_template}, filename, mime_type, byte_size, sha256, storage_key UNIQUE
```

Note the FK direction: `onboarding_jobs` references `onboarding_assets`, not the
reverse. `onboarding_assets.job_id` is an indexed plain column.

### `production_fonts`

```text
id PK, family, weight 100..900 step 100, style ∈ {normal, italic},
format ∈ {ttf, otf}, filename, mime_type ∈ {font/ttf, font/otf}, byte_size,
sha256, storage_key UNIQUE, license_name, license_reference, approved_by

Registered only via POST /api/v1/admin/production-fonts ("assets:upload").
Read by ProductionService via ProductionFontReader.find(family, 400, "normal")
purely to decide WHICH preflight warning to emit. It does not yet bind fonts
into the renderer — see BUSINESS_RULES.md, "Server font reproducibility".
```

### Auth tables (Better Auth owned)

`auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`. Column
names are camelCase because Better Auth generates the SQL; the table names are
remapped in `createVortexAuth()` via `modelName`. Ids are UUIDs
(`advanced.database.generateId: "uuid"`). `auth_accounts` has
`UNIQUE(issuer, accountId)`.

### `project_owner_claims`

`guest_id` PK → `user_id`, `project_count`, `claimed_at`. Written by
`claimAll()`. Its existence permanently retires a guest identity: `create()` on
`design_projects` and `createDataset()` on `personalization_datasets` both check
this table first and throw `GuestIdentityAlreadyClaimedError` → HTTP 409
`GUEST_IDENTITY_CLAIMED`.

### Shared-coordination tables (migration 17)

```text
rate_limit_windows   PK (bucket_key, window_started_at), hit_count, expires_at
                     Single-statement upsert with RETURNING → atomic consume.
                     ⚠ sweep() exists but is never called outside tests.

background_jobs      id PK, queue, idempotency_key, payload_json,
                     status ∈ {queued, running, succeeded, failed, abandoned},
                     attempts, max_attempts, run_after, lease_owner,
                     lease_expires_at, last_error, result_json, timestamps
                     UNIQUE(queue, idempotency_key)
                     ⚠ NO PRODUCTION CODE ENQUEUES OR CONSUMES FROM THIS TABLE.
                     Only tests/platform/shared-coordination.test.ts and
                     tests/platform/postgres-integration.test.ts use it.
                     See BACKGROUND_JOBS.md.
```

---

## Fields whose meaning is easy to get wrong

| Field | Why it matters |
|---|---|
| `design_projects.configuration_id` | Composite identity `versionId\|sorted-typed-selection`. Changing the encoding invalidates every stored project, quote and artifact match. |
| `design_projects.revision` | Optimistic-lock token AND the key into `project_revisions`. Never renumber it. |
| `design_projects.creation_key` | Client-supplied UUID (`clientRequestId`) scoped to the owner. `NULL` is allowed and does not participate in the unique index (SQLite treats NULLs as distinct). |
| `project_assets.storage_key` | Server-only. Leaking it in a DTO would expose the object-store layout. |
| `production_artifacts.project_revision` | Binds the artifact to a frozen design. The composite FK is `RESTRICT`, so a revision with an artifact cannot be removed. |
| `product_versions.sha256` | `canonicalJsonSha256(version)`. Not the sha of the file — the sha of the canonicalised version object. |
| `personalization_datasets.domain_dataset_id` | Content hash of the parsed CSV; the dedupe key. `id` is a separate row UUID. |
| `personalization_jobs.attempt` vs `max_attempts` | `markRunning` increments `attempt`; both retry and recovery refuse once `attempt >= max_attempts`. |
| `onboarding_jobs.command_version` | `sha256(product-onboarding/onboard.py)`. Provenance is pinned to the tool's content. |
| `background_jobs.lease_owner` | Part of the predicate of *every* mutating statement, not a diagnostic field. A worker whose lease expired cannot overwrite the run that recovered its job. |

## Tenant isolation

There is no tenant table. Isolation is per **`ProjectOwner`** and is enforced by
including `owner_type = ? AND owner_id = ?` in the SQL of every customer-facing
read and write (`OWNER_SQL` in `sqlite-project-repository.ts`, and the equivalent
in the pricing, production and personalization repositories). There is no
service-role query path that bypasses it. Embed clients are **not** a tenant
boundary in the database — an embedded customer is an ordinary guest owner.
