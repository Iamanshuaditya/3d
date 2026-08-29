# Business Rules

Rules encoded in application logic that a future change could silently break.
Each entry names the enforcement point so it can be re-verified.

---

## Ownership and identity

### R1 — Every customer resource is owner-scoped in SQL
```text
Behaviour     Reads and writes of projects, assets, revisions, production
              artifacts, price quotes, personalization datasets and jobs all
              include `owner_type = ? AND owner_id = ?` in the statement. A
              non-owner gets 404, never 403 — existence is not disclosed.
Enforced in   src/server/persistence/sqlite-project-repository.ts (OWNER_SQL)
              src/server/production/sqlite-production-artifact-repository.ts (OWNER_JOIN)
              src/server/pricing/sqlite-price-quote-repository.ts
              src/server/personalization/sqlite-personalization-repository.ts
Edge cases    There is NO administrative override path to another owner's data.
Confidence    VERIFIED
```

### R2 — A claimed guest identity is retired forever
```text
Behaviour     Once POST /api/v1/session/claim writes a project_owner_claims row
              for a guest_id, that guest can never create another project or
              personalization dataset. The attempt throws
              GuestIdentityAlreadyClaimedError → 409 GUEST_IDENTITY_CLAIMED.
Enforced in   sqlite-project-repository.ts create() (pre-check inside the txn)
              sqlite-personalization-repository.ts createDataset()
              The claim endpoint clears the guest cookie on success.
Edge cases    Re-claiming by the SAME user is idempotent and adds to
              project_count. A DIFFERENT user gets 409 GUEST_ALREADY_CLAIMED.
              The claim also migrates personalization datasets and jobs, but
              NOT price quotes — quotes stay under the guest owner. (See
              KNOWN_RISKS.)
Confidence    VERIFIED
```

### R3 — Embedded sessions get partitioned cookies, but only over HTTPS
```text
Behaviour     partitioned = context.embedded && secure. When true the cookie is
              SameSite=None; Secure; Partitioned. When embedded over plain HTTP
              it deliberately stays SameSite=Lax rather than emitting a cookie
              every browser would reject.
Enforced in   src/server/auth/owner-context.ts guestCookieAttributes()
              src/server/http/request-security.ts isSecureRequest()
Relevant      COOKIE_MAX_AGE_SECONDS = 31 536 000 (365 days)
Edge cases    `embedded` is decided solely by the presence of the
              x-vortex-embed-client header, which a client can set on any
              request. It only changes cookie attributes, not authorization.
Confidence    VERIFIED
```

---

## Product configuration

### R4 — Options resolve deterministically, and an inapplicable option is an error
```text
Behaviour     resolveProductConfiguration() merges declared defaults, then the
              caller's selection, then walks options in declaration order:
              • visibleWhen false + value supplied → OPTION_NOT_VISIBLE
              • availableWhen false + (supplied or required) → OPTION_UNAVAILABLE
              • missing + required → OPTION_REQUIRED
              • unknown key → UNKNOWN_OPTION
              Numbers must satisfy min/max and step alignment within
              STEP_EPSILON = 1e-8. Dimensions convert to mm
              (in ×25.4, cm ×10). Selects must match a declared value AND its
              availableWhen.
Enforced in   src/platform/products/configuration-resolver.ts
Relevant      OPTION_COUNT_MAX = 64, OPTION_VALUE_MAX_LENGTH = 512,
              STEP_EPSILON = 1e-8
Edge cases    Option ids may not self-reference or reference an unknown option
              (SELF_OPTION_DEPENDENCY / UNKNOWN_OPTION_DEPENDENCY, checked at
              version validation). Values are type-strict: the number 1 and the
              string "1" are different values and produce different
              configurationIds.
Confidence    VERIFIED
```

### R5 — configurationId is the configuration's identity
```text
Behaviour     `${versionId}|${key}=${t}:${encodeURIComponent(value)}&…` with
              keys sorted lexicographically and t ∈ {s,n,b}.
Enforced in   configuration-resolver.ts::configurationId()
Used by       design_projects.configuration_id, price_quotes.configuration_id,
              production_artifacts.configuration_id, template compatibility
              matching, StudioShell React keys, static pricing rule lookup.
Edge cases    Changing this encoding invalidates every stored row that carries
              it, including template compatibility matches and pricing rules.
              Treat it as a wire format.
Confidence    VERIFIED
```

### R6 — Only published versions resolve; drafts never serve customers
```text
Enforced in   validateProductVersion(): status !== "published" →
              VERSION_NOT_PUBLISHED. The public catalogue additionally filters
              on `definition.visibility === "public"` and a non-null
              currentVersionId (src/app/page.tsx, ProductApiService.list,
              PricingService.create).
Confidence    VERIFIED
```

### R7 — Mailer box manufacturability rule (an actual physical constraint)
```text
Rule          length >= width  AND  depth * 2 <= width
Behaviour     Violation throws CONFIGURATION_UNMANUFACTURABLE.
Enforced in   src/lib/configurator/product-configuration-providers.ts
              (MAILER_BOX_PROVIDER_ID = "mailer-box-0427-v1")
Relevant      EDITOR_PIXELS_PER_MM = 3; layoutMarginMm = 8;
              camera distance = max(3.4, longestSide*0.01*2.45)
Confidence    VERIFIED
```

---

## Design documents and saving

### R8 — The design surface set must equal the product version's surface set
```text
Behaviour     Not a subset — an exact set equality on ids. Mismatch is 400
              SURFACE_CONTRACT_MISMATCH on both save and production snapshot.
Enforced in   ProjectService.validateSurfaceContract()
              ProductionService.snapshot()
Why           A product version can add or remove surfaces; an old design must
              not silently print onto a changed structure.
Confidence    VERIFIED
```

### R9 — Image elements must reference project-owned assets; client metadata is overwritten
```text
Behaviour     Every image element needs an assetId owned by this project and of
              kind "artwork" (else ASSET_NOT_PERSISTED / ASSET_NOT_OWNED). The
              server then REPLACES sourcePixelWidth, sourcePixelHeight,
              sourceName and sourceMimeType from the asset row, and strips the
              browser `src` before persisting.
Enforced in   ProjectService.canonicalizeArtworkMetadata() +
              stripRuntimeImageSources() (src/platform/projects/design-document.ts)
Why           Print resolution is computed from these numbers; a client that
              could lie about them could defeat the PPI preflight gate.
Confidence    VERIFIED
```

### R10 — Design document limits
```text
PROJECT_MAX_SURFACES  = 64      surfaces per document
PROJECT_MAX_ELEMENTS  = 2 000   elements across all surfaces
PROJECT_TITLE_MAX_LENGTH = 120  after trim + whitespace collapse
Element ids unique across the whole document.
Bounds: x/y ±10 000 000; rotation ±36 000; scaleX/Y ±100; opacity 0..1;
        fontSize 0.1..10 000; text ≤ 20 000 chars; fill ≤ 128 chars;
        crop x,y ∈ [0,1], width/height ∈ [0.01,1], x+width ≤ 1.000001.
Personalization: MAX_DEPTH 8, MAX_FIELDS 256, MAX_STRING_LENGTH 2 000.
Enforced in   src/platform/projects/design-document.ts,
              src/platform/templates/personalization.ts
Confidence    VERIFIED
```

### R11 — The Studio may only request two statuses
```text
Behaviour     PATCH /api/v1/projects/:id rejects any status other than "draft"
              or "ready_for_preflight" with 400 INVALID_STATUS.
              "production_ready" is set only by ProductionService.generate();
              "archived" only by DELETE.
Confidence    VERIFIED
```

### R12 — Project creation is idempotent per (owner, clientRequestId)
```text
Behaviour     clientRequestId must be a UUID when supplied. The DB enforces
              UNIQUE(owner_type, owner_id, creation_key) and the INSERT uses
              ON CONFLICT DO NOTHING; a replay returns the existing project.
              If that existing project belongs to a different product,
              configuration or template, the response is 400 CREATION_KEY_REUSED.
Client side   The key is persisted in sessionStorage under
              `vortex:pending-project:<productId>:<versionId>:<configurationId>`
              so a Strict-Mode remount or Fast Refresh cannot create a second
              project.
Confidence    VERIFIED
```

---

## Production and print

### R13 — Production binds to a frozen revision, never the live design
```text
Behaviour     ProductionService.snapshot() reads project_revisions, not
              design_projects.design_json, and re-resolves the product version
              and configuration server-side.
Enforced in   src/server/production/production-service.ts
Confidence    VERIFIED
```

### R14 — Production artifacts are immutable and unique per (project, revision, kind)
```text
Behaviour     A second generate() for the same triple returns the existing
              artifact after verifying its bytes; it never re-exports. A race
              that loses the UNIQUE constraint deletes its own just-written
              object and returns the winner.
Constraint    UNIQUE(project_id, project_revision, kind) on production_artifacts
Confidence    VERIFIED
```

### R15 — Preflight gates that block export (severity "error")
```text
PRODUCT_MISMATCH                design.productId != product.id
INVALID_PAGE_GEOMETRY           non-finite or non-positive physical/editor dims
MISSING_CUT_PATH                a surface has no dieline.cuts
INSUFFICIENT_BLEED              bleed < profile.minimumBleedMm (0.01 mm slack)
RASTER_BUDGET_EXCEEDED          w*h at renderPpi > profile.maximumRasterPixels
IMAGE_DIMENSIONS_UNKNOWN        no source pixel dimensions
IMAGE_PPI_TOO_LOW               effective PPI < profile.minimumImagePpi
EMBROIDERY_PRODUCTION_UNSUPPORTED  any element with treatment.mode "embroidery"
PRODUCTION_ASSET_NOT_OWNED / _BYTES_MISSING / _INTEGRITY_FAILED / _ID_REQUIRED

Warning only (does not block):
IMAGE_PPI_WARNING               PPI < profile.warningImagePpi
SERVER_FONT_APPROVAL_REQUIRED / SERVER_FONT_RENDERER_BINDING_REQUIRED

Effective PPI is computed AFTER scale, rotation and crop, in physical space —
deliberately independent of editor resolution
(src/lib/print/preflight.ts::effectiveImagePpi).
Confidence    VERIFIED
```

### R16 — Printer profile constants
```text
pdfx4-srgb-packaging-v1 (DEFAULT)
  approval "generic"; standard PDF/X-4; sRGB2014 in and out;
  minimumBleedMm 0; renderPpi 300; minimumImagePpi 200; warningImagePpi 300;
  maximumRasterPixels 100 000 000; pageBoxMode "dieline";
  cut layer  spot "CutContour", CMYK [0,1,0,0], 0.18 mm, overprint
  crease     spot "Crease",     CMYK [0,0.85,0.9,0], 0.18 mm, dash [2.5,1.5]

pdfx4-srgb-3mm-bleed-v1        as above but minimumBleedMm 3,
                               pageBoxMode "rectangular-trim"

vortex-carton-works-coated-offset-v1
  approval "simulated-company" (NOT a real converter);
  output ICC Coated_Fogra39L_VIGC_260 (8 652 444 bytes,
  sha256 8decbce6…3519e, served from public/print-profiles/);
  minimumBleedMm 3; maximumTotalAreaCoveragePercent 260;
  minimumImagePpi 250; line widths 0.15 mm

Rule: `approval` may only leave "simulated-company" after a named converter
signs off a physical proof. Stated in printer-profiles.ts and echoed in
quality-report.json blockingEvidence.
Files         src/lib/print/printer-profiles.ts
Confidence    VERIFIED
```

### R17 — Manufacturing claims are built by filter, never by hand
```text
Behaviour     A production export may assert only claims whose every required
              parameter is "measured", "derived" or "authored" in the product's
              provenance ledger. A parameter that is "assumed" or "unresolved"
              blocks its claim, and the refusal is recorded with its reason.
Claims        production-web-geometry, artwork-region-mapping (scope
              production-output); technical-band-semantics, finished-body-form,
              seal-and-closure-construction (scope preview).
Ledger rules  • Duplicate parameter ids throw.
              • A "derived" record must name ≥1 source, every source must be
                certifiable, and derivation cycles throw. A derived value may
                not launder an assumption.
Enforced in   src/lib/provenance/ledger.ts, claims.ts, resolve-provenance.ts
              src/lib/print/provenance-preflight.ts (folds into the report)
Confidence    VERIFIED
```

### R18 — Embroidery is preview-only and must not reach production
```text
Behaviour     Any image element with treatment.mode "embroidery" fails preflight
              with EMBROIDERY_PRODUCTION_UNSUPPORTED (severity error).
Why           src/lib/embroidery is a visual simulation. DST/PES machine output
              is deliberately unsupported; emitting it would require a real
              digitization plan and physical sew-out evidence.
Confidence    VERIFIED
```

---

## Pricing

### R19 — Pricing is a development estimate and is off in production by default
```text
Behaviour     getPricingService() installs StaticPricingProvider only when
              NODE_ENV !== "production" OR
              VORTEX_ENABLE_DEVELOPMENT_PRICING === "true".
              Otherwise UnavailablePricingProvider returns null for everything
              → 422 PRICING_UNAVAILABLE.
Fixture       The only rule is tshirt@2 / "tshirt@2|" in INR:
              1+ ₹599.00, 10+ ₹499.00, 25+ ₹449.00, 50+ ₹399.00 (minor units),
              pricingVersion "static-development-inr-1", validForSeconds 900.
              kind is always "estimate".
Files         src/server/pricing/container.ts, static-pricing-provider.ts
Confidence    VERIFIED
```

### R20 — Provider results are validated as a contract, and failures are opaque
```text
Behaviour     validateProviderResult() enforces: kind ∈ {estimate,contract};
              currency /^[A-Z]{3}$/; validForSeconds 60..604 800; 1..32 line
              items; unique line codes; label 1..160 chars; quantity ≥ 1;
              non-negative safe-integer minor amounts; and
              amountMinor === quantity * unitAmountMinor exactly.
              Any violation, and any provider throw, becomes
              503 PRICING_PROVIDER_FAILED — deliberately indistinguishable, so a
              caller cannot probe provider internals.
Limits        PRICE_QUOTE_MAX_QUANTITY = 1 000 000
              PRICE_QUOTE_REQUEST_KEY_MAX_LENGTH = 160
Confidence    VERIFIED
```

### R21 — Quotes are immutable snapshots; expiry is computed, not written
```text
status = Date.parse(now) < Date.parse(expiresAt) ? "active" : "expired".
Nothing ever mutates a quote row or deletes an expired one.
Confidence    VERIFIED
```

---

## Templates and bulk personalization

### R22 — A template may only be instantiated onto a matching configuration
```text
compatibilityMatches() requires productId, productVersionId AND configurationId
to match exactly, else TEMPLATE_CONFIGURATION_MISMATCH.
Template artwork is COPIED into project assets and the design's asset ids are
rewritten; the referenced set must equal the supplied set exactly
(TEMPLATE_ASSET_MISMATCH).
Confidence    VERIFIED
```

### R23 — Bulk personalization limits and retention
```text
MAX_PERSONALIZATION_CSV_BYTES     = 5 MiB
MAX_ROWS                          = 10 000   (also a DB CHECK)
MAX_CELL_CHARACTERS               = 2 000
MAX_ISSUES                        = 100      (validation report cap)
MAX_PERSONALIZATION_OUTPUT_BYTES  = 64 MiB
PROGRESS_INTERVAL                 = 25 rows
MAX_CONCURRENT_JOBS               = 2
RETENTION_DAYS                    = 30       (dataset expires_at)
max_attempts                      = 3
Preview rows                      = 0,1,2 only
Idempotency-Key                   = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,127}$/
Confidence    VERIFIED
```

### R24 — Datasets are content-addressed and deduplicated per owner
```text
domain_dataset_id is a hash of the parsed CSV. Re-uploading the same CSV within
the retention window returns the existing dataset instead of creating another.
Confidence    VERIFIED
```

---

## Operator publishing

### R25 — Permission implication lattice
```text
products:publish   ⟹ products:edit, products:validate, products:read
products:edit      ⟹ products:read
products:validate  ⟹ products:read
templates:publish  ⟹ templates:edit, templates:read
templates:edit     ⟹ templates:read
assets:upload and onboarding:run imply nothing.
Enforced in   src/server/operators/operator-authorization-service.ts
              operatorHasPermission()
Confidence    VERIFIED
```

### R26 — Publishing requires a fresh, unchanged, passing validation
```text
Behaviour     publish() refuses unless ALL of:
              • draft.revision === expectedRevision (else
                PRODUCT_DRAFT_REVISION_CONFLICT)
              • draft.status === "validated" and validation.passed
              • validation.draftRevision === expectedRevision
                (else PRODUCT_DRAFT_NOT_VALIDATED)
              It then RE-RUNS evaluate() and compares canonical JSON of the
              comparable report. A difference records the new report and throws
              PRODUCT_DRAFT_REVALIDATION_REQUIRED — publishing never proceeds on
              a stale verdict.
              A draft whose base version is no longer current fails validation
              with PRODUCT_DRAFT_BASE_STALE.
              Re-publishing an already-published draft is idempotent.
Version id    `${productId}@${maxExistingVersion + 1}`
Limits        MAX_DRAFT_BYTES 10 MiB (products), 2 MiB (templates)
Confidence    VERIFIED
```

### R27 — Bootstrap operators bypass the grants table
```text
Behaviour     VORTEX_BOOTSTRAP_OPERATOR_USER_IDS is a comma-separated list of
              authenticated user ids that receive ALL_OPERATOR_PERMISSIONS
              without any operator_grants row.
Caveat        The set is captured ONCE, at OperatorAuthorizationService
              construction (default parameter `configuredBootstrapIds()`), so a
              change requires a restart. There is no UI or API to grant
              operator_grants rows — see KNOWN_RISKS.
Confidence    VERIFIED
```

---

## Rate limits (all fixed-window, all per owner)

| Bucket | Limit | Window | Applied to |
|---|---|---|---|
| `project-mutation` | 120 | 60 s | POST/PATCH/DELETE projects, duplicate, template instantiate |
| `price-quote` | 60 | 60 s | POST quotes |
| `preview-generation` | 30 | 60 s | POST project preview |
| `production-preflight` | 30 | 60 s | POST preflight |
| `production-generation` | 10 | 60 s | POST production artifacts |
| `asset-upload` | 20 | 60 s | POST project assets |
| `personalization-dataset` | 20 | 60 s | POST datasets |
| `personalization-job` | 20 | 60 s | POST personalization jobs |
| `project-claim` | 10 | 60 s | POST session claim (keyed on the USER) |

Key format `bucket:ownerType:ownerId`. Exceeding it throws `PlatformError
RATE_LIMITED` → HTTP 429 with `details.retryAfterSeconds`. **No `Retry-After`
header is set** — the value is only in the JSON body.
**No admin route is rate limited.** **No GET route is rate limited.**

---

## Upload and request limits

| Limit | Value | Where |
|---|---|---|
| JSON body | 5 MiB | `MAX_JSON_BYTES`, `readJson()` |
| Artwork upload | 20 MiB / 40 MP | `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_PIXELS` |
| Template asset | same as artwork | `MAX_UPLOAD_BYTES` |
| Production font | 10 MiB | `MAX_PRODUCTION_FONT_BYTES` |
| Onboarding GLB | 64 MiB | `MAX_GLB_BYTES` |
| Onboarding manifest | 1 MiB | `MAX_MANIFEST_BYTES` |
| Onboarding per-output | 64 MiB | `MAX_OUTPUT_ASSET_BYTES` |
| Onboarding total output | 160 MiB | `MAX_TOTAL_OUTPUT_BYTES` |
| Subprocess stdout/stderr kept | 256 KiB | `MAX_PROCESS_OUTPUT_BYTES` |
| Product draft document | 10 MiB | `MAX_DRAFT_BYTES` |
| Template draft document | 2 MiB | `MAX_DRAFT_BYTES` (templates) |
| Preview longest edge | 720 px | `MAX_PREVIEW_EDGE` |
| Server render source image | 40 MP | `MAX_SOURCE_IMAGE_PIXELS` |

---

## Structural-engine rules

### R28 — The dieline is the geometric authority
```text
Rule          Never author a second, separately maintained shape for the 3D
              model. Flat 3D must reproduce the source exactly.
Gate          measureFlatPanelEquivalence() produces a FlatEquivalenceReport
              with bidirectional Hausdorff, area, perimeter and hole metrics;
              structural-acceptance.ts turns those into pass/fail gates.
Tolerances    DEFAULT_STRUCTURAL_TOLERANCES (src/lib/structure/vector-domain.ts)
                coordinateEpsilonMm     1e-9   (float equality ONLY)
                topologySnapMm          0.01   (max automatic endpoint repair)
                curveFlatteningMm       0.05   (max chord deviation)
                boundaryComparisonMm    0.05   (max accepted source/derived delta)
                metricSampleSpacingMm   0.05
                maxSubdivisionDepth     32
Measured      On the reference carton the flat 3D boundary matches its source to
              4.5e-13 mm (quality-report.json gate G2).
Confidence    VERIFIED
```

### R29 — Fail closed on unknown construction
```text
Rule          Never silently guess a hidden construction fact. Reference-derived
              estimates must be explicitly labelled and must never be presented
              as manufacturer certification.
Evidence      quality-report.json: manufacturingConstructionCertified = false;
              G9 "SOURCE_LOCKED_RIG_REFERENCE_RECREATION_ESTIMATES_NOT_
              MANUFACTURER_CERTIFIED"; diagonalLockPolicy
              "0deg_REFERENCE_RECREATION_ONLY_UNTIL_CONVERTER_EVIDENCE".
Confidence    VERIFIED
```

### R30 — Canonical coordinate and UV conventions
```text
Units         millimetres, always.
Sheet space   x increases rightward, y increases DOWNWARD ("x-right-y-down").
Angles        x = cx + r·cos θ, y = cy + r·sin θ, so a positive sweep appears
              CLOCKWISE on the sheet.
Panel UV      sheetUv(p) = [p.x / widthMm, 1 - p.y / heightMm].
              u maps STRAIGHT THROUGH — unlike the legacy carton builder, whose
              geometry already bakes in the physical sheet flip and whose toUv
              inverts u. Inverting u here would mirror artwork on every
              assembled panel.
Regression    tests/structure/structural-chirality.test.ts
Confidence    VERIFIED
```

### R31 — Camera is independent of fold state
```text
Fold logic never owns or mutates camera/orbit state.
Regression    tests/unfold/camera-independence.test.ts
Confidence    VERIFIED (stated in AGENTS.md and covered by a test)
```

### R32 — Unfold stage is an integer index, recomputed not accumulated
```text
UnfoldState = { stage: number }. unfoldReducer clamps to [0, stepCount]. The
pose at any stage is a pure function of the plan
(anglesAtStage), so an in-flight animation cannot corrupt state.
Motion        DEFAULT_HINGE_DURATION_MS 575, DEFAULT_HINGE_STAGGER_MS 90,
              easing "easeInOutCubic", SETTLE_DEG 1e-4.
              DEFAULT_STRUCTURAL_HINGE_MOTION (structural rig): delay 0,
              duration 550, easeInOutCubic. HINGE_TAU = 0.16 is a legacy export
              that timed motion no longer uses.
Confidence    VERIFIED
```

---

## Quality-record consistency (a rule about the repository itself)

```text
Rule          quality-report.json, QUALITY_STATE.md and quality-run-log.md must
              never contradict each other, and CI success alone must never flip
              them to PASS.
Enforced in   tests/platform/quality-record-consistency.test.ts — the build
              fails if the three disagree.
Stated in     AGENTS.md, README.md
Confidence    VERIFIED
```
