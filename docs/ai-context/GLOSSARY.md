# Glossary

Repository-specific vocabulary. Domain terms first, then platform terms, then
status values.

---

## Packaging and structural domain

**Dieline** — the flat production plan a factory cuts, creases and folds.
Supplied as PDF, SVG or DXF. In Vortex it is *the single geometric authority*:
the 2D editor, the 3D model, artwork mapping and print output are all derived
from it. Nothing may author a second, separately maintained shape.

**Canonical dieline** (`CanonicalDieline`, `schemaVersion: 2`) — the normalised
in-memory form: millimetres, `x-right-y-down` coordinates, a list of
`StructuralEntity` values each carrying an operation, a path and provenance.
Defined in `src/lib/structure/vector-domain.ts`.

**Structural operation** — what a line on the dieline *means*:
`cut`, `crease`, `perforation`, `score`, `half-cut`, `window-cut`, `bleed`,
`safe`, `glue` (core), plus finishing operations `varnish`, `foil`, `emboss`,
`white-ink`, plus namespaced `custom:*`.

**Panel** — a face of the finished carton. Derived by finding closed cycles of
cut edges in the planar graph (`extractStructuralPanels`). The golden reference
carton yields **17 panels**.

**Hinge** — a crease that two panels rotate about. A `StructuralHingeDefinition`
binds a parent panel, a child panel, one or more durable *source addresses*
(entity id + path id, optionally exact flattened segment spans) and an assembled
angle. The golden reference has **16 physical hinge roles**.

**Rig** — the resolved hinge graph plus panel tree that the 3D scene animates
(`resolveStructuralRig`).

**Fold / unfold plan** — an ordered, dependency-aware sequence of hinge target
angles. Either **authored** (a `spec.unfold` sequence, because construction order
is a manufacturing fact) or **derived** from tree topology as a fallback.

**Stage** — an integer index into an unfold plan. Stage 0 is the assembled pose;
stage N is the pose after N steps. The pose is always recomputed from the plan,
never accumulated.

**Flat pose / flat equivalence** — the fully unfolded 3D geometry. The
north-star invariant is that it reproduces the source dieline exactly;
`measureFlatPanelEquivalence()` measures bidirectional Hausdorff distance, area,
perimeter and hole geometry, and `structural-acceptance.ts` turns that into gates.
Measured delta on the reference carton: **4.5e-13 mm**.

**Chirality / handedness** — which way round a panel and its artwork face.
Decided by measurement on the assembled rig, then locked with a regression test
confirmed to fail against the old behaviour. Never inferred.

**Sheet UV** — `[x / widthMm, 1 - y / heightMm]`. `u` maps straight through for
structural panels, unlike the legacy carton builder whose geometry already bakes
in the physical sheet flip.

**Lock bottom** — a carton base construction with interlocking diagonal folds.
The golden reference is a "Lock Bottom and top incl. window" carton at
300 × 150 × 200 mm. Its hidden diagonal signs are one of the facts the engine
refuses to guess.

**Body tube** — the four-panel wrap forming the carton's sides
(`golden-body-tube.ts`, certified at 200 × 150 mm).

**Window / window-cut** — a physical void in a panel (e.g. a clear window). It is
real geometry with real hole boundaries, not a printed decoration.

**Production web** — the continuous material a flexible pouch is printed on:
width, repeat, lane count, segment boundaries, printable regions, technical bands.

**Technical band** — a non-printing region of the web reserved for a converting
operation (seal, notch, zipper). Its meaning must be measured, not assumed.

**CartonSpec / PouchSpec / FlatSheetSpec** — the three product structure kinds a
`ProductConfig` may carry. See `src/types/carton.ts`, `pouch.ts`, and
`src/lib/configurator/*-spec.ts`.

**Dieline overlay / guides** — bleed and safe-area guides shown in the editor.
They must never leak into exported artwork (`tests/qa/export-guide-leak.test.ts`).

---

## Provenance vocabulary (`src/types/provenance.ts`)

**Ledger** — the record of where each manufacturing parameter's value came from,
for one product. Every construction gets one; a product with nothing to declare
must be distinguishable from one whose declarations were forgotten.

**Parameter provenance** — one of five standings:

| Value | Meaning | Certifiable? |
|---|---|---|
| `measured` | Read from the production source file itself | yes |
| `derived` | Computed from other certifiable parameters | yes |
| `authored` | Deliberately specified by the product definition | yes |
| `assumed` | Exists only to make the 3D preview convincing | **no** |
| `unresolved` | Observed, but its manufacturing meaning is still open | **no** |

A `derived` record must name at least one source, every source must itself be
certifiable, and cycles throw. This is what stops a preview assumption
re-entering the ledger wearing a certifiable label.

**Claim** — an assertion a production export would make (`PACKAGING_CLAIMS`).
A claim is **supported** only when every parameter it requires is certifiable;
otherwise it is **refused** and the reason is recorded. Claims are built by
filter, never by hand.

**Certified claim metadata** — the filtered result embedded in a preflight report
(`CertifiedClaimMetadata`).

---

## Certification and quality vocabulary

**Golden reference** — the single authorized private production PDF used as the
benchmark. Never committed; locked by SHA-256 in `fixtures/`; supplied locally
via `VORTEX_GOLDEN_REFERENCE_PDF`.

**Reference recreation** — the lane that proves the engine can rebuild the golden
carton. Currently **CERTIFIED at 45/50 with all ten hard gates true**.

**Manufacturing construction certification** — a *different, stricter* lane
requiring converter evidence (board caliper, glue and tuck destinations, hidden
diagonal signs). Currently **false, and not obtainable from this repository**.
Never conflate the two.

**Hard gate** — one of G1–G12 in `quality-report.json`. Examples: G2
`flat3dEqualsSource`, G4 `noMirroredArtwork`, G8 `repeatedFoldNoDrift`
(a 100-cycle certificate), G10 `noSilentUnknownGeometryGuess`.

**Quality record** — the trio `quality-report.json` (machine),
`QUALITY_STATE.md` (human) and `quality-run-log.md` (append-only history).
A test fails the build if they contradict each other. CI green alone must never
flip them to PASS.

**Blocking evidence** — the external facts, listed in `quality-report.json`, that
no amount of code can supply.

**Fail closed** — the project's governing habit: refuse rather than guess.
Unknown geometry, an unsupported database, a missing secret, an unregistered
embed origin, an unsupported deployment mode — all refuse.

---

## Platform vocabulary

**ProjectOwner** — `{type:"guest"|"user", id}`. The only tenancy boundary. Every
customer-facing query includes it.

**Guest identity** — a signed, HTTP-only cookie (`vortex_guest`) holding
`uuid.HMAC(uuid)`. Not a session; just a durable anonymous owner id.

**Claiming** — transferring everything a guest owns to a signed-in user
(`POST /api/v1/session/claim`). A claimed guest id is retired permanently.

**DesignDocument** — the customer's design: `{productId, surfaces:{[id]:
{background, elements[]}}, personalization?}`. Elements are `image` or `text`.
It is the *only* customer-design source of truth; 3D, previews, personalization
and production all derive from it.

**Surface / EditableSurface** — one printable face of a product. A design's
surface id set must equal the product version's exactly.

**Revision** — a monotonically increasing integer on a project. Every successful
save writes a new immutable `project_revisions` row via compare-and-swap.

**ProductVersion** — an immutable, checksum-locked published snapshot of a
product definition plus its resolution spec. Id format `productId@n`.

**OptionSelection** — `Record<string, string|number|boolean>` chosen by the
customer.

**configurationId** — `` `${productVersionId}|${key}=${type}:${value}&…` `` with
sorted keys and type tags `s:`/`n:`/`b:`. The identity of one exact product
configuration; used to match templates, quotes and artifacts. Treat it as a wire
format.

**productionValue** — the value a resolver actually receives, after unit
conversion (inches and centimetres become millimetres) and any declared
`productionValue` mapping on a select choice or boolean.

**Resolution spec** — how a version becomes a `ProductConfig`: `static`
(a stored config) or `provider` (a registered
`ProductConfigurationProvider`, e.g. `mailer-box-0427-v1`).

**ProductConfig** — the engine-facing runtime shape consumed by the Studio,
three.js, unfolding and the exporters.

**Preflight** — the gate a design must pass before production output. Produces a
`PreflightReport` with `passed`, `issues[]` (error/warning/info), `checks[]` and
optional `provenance`.

**Production artifact** — an immutable PDF/X-4 or manufacturing SVG bound to
`(project, revision, kind)`.

**Printer profile** — a reusable press contract: ICC profiles, bleed minimum,
PPI thresholds, raster budget, page-box mode and the cut/crease technical layer
definitions. `approval` is `generic`, `simulated-company` or `factory-approved`.

**Template** — a published, versioned starting design with placeholder
definitions. Instantiating one creates a normal project and copies the template's
artwork into project assets.

**Placeholder / personalization** — named fields a template exposes; a text
element may bind to one (`binding: {type:"field", key, fallback?}`).

**Dataset** — a validated CSV of personalization rows, content-addressed and
expiring after 30 days.

**Variant** — one personalized `DesignDocument` produced from a template plus one
dataset row. Bulk output is NDJSON of variants.

**Operator** — an authenticated user holding operator grants. Distinct from a
customer; there is no shared role table.

**Draft** — an editable, revisioned candidate for a product or template version.
Lifecycle `draft → validated → published`.

**Onboarding** — the Python pipeline that turns an arbitrary GLB into a
customizable product. Stages: `inspect`, `build`, `validate`, `integrate`.

**Embed client** — a manufacturer registered in `VORTEX_EMBED_CLIENTS`, with
exact allowed origins, a product subset, a theme, feature flags and a completion
mode.

**CHIPS** — Cookies Having Independent Partitioned State. The embedded guest
cookie is `SameSite=None; Secure; Partitioned` so each host site gets its own
cookie jar.

**Container** — a `src/server/<domain>/container.ts` module exporting lazy
process singletons. The only composition root.

**Boundary** — one of `withOwner`, `withPublicApi`, `withAdminApi` in
`src/server/http/api.ts`.

**Storage key** — an object-store path such as
`projects/<projectId>/<assetId>.png`. Server-only; never in a DTO.

---

## Status values, in one place

| Entity | Values |
|---|---|
| `DesignProject.status` | `draft`, `ready_for_preflight`, `production_ready`, `archived` |
| `ProjectSaveState` (client) | `loading`, `saved`, `saving`, `unsaved`, `failed`, `offline` |
| `ProductDefinition.status` | `draft`, `published` |
| `ProductDefinition.visibility` | `public`, `unlisted` |
| `ProductDraft` / `TemplateDraft` | `draft`, `validated`, `published` |
| `PersonalizationJob.status` | `queued`, `running`, `completed`, `failed`, `cancelled` |
| `OnboardingJob.status` | `queued`, `running`, `passed`, `failed`, `cancelled`¹ |
| `BackgroundJob.status` | `queued`, `running`, `succeeded`, `failed`, `abandoned`² |
| `ProductionArtifact.kind` | `pdf`, `svg` |
| `PreflightIssue.severity` | `error`, `warning`, `info` |
| `PriceQuote.kind` | `estimate`, `contract` |
| `PriceQuote.status` (computed) | `active`, `expired` |
| `EmbedClient.status` | `active`, `disabled` |
| `EmbedCompletion.mode` | `save`, `quote`, `inquiry` |
| `ParameterProvenance` | `measured`, `derived`, `authored`, `assumed`, `unresolved` |
| `PrinterProfile.approval` | `generic`, `simulated-company`, `factory-approved` |
| `ProductPresentationMode` | `2d-first`, `2d-3d-split`, `packaging`, `garment` |

¹ `cancelled` is declared but no code path reaches it.
² Nothing in production code drives this machine.

---

## Naming conventions worth knowing

- `#24`, `#25`, `#26`, `#27` in file-header comments are GitHub issue numbers:
  **#24** manufacturing provenance, **#25** shared coordination (rate limits,
  jobs, PostgreSQL), **#26** deployment, **#27** the embed contract. Grepping an
  issue number is a fast way to find every file in a feature.
- `sqlite-*-repository.ts` — the SQLite adapter for a `src/platform` interface.
- `*-service.ts` — orchestration; `*-container.ts` — composition.
- `golden-*` — the reference-recreation lane.
- `*-dto.ts` — shaping domain objects for a transport boundary.
- `Dto` suffix on a type means "safe to serialize to a client".
- `legacy*` / `@legacy-v1` — the pre-versioning product compatibility path.
- `Pacdora` — a competitor product name, used only for the `/test` research
  prototype (`src/lib/pacdora-lab`, `pacdora.md`).
