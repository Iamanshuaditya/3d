# Design projects and artwork

## Domain

`DesignProject` binds a design to an immutable product version, deterministic resolved configuration, and owner. It records `productVersionId`, `configurationId`, the validated `optionSelection`, optional `sourceTemplateVersionId` provenance, a monotonic revision, lifecycle status, preview reference, and timestamps. Artwork metadata is stored separately as `ProjectAsset`; image elements carry `assetId` plus an optional runtime `src`.

The persisted document never stores runtime `blob:` or authorized read URLs. `ProjectService.open()` hydrates a read URL for the current owner, and renderers continue consuming `src` without owning persistence concerns.

## Create and reopen

Opening Studio without a `project` query parameter creates a project and replaces the URL with:

```text
/studio?product=<productId>&project=<opaque-project-id>&version=<product-version>
```

When options exist, the URL also carries the validated selection so the server can render the exact engine configuration before the client editor mounts. The owner-authorized project record remains authoritative; an incomplete historical URL self-corrects to the saved version and selection.

Creation accepts an owner-scoped `clientRequestId`. Repeating a request—including React Strict Mode effects or a network retry—returns the existing project instead of creating an orphan. Reusing that key for a different resolved configuration fails.

Template instantiation uses the same creation path after server-side exact-version compatibility, placeholder, and surface validation. The resulting project is independent customer state: later template publication cannot mutate it. Its source version is retained only for audit/provenance and survives duplication.

Opening an existing project requires both the project ID and matching owner identity. A different guest receives the same not-found response as an unknown project.

## Artwork lifecycle

1. Studio uploads bytes before adding an image element.
2. The server verifies length, fully decodes PNG/JPEG/WebP, rejects animation, and enforces 20 MB/40 MP limits.
3. The object store writes bytes under a generated key.
4. SQLite stores filename, actual MIME type, dimensions, byte size, SHA-256, and storage key.
5. Studio adds an image element with the returned stable `assetId`.
6. Save canonicalizes image metadata from the asset row and strips runtime `src`.
7. Reopen hydrates a new owner-authorized `src` from `assetId`.

The storage key is server-only. Original filenames never determine filesystem paths.

## Revisions and autosave

Project revision 1 is the initial document. Every successful update performs a compare-and-swap against `expectedRevision`, updates the current row, and inserts the same document into `project_revisions` in one SQLite transaction.

Studio behavior:

- Transient drag/slider frames stay local.
- A committed edit increments a client commit sequence.
- The newest committed document is queued with a 700 ms debounce.
- Only one save is in flight at once.
- A newer commit queued during an in-flight request is sent afterward.
- A stale server revision returns 409 and cannot overwrite newer data.
- Navigation awaits pending persistence and stays on the page if saving fails.
- `beforeunload` warns while work is pending.
- Online/offline events drive visible save state and retry.

Visible states are `Opening project…`, `Saved`, `Saving…`, `Unsaved changes`, `Save failed`, and `Offline`.

## Guest ownership and claim

The default adapter issues a random signed guest identity. `AuthenticationProvider` is the seam for a future real auth system. After a successful login, that adapter can call `ProjectService.claimGuestProjects(guest, user)`; ownership changes without rewriting designs or assets.

Claiming is not exposed as an unauthenticated public endpoint.

## Library, duplicate, archive, and previews

`/designs` lists only the active owner's non-archived projects. Continue links include product, version, option selection, and project IDs. Duplicate preserves the exact product configuration, copies artwork bytes, allocates new asset IDs, rewrites all references, and starts an independent revision history. Archive is a soft lifecycle transition and hides the project from normal lists.

Save validation and preview generation resolve the project's stored version, never the current catalogue version. Publishing v2 therefore cannot alter a v1 project's surfaces or preview.

Previews are regenerable server-side PNG caches. They do not change project revision. Studio schedules preview generation after saves; the library repairs missing previews in the background.

## Legacy local save migration

The former localStorage format only contained text because image object URLs were deliberately removed. On the first new project for a product, `useProjectSession` attempts a one-time import of that text-only document. It removes the legacy value only after a successful server save. There is no artwork to migrate from that format.

## Proven persistence contract

Automated tests create a T-shirt project, upload decoded artwork, place/scale/rotate it, apply embroidery settings, persist revision 2, reopen from SQLite/object storage, and verify:

- stable artwork identity and readable bytes;
- exact transforms and opacity;
- exact embroidery treatment;
- server-canonical dimensions and MIME type;
- no runtime URL in the immutable revision;
- a newly hydrated URL in the reopened DTO;
- guest isolation.

Versioning tests additionally prove that a v1 project remains editable after a structurally different v2 is published, while new projects receive v2. A schema migration test proves P0/v2-database projects reopen through the explicit `@legacy-v1` adapter.

Template tests prove idempotent personalized creation, immutable template versions, provenance-preserving duplication, intentional binding detach, and text persistence after reopen. The Chrome workflow additionally verified template selection → normal project → autosave revision 2 → full reload on `tshirt@2`.
