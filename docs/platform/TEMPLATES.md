# Design templates and personalization

Status: P2 editable templates, immutable versions, exact product compatibility, semantic text bindings, template previews, browsing, and project instantiation are implemented. Platform-owned image assets and bulk CSV rendering remain later work.

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

`PersonalizationDataset` and `PersonalizedTemplateVariant` define the bulk-personalization boundary. CSV parsing, field mapping, validation reports, and high-scale variant rendering are not implemented yet.

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
