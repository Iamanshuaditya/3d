# Design templates and personalization

Status: P2 editable templates, immutable versions, exact product compatibility, semantic text bindings, template previews, browsing, project instantiation, and the bounded bulk-CSV/variant domain are implemented. Platform-owned image assets, dataset persistence/API, and background bulk rendering remain later work.

## Domain and invariants

A `DesignTemplateVersion` contains a real editable `DesignDocument`; it is not a flattened PNG and it does not use a second rendering engine. Instantiation materializes personalization into that document and creates an ordinary revision-1 `DesignProject`.

Published compatibility is exact:

- `productId`;
- immutable `productVersionId`;
- deterministic `configurationId`;
- the validated `optionSelection` that reproduces that configuration.

A template can support more than one configuration by declaring multiple exact entries. It cannot silently float to a newer product version. The catalogue validates that every declared configuration resolves and that its editable-surface contract exactly matches the template document.

Template definitions and immutable versions live in SQLite schema v4. Re-publishing identical bytes is idempotent; changing bytes under an existing version id fails. Existing customer projects retain `sourceTemplateVersionId` as provenance and never read live template content after creation.

## Semantic bindings

Text elements may carry explicit metadata:

```ts
binding: {
  type: "field";
  key: "company.name";
  fallback?: string;
}
```

No renderer parses magic `{{tokens}}`. `applyPersonalization()` writes the resolved scalar into the normal `text` field while preserving the binding metadata, so the existing 2D editor, Three.js canvas texture, preview renderer, and future production path all consume the same content.

Personalization input is a bounded nested scalar object: at most 8 levels, 256 fields, 2,000 characters per value, validated field names, finite numbers, and no arrays. Placeholder definitions enforce required values and field-specific maximum lengths.

Manual Studio edits intentionally detach a binding. The edited text remains normal customer content and survives autosave/reopen; a future “update personalization” command cannot unexpectedly overwrite it.

## Bulk CSV personalization

`importPersonalizationCsv()` accepts UTF-8 CSV plus an optional explicit source-column mapping. Without a mapping, headers must already be semantic field keys such as `company.name`. With a mapping, every source column must map to a declared template placeholder or be explicitly set to `null` (ignored). Unknown, duplicated, missing, unused, or ambiguous mappings fail the whole import.

The importer supports quoted commas, escaped quotes, CRLF, multiline quoted values, and UTF-8 BOM. It trims outer cell whitespace and treats every cell as plain text; spreadsheet-looking input such as `=HYPERLINK(...)` is never evaluated. Bounds are 5 MB, 256 columns, 10,000 nonblank data rows, 2,000 characters per cell, and 100 retained validation issues. The report still records the full issue count when details are truncated.

Each row is merged with template defaults, validated against required/max-length placeholder definitions, and nested through the explicit binding keys. Import is all-or-nothing: any structural, mapping, or row error yields no dataset. A successful `PersonalizationDataset` is tied to an immutable `templateVersionId`, carries a SHA-256 checksum and deterministic ID, and retains physical CSV row numbers for operator feedback.

`personalizedTemplateVariant()` materializes one row into the same normal `DesignDocument` used everywhere else. Variant IDs are deterministic. `personalizedTemplateVariants()` is lazy, so a background job can stream a 10,000-row dataset without holding 10,000 copied documents at once. No alternate template renderer was introduced.

CSV bytes and row values are currently processed in memory and are neither persisted nor logged. An owner-scoped dataset/job API needs a privacy/retention policy, encrypted durable storage, cancellation/progress, and output lifecycle before customer upload is exposed.

## Catalogue and customer flow

`/templates?product=<id>` resolves the current immutable product configuration, then shows:

- an exact-version Blank Design link;
- current compatible template previews;
- client-side search and category filters;
- fields generated from explicit placeholder definitions.

Instantiation is owner scoped, same-origin protected, rate limited, and idempotent through `clientRequestId`. It resolves the product again server-side, checks exact compatibility, merges validated defaults and customer values, validates the document/surfaces, and creates a project. Browser-provided compatibility or product-ready claims are never trusted.

Three text-only fixtures prove distinct product families:

- Team Launch — T-shirt/garment;
- Minimal Mailer — structural packaging;
- Botanical Label — wrapped bottle label.

Preview PNGs are rendered server-side from the same template document and product configuration. Version-addressed preview URLs are immutable-cacheable.

## Asset limitation

The domain already declares `assetIds`, and catalogue validation requires image references to match that declaration exactly. Instantiation currently rejects image-backed templates with `TEMPLATE_ASSET_CLONING_REQUIRED`; preview generation likewise rejects them without a template-asset resolver. This is deliberate: customer project assets are owner-scoped, while reusable template artwork needs a separate platform-owned asset scope plus intentional copy/grant semantics. The current fixtures therefore contain editable text and backgrounds only.

Do not bypass this guard by embedding filesystem paths, public provider credentials, object URLs, or arbitrary remote image URLs in template documents.

Bulk CSV import, explicit mapping, validation reporting, and lazy document variants are implemented; owner-scoped dataset persistence, upload API, background rendering, cancellation, and output packaging are not. Placeholder values remain text-only; image placeholders require the separate owned-asset workflow above.
