# Codebase Map

Organised by responsibility. For each area: **start here**, then the supporting
files that matter.

---

## Application bootstrap and HTTP plumbing

```text
START  src/instrumentation.ts            register() — the startup config gate
       src/server/config/environment.ts  validateDeploymentConfig()
       src/proxy.ts                      middleware: security + frame-ancestors
       src/server/http/api.ts            withOwner / withPublicApi / withAdminApi,
                                         readJson, json, assertSameOriginMutation
       src/server/http/request-security.ts  isSecureRequest()
       src/server/http/rate-limit.ts     assertRateLimit(), store selection
       src/server/http/rate-limit-stores.ts  InMemory + Sqlite stores
       src/platform/http/rate-limit.ts   fixed-window maths, store contract
       src/platform/projects/errors.ts   PlatformError / NotFound / Conflict /
                                         ValidationError
```

## Identity, sessions and operator authorization

```text
START  src/server/auth/owner-context.ts       resolveOwnerContext, GuestIdentityCodec,
                                              cookie attributes, test seams
       src/server/auth/better-auth.ts         lazy getAuth() singleton + secret load
       src/server/auth/create-auth.ts         pure betterAuth() factory
       src/lib/auth/client.ts                 browser auth client
       src/components/auth/AccountControl.tsx UI entry point
       src/components/auth/SignInPanel.tsx
       src/app/sign-in/page.tsx
       src/app/api/auth/[...all]/route.ts     Better Auth catch-all
       src/app/api/v1/session/route.ts        guest bootstrap
       src/app/api/v1/session/claim/route.ts  guest → user transfer

       src/server/operators/operator-authorization-service.ts  require(), lattice
       src/server/operators/sqlite-operator-grant-repository.ts
       src/server/operators/container.ts
       src/platform/operators/repository.ts
       src/platform/products/drafts.ts        ProductOperatorPermission union
```

## Persistence

```text
START  src/server/persistence/database.ts     THE SCHEMA. 17 migrations, pragmas,
                                              getVortexDatabase()
       src/server/persistence/backend.ts      configuredPersistenceBackend()
       src/server/persistence/canonical-json.ts  canonicalJson / canonicalJsonSha256
       src/server/persistence/sqlite-project-repository.ts   projects, revisions,
                                              assets, claimAll, OWNER_SQL
       src/server/persistence/postgres/connection.ts   pool + transaction()
       src/server/persistence/postgres/migrate.ts      whole-file DDL application
       src/server/persistence/postgres/postgres-job-queue-repository.ts
       src/server/persistence/postgres/postgres-rate-limit-store.ts
       docs/platform/postgresql/schema.sql    the PostgreSQL target DDL
```

Every other repository follows the same naming: `src/server/<domain>/sqlite-*-repository.ts`.

## Projects (the core customer object)

```text
START  src/server/projects/project-service.ts   create/open/list/update/archive/
                                                uploadArtwork/duplicate/preview/claim
       src/platform/projects/design-document.ts parseDesignDocument, collectAssetIds,
                                                strip/hydrate image sources, title
       src/platform/projects/types.ts           DesignProject, DTOs, limits
       src/platform/projects/repository.ts      ProjectRepository interface
       src/server/projects/image-upload.ts      sharp validation
       src/server/projects/project-preview.ts   renderDesignPreview / renderProjectPreview
       src/server/projects/container.ts

Routes src/app/api/v1/projects/route.ts
       src/app/api/v1/projects/[projectId]/route.ts
       src/app/api/v1/projects/[projectId]/{assets,duplicate,preview}/…

Client src/lib/projects/client.ts               fetch wrappers + owner bootstrap
       src/lib/projects/use-project-session.ts  autosave, creation idempotency,
                                                offline handling, preview scheduling
       src/lib/projects/location.ts             URL ↔ project sync
       src/components/projects/ProjectLibrary.tsx
       src/app/designs/page.tsx
```

## Products and configuration

```text
START  src/platform/products/configuration-resolver.ts  resolveProductConfiguration,
                                                parseOptionSelection, validateProductVersion,
                                                configurationId encoding
       src/platform/products/types.ts           options, ProductVersion, ProductCatalogReader
       src/server/products/product-catalog-service.ts   ensureSynchronized(), publish(),
                                                resolve(), legacyP0Version()
       src/server/products/product-api-service.ts       public DTOs
       src/server/products/product-operations-service.ts admin listing
       src/server/products/product-publishing-service.ts draft lifecycle
       src/server/products/product-contract-validator.ts resolved-config gates
       src/server/products/sqlite-product-catalog-repository.ts
       src/server/products/container.ts

Code catalogue (products are defined in code and seeded into the DB):
       src/lib/configurator/product-config.ts          PRODUCTS map, getProduct(),
                                                       DEFAULT_PRODUCT_ID, HIDDEN ids
       src/lib/configurator/generated/*.product.json   onboarding pipeline output
       src/lib/configurator/product-definitions.ts     CODE_PRODUCT_DEFINITIONS/VERSIONS
       src/lib/configurator/product-configuration-providers.ts  mailer-box provider
       src/lib/configurator/{mailer-box-spec,kraft-visiting-card-spec,pouch-spec,
                             nexibles-rstz-pouch,carton-spec}.ts

UI     src/components/products/ProductOptionConfigurator.tsx
       src/components/gallery/{ProductGallery,ProductCard,Product3DPreview}.tsx
       src/app/page.tsx
```

## Templates and bulk personalization

```text
START  src/server/templates/template-service.ts       public API + instantiate()
       src/server/templates/template-catalog-service.ts  versions, code seeding
       src/server/templates/template-draft-service.ts    operator lifecycle
       src/server/templates/template-asset-service.ts    shared artwork
       src/server/templates/personalization-dataset.ts   CSV import + variants
       src/platform/templates/personalization.ts         parse/merge/apply/validate
       src/platform/templates/types.ts
       src/lib/templates/fixtures.ts                CODE_TEMPLATE_* seed data
       src/lib/templates/client.ts

       src/server/personalization/personalization-service.ts  datasets + jobs
       src/server/personalization/personalization-runner.ts   the live runner
       src/server/personalization/sqlite-personalization-repository.ts
       src/platform/personalization/{types,repository}.ts

UI     src/components/templates/{TemplateBrowser,BulkPersonalizationPanel}.tsx
       src/app/templates/page.tsx
```

## Production output (preflight, PDF, manufacturing SVG)

```text
START  src/server/production/production-service.ts   snapshot(), preflight(), generate()
       src/server/production/pdf-production-exporter.ts
       src/server/production/svg-production-exporter.ts
       src/server/production/server-production-artwork.ts   sharp rasterisation
       src/server/production/server-icc-profile.ts
       src/server/production/production-font-service.ts
       src/server/production/sqlite-production-{artifact,font}-repository.ts
       src/platform/production/{exporter,repository,fonts,types,errors}.ts

Engine src/lib/print/normalize-job.ts          ProductConfig + design → print job
       src/lib/print/preflight.ts              the gates, effectiveImagePpi
       src/lib/print/printer-profiles.ts       the three PrinterProfiles
       src/lib/print/generate-production-pdf.ts
       src/lib/print/generate-manufacturing-svg.ts
       src/lib/print/manufacturing-geometry.ts
       src/lib/print/{physical-resolution,load-icc-profile,srgb2014-profile}.ts
       src/lib/print/provenance-preflight.ts   folds the claim ledger into the report
       src/lib/print/types.ts

Client src/lib/production/client.ts
```

## Manufacturing provenance (what the output may claim)

```text
START  src/lib/provenance/claims.ts        PACKAGING_CLAIMS, certifiedClaimMetadata()
       src/lib/provenance/ledger.ts        createProvenanceLedger + soundness checks
       src/lib/provenance/resolve-provenance.ts  ledger per ProductConfig kind
       src/lib/provenance/pouch-ledger.ts
       src/lib/provenance/diagnostics.ts   admin-console view model
       src/types/provenance.ts             ParameterProvenance union
```

## Structural engine (the heart of the product)

```text
START  src/lib/structure/vector-domain.ts     CanonicalDieline, operations, tolerances
       src/lib/structure/index.ts             barrel re-export

Import src/lib/structure/import-svg.ts   (1275 lines)
       src/lib/structure/import-dxf.ts   (992)
       src/lib/structure/import-pdf.ts   (612) + import-pdf-raw.ts (620)

Math   src/lib/structure/vector-math.ts       flatten, distances, areas (944)
       src/lib/structure/vector-quality.ts
       src/lib/structure/vector-validation.ts (741)

Topology src/lib/structure/topology.ts        planar graph, cut cycles, panels (567)
         src/lib/structure/topology-profile.ts hash-locked repair profiles
         src/lib/structure/structural-tree.ts  panel adjacency tree

3D     src/lib/structure/structural-mesh.ts   panel geometry + sheet UVs
       src/lib/structure/structural-rig.ts    hinge definitions, resolveStructuralRig
       src/lib/structure/canonical-sheet-view.ts

Gates  src/lib/structure/structural-quality.ts    measureFlatPanelEquivalence
       src/lib/structure/structural-acceptance.ts golden gates
       src/lib/structure/structural-runtime-quality.ts
       src/lib/structure/structural-authoring.ts  reviewed authoring entry point
       src/lib/structure/synthetic-carton.ts      generated test cartons
       src/lib/structure/diagnostic-art.ts        continuity diagnostic texture

Golden src/lib/structure/golden-*.ts             reference-recreation lane
       src/app/studio/golden-reference/**        dev-only preview + capture
       scripts/verify-golden-*.ts, finalize-golden-reference.ts,
       capture-golden-reference.ts
       fixtures/**/reference-manifest.json
       docs/structural-engine/*.md
```

## Configurator runtime (fold, editor state, 3D)

```text
START  src/lib/configurator/unfold-plan.ts     authored + derived unfold plans
       src/lib/configurator/unfold-state.ts    the reducer
       src/lib/configurator/hinge-animation.ts timed, interruption-safe motion
       src/lib/configurator/use-unfold.ts
       src/lib/configurator/carton-topology.ts hinge extraction from a CartonSpec
       src/lib/configurator/carton-geometry.ts
       src/lib/configurator/structural-carton.ts  canonical dieline → carton
       src/lib/configurator/design-state.ts    createEmptyDocument, (de)serialize
       src/lib/configurator/editor-selection.ts, snapping.ts, image-crop.ts
       src/lib/configurator/texture-manager.ts, fabric-material.ts
       src/lib/configurator/glb-articulation.ts
       src/lib/configurator/{presentation,dieline-presentation,
                             studio-scene-presentation,product-summary}.ts
       src/types/{configurator,carton,pouch,unfold}.ts
```

## Studio and editor UI

```text
START  src/components/studio/StudioShell.tsx     composes everything
       src/components/studio/{StudioTopBar,StudioToolRail,StudioPanel,
                              StudioPreview}.tsx
       src/components/configurator/DesignEditor.tsx      Konva 2D editor
       src/components/configurator/Product3DViewer.tsx   R3F canvas
       src/components/configurator/{ProductModel,CartonModel,PouchModel,
                                    ProceduralPouchModel,FlatSheetModel}.tsx
       src/components/configurator/{SurfaceSelector,LayersPanel,UnfoldControl,
                                    DielineOverlay,DielineGuideControls,
                                    ArtworkTreatmentControls,EditorContextToolbar}.tsx
       src/app/studio/page.tsx
```

## Embedded configurator

```text
START  src/platform/embed/resolve-embed.ts       fail-closed resolution + defaults
       src/platform/embed/types.ts               EmbedClient, features, completion
       src/server/embed/embed-client-registry.ts VORTEX_EMBED_CLIENTS parsing
       src/lib/embed/protocol.ts                 host ↔ frame message contract
       src/lib/embed/embed-request-context.ts    x-vortex-embed-client header
       src/components/embed/{EmbedShell,EmbedToolRail,use-embed-host}.tsx|ts
       src/app/embed/[clientId]/[productId]/page.tsx
       src/proxy.ts                              per-request frame-ancestors
```

## Operator console

```text
START  src/app/admin/products/page.tsx           the whole console (server component)
       src/components/admin/{ProductDraftPanel,TemplateDraftPanel,
                             TemplateAssetPanel,OnboardingPanel}.tsx
       src/server/products/admin-dto.ts
       src/server/onboarding/admin-dto.ts
       src/app/api/v1/admin/**                   18 admin route files
```

## GLB onboarding

```text
START  src/server/onboarding/onboarding-service.ts   validation + job creation
       src/server/onboarding/onboarding-runner.ts    spawn(), stages, output whitelist
       src/server/onboarding/sqlite-onboarding-job-repository.ts
       src/platform/onboarding/types.ts

Python product-onboarding/onboard.py           inspect | build | validate | integrate
       product-onboarding/lib/{inspector,build,assets,strategies,validate_math}.py
       product-onboarding/products/<id>/manifest.json
       product-onboarding/{README,AGENT-GUIDE,STATE,RUNLOG}.md
```

## Embroidery preview (visual only)

```text
START  src/lib/embroidery/index.ts        generateEmbroidery(), quality tiers
       src/lib/embroidery/{preprocess,quantize,stitch-plan,stitch-field,edt,
                           render-maps,canvas,cache,compose-surface-maps}.ts
       src/lib/embroidery/{stitch.worker.ts,worker-client.ts,
                           stitch-worker-protocol.ts,use-embroidery.ts}
       src/types/embroidery.ts
```

## Background work

```text
LIVE   src/server/personalization/personalization-runner.ts
       src/server/onboarding/onboarding-runner.ts
DORMANT src/platform/jobs/{types,worker}.ts
        src/server/jobs/sqlite-job-queue-repository.ts
        src/server/persistence/postgres/postgres-job-queue-repository.ts
```

## Research / non-product surfaces

```text
src/app/test/page.tsx                 → src/components/pacdora-lab/PacdoraLab.tsx
src/lib/pacdora-lab/**                  procedural box + pouch solvers
src/lib/packaging/stand-up-profile.ts
src/lib/qa/**                           product-experience diagnostics + gates
src/app/studio/product-experience/capture/page.tsx
src/app/studio/golden-reference/**      dev-only, disabled in production
experiments/                            not compiled (tsconfig exclude)
```

## Not part of the application

```text
examples/embed/index.html   A working host-page reference for the embed
                            integration. Read it before changing src/lib/embed/protocol.ts.
output/                     Generated PDFs and analysis artefacts, checked in.
cloudflare/kimi-k3/         An UNRELATED side project (an OpenAI-compatible
                            Workers proxy for a third-party model). It is not
                            imported by, deployed with, or referenced by Vortex.
experiments/                Scratch UV-onboarding harnesses. Excluded from
                            tsconfig, so type errors here never fail the build.
pacdora.md, EXTREME_WEALTH_RESEARCH_REPORT.md, craycol-seo-audit.html
                            Research notes, not specifications.
```

---

## "Where do I start if I need to change X?"

| Task | First file |
|---|---|
| Add an API endpoint | Copy the closest sibling in `src/app/api/v1/**`; wire a service from a `container.ts` |
| Add a database table | `src/server/persistence/database.ts` — add migration 18 and bump `SCHEMA_VERSION`; mirror it in `docs/platform/postgresql/schema.sql` |
| Add a product | `src/lib/configurator/product-config.ts` + `product-definitions.ts` (it is then auto-published into the DB) |
| Add a product option | `src/platform/products/types.ts` (option kind) + `configuration-resolver.ts` (resolution) |
| Change what blocks a print export | `src/lib/print/preflight.ts` and `ProductionService.snapshot()` |
| Add a printer profile | `src/lib/print/printer-profiles.ts` |
| Change the fold sequence | `src/lib/configurator/unfold-plan.ts` (authored steps live on the spec) |
| Change dieline import | `src/lib/structure/import-*.ts`; re-run the structure tests |
| Add an operator permission | `src/platform/products/drafts.ts`, the `operator_grants` CHECK in a new migration, `ALL_OPERATOR_PERMISSIONS`, and `operatorHasPermission()` |
| Add an embed capability | `src/platform/embed/types.ts` (`EmbedFeatures`) + `DEFAULT_EMBED_FEATURES` (must default `false`) |
| Add an environment variable | `src/server/config/environment.ts` (so it fails at startup, not at first use) + `.env.example` + `CONFIGURATION.md` |
