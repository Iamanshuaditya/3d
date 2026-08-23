# Design templates and personalization

Status: planned P2 boundary; no template browser or public template API is represented as complete.

Templates will store editable `DesignDocument` content and stable asset references. Instantiation creates a normal project document; there will be no parallel template renderer.

The planned domain includes:

- template ID/version/name/status;
- compatible product definition/version/configuration constraints;
- category, subcategory, tags, style, industry, occasion, color, language;
- preview asset;
- source design document;
- explicit placeholder definitions and bindings.

Semantic content will be represented by an explicit binding on text/image elements rather than parsing arbitrary `{{strings}}` throughout renderers. Manual edits will use an intentional detach-or-update command so binding behavior is auditable.

Personalization data will be a structured, validated value layer. Bulk CSV rows will create variant inputs referencing the same template version; they will not mutate the template or require a separate design engine.

Security and versioning requirements:

- template assets must be owned by the platform/template scope;
- instantiation copies or grants stable references intentionally;
- published template versions are immutable;
- customer projects remain reproducible if a template is later edited;
- CSV parsing and field mappings are bounded and validated server-side.
