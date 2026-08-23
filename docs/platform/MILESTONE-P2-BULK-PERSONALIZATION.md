# Milestone P2.6 — bounded bulk personalization

Date: 2026-08-24

## 1. Existing-system discovery

Templates already carried explicit text bindings, placeholder definitions, defaults, and immutable version/configuration compatibility. `applyPersonalization()` already wrote semantic values into the normal text property consumed by 2D, Three.js textures, previews, and production. `PersonalizationDataset` and `PersonalizedTemplateVariant` were only skeletal types; CSV parsing, mapping, validation reports, and variant materialization did not exist.

## 2. Architecture chosen

- CSV import is a bounded server utility, not a React parser.
- Source columns either match semantic placeholder keys or use an explicit map; `null` explicitly ignores a column.
- All cells remain plain text and nested objects are built only from validated field keys.
- Every row merges template defaults and passes the existing placeholder validator.
- Any error rejects the whole dataset; reports retain source row/field context and bounded detail counts.
- Successful datasets bind to one immutable template version and have deterministic checksum-based IDs.
- One dataset row materializes through existing `applyPersonalization()` into a normal `DesignDocument`.
- Variant generation is lazy so a future worker can stream large batches.

This establishes the bulk domain without pretending an in-process iterator is a durable high-scale job platform.

## 3. Files added or changed

- `src/platform/templates/types.ts`
- `src/server/templates/personalization-dataset.ts`
- `tests/platform/bulk-personalization.test.ts`
- `docs/platform/TEMPLATES.md`
- `docs/platform/API.md`
- `docs/platform/ARCHITECTURE.md`
- `docs/platform/MILESTONE-P2-BULK-PERSONALIZATION.md`

## 4. Working end to end

- strict UTF-8 decoding and BOM handling;
- quoted commas, escaped quotes, CRLF, and multiline quoted cells;
- automatic semantic headers or explicit mapping/ignore;
- mapping and row-width validation;
- required/max-length validation through existing placeholders;
- 5 MB / 256-column / 10,000-row / 2,000-character bounds;
- bounded issue details with accurate total count;
- deterministic dataset and variant IDs;
- lazy variant documents using the same design/render path;
- template-version and row-index mismatch rejection.

## 5. Verification

- focused bulk/template suite: 14/14 passed.
- complete Node suite: 131/131 passed.
- ESLint: passed.
- strict TypeScript: passed.
- optimized Next.js production build: passed.

## 6. Remaining limitations and risks

- No dataset or generated-variant persistence exists.
- No customer CSV upload endpoint is exposed; personal data needs explicit retention, encryption, deletion, and access policies first.
- No job progress, cancellation, retries, concurrency budget, or downloadable output bundle exists.
- Variants are documents, not automatically created projects or production artifacts.
- Placeholder values remain text-only; image/asset bindings need a separate owned-asset workflow.
- CSV formula-looking text is inert in Vortex, but any future spreadsheet re-export must defend against formula injection.

## 7. Next highest-value milestone

Design the owner-scoped dataset and background-job lifecycle (including retention/deletion) before exposing uploads. A first worker can stream lazy variants into previews or projects with explicit limits; it should not generate production PDFs synchronously in the upload request.
