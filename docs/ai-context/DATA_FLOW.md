# Data Flow

Six flows carry essentially all of this system's behaviour. Each is traced from
the real files in this commit.

---

## Flow 1 — Identity bootstrap (precedes every other flow)

**Trigger:** first client-side API call from a fresh browser.
**Entry point:** `GET /api/v1/session` → `src/app/api/v1/session/route.ts`.

```text
Browser
  │ ensureOwnerContext()  src/lib/projects/client.ts:59
  ▼
GET /api/v1/session
  │ withOwner()                       src/server/http/api.ts:57
  ▼
resolveOwnerContext(request)          src/server/auth/owner-context.ts:174
  ├─ BetterAuthAuthenticationProvider.authenticatedOwner()
  │     └─ getAuth().api.getSession({headers})  →  {type:"user", id}
  └─ else GuestIdentityCodec.verify(cookie "vortex_guest")
        ├─ valid   → {type:"guest", id}
        └─ absent  → issue()  =  `${uuid}.${HMAC-SHA256(uuid, secret)}`
                                 pendingGuestCookie set
  ▼
applyOwnerCookie(response, context, isSecureRequest(request))
  Set-Cookie vortex_guest; HttpOnly; Path=/; maxAge=31 536 000
  SameSite=Lax  normally
  SameSite=None; Secure; Partitioned  when embedded AND https
  ▼
{ owner: { type } }        ← the opaque id is deliberately never returned
```

**Why the bootstrap exists:** React Strict Mode double-mounts would otherwise
race two mutations under two independently issued guest identities.
`ownerBootstrap` in `client.ts` is a module-level shared promise.

**Failure path:** none — a fresh guest is always issuable. In production a
missing `VORTEX_GUEST_COOKIE_SECRET` throws at startup, not here.

---

## Flow 2 — Design a product and autosave (the core customer flow)

**Trigger:** the customer opens `/studio?product=<id>`.

```text
/studio?product=X  (RSC)  src/app/studio/page.tsx
  │ getProductCatalogService().resolve(productId, version ?? null, selection)
  │   └─ ProductCatalogService.ensureSynchronized()   publishes CODE_PRODUCT_VERSIONS
  │   └─ resolveProductConfiguration(version, selection, PRODUCT_CONFIGURATION_PROVIDERS)
  │         validates options → merges defaults → static config or provider
  │         → configurationId = `${versionId}|k=v&k=v` (sorted, type-tagged)
  ▼
<StudioShell config presentationMode catalogue requestedProjectId>
  │  key = `${config.id}:${config.configurationId}:${project ?? "new"}`
  ▼ (client)
useProjectSession()   src/lib/projects/use-project-session.ts
  │
  ├─ no ?project → createPendingProject(identity, productId, optionSelection)
  │     creationKey persisted in sessionStorage under
  │     `vortex:pending-project:<productId>:<versionId>:<configurationId>`
  │     POST /api/v1/projects { productId, clientRequestId, optionSelection }
  │
  └─ ?project=<id> → GET /api/v1/projects/<id>
  ▼
history.replaceState(url with ?project=<id>)     applyProjectLocation()
  ▼
edits mutate DesignDocument in the editor; commitSequence increments
  ▼
700 ms debounce (AUTOSAVE_DELAY_MS)
  ▼
PATCH /api/v1/projects/<id> { expectedRevision, design }
```

### Server side of the save

`src/app/api/v1/projects/[projectId]/route.ts` → `ProjectService.update()`
(`src/server/projects/project-service.ts`):

1. `expectedRevision` must be a positive integer → else 400 `INVALID_REVISION`.
2. `repository.findById(id, owner)` — owner-scoped; miss → 404.
3. `status === "archived"` → 400 `PROJECT_ARCHIVED`.
4. `configurationForProject(existing)` re-resolves the product **server-side**
   and asserts `resolved.configurationId === project.configurationId`
   → else 400 `PROJECT_CONFIGURATION_MISMATCH`.
5. `parseDesignDocument(request.design)` — full structural validation
   (`src/platform/projects/design-document.ts`), max 64 surfaces, 2 000 elements,
   unique element ids, bounded transforms, crop inside `[0,1]`.
6. `validateSurfaceContract(parsed, product)` — the design's surface id set must
   equal the product version's `editableSurfaces` exactly.
7. `canonicalizeArtworkMetadata()` — every image element **must** carry an
   `assetId` owned by this project; the server overwrites `sourcePixelWidth/
   Height`, `sourceName`, `sourceMimeType` from the stored asset row. Client
   metadata is never trusted.
8. `stripRuntimeImageSources()` removes browser `src` blobs.
9. `repository.update()` — one SQLite transaction:
   `UPDATE design_projects … WHERE id=? AND owner=? AND revision=?`,
   then `INSERT INTO project_revisions(project_id, revision, design_json, …)`.

**Database changes:** `design_projects` row bumped (`revision+1`, `updated_at`),
one new immutable `project_revisions` row.
**Completion:** response carries the new `revision`; the client stores it in
`revisionRef` and sets `saveState="saved"`.
**Failure path:** `kind:"conflict"` → `ConflictError` → HTTP 409
`REVISION_CONFLICT` with `details.currentRevision`. The client keeps the pending
edit in `pendingRef` and shows `failed`; going offline sets `offline` and a
`beforeunload` guard fires.

### Preview generation (fire-and-forget tail)

1 500 ms after a successful save (`PREVIEW_DELAY_MS`) the client calls
`POST /api/v1/projects/<id>/preview` → `ProjectService.generatePreview()` →
`renderProjectPreview()` (`src/server/projects/project-preview.ts`, uses
`sharp`) → PNG stored at `projects/<projectId>/<assetId>.png` → asset row
`kind:"preview"` → `setPreviewAsset()` → the **old** preview asset row and its
bytes are deleted. Preview failure is swallowed by design so it can never turn a
saved design into a failed save.

### Artwork upload sub-flow

```text
POST /api/v1/projects/:id/assets      multipart, field name must be exactly "file"
  ├─ assertSameOriginMutation
  ├─ assertRateLimit("asset-upload", owner, {limit:20, windowMs:60_000})
  ├─ Content-Length required, > 0, ≤ MAX_UPLOAD_BYTES + 1 MiB
  ├─ file.size ≤ MAX_UPLOAD_BYTES (20 MiB)
  ▼
validateImageUpload(bytes, filename)   src/server/projects/image-upload.ts
  sharp: format ∈ {png,jpeg,webp}; pages === 1; limitInputPixels 40 000 000;
  decoder.stats() forces a FULL decode (a truncated file with a valid header
  must not pass); EXIF orientation 5–8 swaps width/height;
  filename NFKC-normalised, control chars stripped, 180 chars max
  ▼
objectStore.put(`projects/<projectId>/<assetId>.<ext>`, bytes, mime)
  ▼
repository.createAsset(...)     ← on failure the object is deleted again
  ▼
201 { asset: { …, readUrl: /api/v1/projects/:id/assets/:assetId/content } }
```

---

## Flow 3 — Preflight and production export

**Trigger:** the customer asks for a print-ready artifact.

```text
POST /api/v1/projects/:id/production/preflight   { revision? }
   rate limit "production-preflight" 30/min
POST /api/v1/projects/:id/production/artifacts   { revision?, kind: "pdf"|"svg" }
   rate limit "production-generation" 10/min
                       │
                       ▼
        ProductionService.generate()   src/server/production/production-service.ts
                       │
   ┌───────────────────┴──────────────────────────────────────────────┐
   │ 1. findById(projectId, owner)               404 if not owned      │
   │ 2. projectRevision = revision ?? project.revision                 │
   │ 3. artifacts.findForRevision(project, revision, kind, owner)      │
   │       HIT → verify bytes (mime, size, sha256) and RETURN it.      │
   │              Artifacts are immutable and never regenerated.       │
   └───────────────────┬──────────────────────────────────────────────┘
                       ▼
        snapshot(owner, projectId, projectRevision)
          ├─ projects.findRevision()  the FROZEN design_json, not the live one
          ├─ productCatalog.resolve()  re-resolved server-side; configurationId
          │     must match the project row
          ├─ parseDesignDocument() + surface-contract check
          ├─ for each referenced assetId:
          │     owned?  bytes present?  byteSize == ?  contentType == ?  sha256 == ?
          │     any failure → PreflightIssue severity "error"
          ├─ normalizePrintJob(product, canonicalDesign)   src/lib/print/normalize-job.ts
          ├─ preflightPrintJob(job)                        src/lib/print/preflight.ts
          ├─ withAssetChecks(...)      persistent artwork integrity check
          ├─ withServerFontCheck(...)  ALWAYS emits a warning when text exists
          └─ withProvenanceCheck(...)  src/lib/print/provenance-preflight.ts
                       │
        report.passed ?│
             no ───────┴──► ProductionPreflightError(report)   → 4xx with the report
             yes
              ▼
        exporter.supports(job) ? else 400 PRODUCTION_FORMAT_UNSUPPORTED
              ▼
        PdfProductionExporter | SvgProductionExporter
          renders artwork via server-production-artwork.ts (sharp) at profile.renderPpi
          embeds ICC output intent (srgb2014 embedded, or the public FOGRA39 file)
          emits CutContour / Crease spot-colour technical layers
              ▼
        objectStore.put(`production/<projectId>/<artifactId>.<pdf|svg>`)
              ▼
        artifacts.create(artifact)      UNIQUE(project_id, project_revision, kind)
          ├─ created  → projects.setStatusForRevision(..., "production_ready")
          └─ raced    → delete the just-written object, verify + return the winner
              ▼
        201 { artifact: { …, downloadUrl: /api/v1/production-artifacts/:id/content } }
```

**Download:** `GET /api/v1/production-artifacts/:id/content` re-verifies bytes
against the stored sha256 before serving, and sets
`Content-Security-Policy: sandbox`, `Cross-Origin-Resource-Policy: same-origin`,
`Content-Disposition: attachment`, `ETag: "<sha256>"`.
A mismatch is a 500 `PRODUCTION_ARTIFACT_INTEGRITY_FAILED`, never a silent serve.

**Preflight side effect:** a *passing* preflight promotes the project to
`ready_for_preflight` for that exact revision; a failing one only logs
`production.preflight-failed`.

---

## Flow 4 — Bulk personalization (the one real async flow)

```text
POST /api/v1/personalization-datasets   multipart {templateId, templateVersionId, file, mapping?}
   rate limit "personalization-dataset" 20/min; CSV ≤ 5 MiB
        ▼
PersonalizationService.createDataset()
   purgeExpired() → importPersonalizationCsv(template, csv, mapping)
   rows 1..10 000, columns validated against the template's placeholderDefinitions
   dataset.id is CONTENT-ADDRESSED (domainDatasetId); re-uploading the same CSV
   returns the existing unexpired dataset instead of a second one
        ▼
   objectStore.put(`personalization/datasets/<id>.json`, canonicalJson(dataset))
   INSERT personalization_datasets (expires_at = now + 30 days)
        ▼
POST /api/v1/personalization-jobs   { datasetId }   header Idempotency-Key required
   rate limit "personalization-job" 20/min
   key must match /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,127}$/
        ▼
   INSERT personalization_jobs status='queued' attempt=0 max_attempts=3
   duplicate key + different dataset → 409 IDEMPOTENCY_CONFLICT
        ▼
   runner.schedule(jobId)        ← IN-PROCESS. queueMicrotask, max 2 concurrent.
        ▼  202 Accepted
PersonalizationRunner.run(jobId)   src/server/personalization/personalization-runner.ts
   markRunning()  status='running', attempt+=1, processed=0, failed=0
        │  guarded by  WHERE status='queued' AND attempt < max_attempts
        ▼
   loadDataset(id)  ── integrity-checked: payload sha256, row count, rowIndex
        │                order, per-row parsePersonalizationData
        ▼
   for each variant of personalizedTemplateVariants(template, dataset):
        ├─ re-reads the job row EVERY row to honour cancellation
        ├─ appends one canonical-JSON NDJSON line
        ├─ hard stop at 64 MiB → PERSONALIZATION_OUTPUT_TOO_LARGE
        └─ updateProgress() every 25 rows (PROGRESS_INTERVAL)
        ▼
   objectStore.put(`personalization/jobs/<id>.ndjson`, bytes, application/x-ndjson)
   finishJob(status='completed', outputSha256, outputByteSize)
        ▼
GET /api/v1/personalization-jobs/:id           poll status/processed/total
GET /api/v1/personalization-jobs/:id/output    re-verifies sha256 + size + type
POST /api/v1/personalization-jobs/:id/cancel   only from queued|running
POST /api/v1/personalization-jobs/:id/retry    only from failed AND attempt < max
```

**Restart behaviour:** `getPersonalizationService()` fires
`service.recover()` on first use. `recoverInterruptedJobs()` moves every
`running` row to `queued` (resetting progress) unless attempts are exhausted, in
which case it becomes `failed` with `PERSONALIZATION_WORKER_INTERRUPTED`.
**Failure path:** any throw deletes the partial output object and records
`PERSONALIZATION_GENERATION_FAILED` (or a specific `PERSONALIZATION_*` code).

---

## Flow 5 — GLB product onboarding (operator, spawns Python)

```text
POST /api/v1/admin/onboarding/jobs   multipart {productId, draftId?, glb, manifest?}
  requires "onboarding:run"
  glb ≤ 64 MiB, manifest ≤ 1 MiB; GLB magic + version + declared length checked
  manifest is REWRITTEN: parsed.id = productId, parsed.source = "source.glb"
        ▼  202 Accepted, job status "queued"
OnboardingRunner.schedule(jobId)     in-process, max 2 concurrent
        ▼
  workDir = <VORTEX_DATA_DIR>/onboarding-work/<jobId>   mode 0700, mkdir exclusive
  input bytes re-verified against the stored sha256 before being written out
        ▼
  spawn(python, [onboard.py, "inspect",  workDir])   shell:false, minimal env
        │   non-zero → ONBOARDING_INSPECTION_FAILED (or ONBOARDING_TIMEOUT, code 124)
        ├─ inspection.json stored as an onboarding_asset
        └─ no manifest supplied → job PASSES here (inspection-only run)
        ▼
  spawn(python, [onboard.py, "build",    workDir])
        │  outputs whitelisted by filename in outputDescriptor():
        │  product-customizable.glb, product.json, regions.json,
        │  diagnostic-*.png, uv-template-*.{png,svg}
        │  per-file ≤ 64 MiB, total ≤ 160 MiB
        ▼
  spawn(python, [onboard.py, "validate", workDir])
        │  stdout must be JSON; passed = exitCode===0 && report.passed === true
        ▼
  finally: rm -rf workDir; repository.complete(status, reportAssetId, errorCode,
           stdout/stderr truncated to 256 KiB and stripped of control characters)
        ▼
POST /api/v1/admin/onboarding/jobs/:jobId/attach { draftId, expectedRevision }
  requires BOTH "onboarding:run" and "products:edit"
  job.status must be "passed"; job.productId must equal the draft's productId
  → product_drafts.onboarding_job_id / _report_sha256 / _tool_version
  → audit event "onboarding_attached"
```

`commandVersion` is `sha256(onboard.py)` — the tool version is pinned by content
hash, so a changed script invalidates provenance.

---

## Flow 6 — Product draft → published immutable version (operator)

```text
POST /api/v1/admin/products/:productId/drafts        "products:edit"
      createFromCurrent()  →  draft revision 1, baseVersionId = current version id
PATCH /api/v1/admin/product-drafts/:draftId          "products:edit"
      { expectedRevision, name?, description?, visibility? }   ← only these 4 keys
POST  /api/v1/admin/product-drafts/:draftId/validate "products:validate"
      evaluate(draft):
        baseVersionId still equals the live current version?  else PRODUCT_DRAFT_BASE_STALE
        candidateVersion = `${productId}@${maxVersion+1}`
        catalog.resolveCandidate(version, {})   ← resolves with NO options
        validateResolvedProductContract(productConfig, presentation.mode)
      → draft.status = "validated" (or stays draft with a failed report)
POST  /api/v1/admin/product-drafts/:draftId/publish  "products:publish"
      revision must match; status must be "validated";
      validation.draftRevision must equal expectedRevision;
      RE-EVALUATES and compares canonical JSON of the report:
        differs → PRODUCT_DRAFT_REVALIDATION_REQUIRED (the new report is recorded)
      → ProductCatalogService.publish(definition, version, checksum)
      → INSERT product_versions (immutable, sha256-checked)
      → product_definitions.current_version_id updated
      → audit event "version_published"
GET   /api/v1/admin/product-drafts/:draftId/audit    "products:read"
```

Every draft action writes a `product_audit_events` row in the same transaction as
the state change. The template equivalent (`template_drafts` /
`template_draft_events`) is a near-exact parallel implementation.

---

## Flow 7 — Embedded configurator on a client website

```text
Manufacturer page  <iframe src="https://vortex.example/embed/<clientId>/<productId>?host=https://shop.example">
        ▼
src/proxy.ts   matches /embed/:clientId/:productId
   registry.find(clientId) && status==="active"
     → Content-Security-Policy: frame-ancestors <exact origins>
     → (no X-Frame-Options)
   otherwise
     → frame-ancestors 'none'  +  X-Frame-Options: DENY
        ▼
src/app/embed/[clientId]/[productId]/page.tsx
   resolveEmbedConfig(registry, {clientId, productId, hostOrigin: ?host})
     fails closed on: UNKNOWN_CLIENT, CLIENT_DISABLED, MISSING_HOST_ORIGIN,
                      ORIGIN_NOT_ALLOWED, PRODUCT_NOT_ENABLED
     — every rejection renders the SAME shell so probing leaks nothing
   theme → CSS custom properties;  features → all default false
        ▼
EmbedShell (client)  →  markEmbedContext(clientId)
   every subsequent fetch carries  x-vortex-embed-client: <clientId>
        ▼
server: isEmbeddedRequest() → OwnerContext.embedded = true
   guest cookie becomes SameSite=None; Secure; Partitioned  (CHIPS)
   → each top-level site gets its own cookie jar; clients cannot share sessions
        ▼
host ↔ frame postMessage, namespaced "vortex-embed", version 1
   src/lib/embed/protocol.ts
```

The registry itself is `VORTEX_EMBED_CLIENTS`, a JSON array parsed by
`src/server/embed/embed-client-registry.ts`. Wildcard origins are rejected
outright. Adding a manufacturer is an environment change, not a code change.
