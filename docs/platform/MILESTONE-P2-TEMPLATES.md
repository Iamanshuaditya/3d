# P2 milestone report — editable templates and personalization

Date: 2026-08-23

Branch: `feat/vortex-platform-p0-projects`

Baseline: `main` at `c88b3fd`

## 1. What the repository already provided

The existing `DesignDocument` already expressed editable text/image layers over measured product surfaces and already drove 2D, Three.js textures, previews, embroidery treatment, and print. There was no customer template domain, immutable template catalogue, semantic field binding, taxonomy/search, template preview endpoint, or template-to-project workflow. Product P1 had introduced the exact version/configuration identity required to add templates without making historical projects drift.

The correct boundary was therefore a parameterized `DesignDocument`, not a flattened preview or a separate template renderer.

## 2. Architecture chosen

- `DesignTemplateDefinition` holds catalogue identity/lifecycle metadata.
- Immutable `DesignTemplateVersion` stores editable design content, taxonomy, placeholders, defaults, assets declared by stable ID, and one or more exact product-version/configuration compatibility entries.
- Text elements carry explicit `binding: { type: "field", key, fallback }`; renderers still consume their ordinary `text` property.
- Bounded `PersonalizationData` is merged and materialized once when a template becomes a normal project.
- Manual content editing intentionally detaches its binding.
- SQLite schema v4 stores checksummed immutable template versions and project provenance.
- `TemplateService` re-resolves product configuration server-side, validates compatibility/placeholders/surfaces, and creates an owner-scoped idempotent project through `ProjectService`.
- The existing server preview renderer was generalized to render both projects and templates from the same document.

Template compatibility is exact rather than “current product”: a published template names `productVersionId`, deterministic `configurationId`, and the selection reproducing it. Multiple versions/configurations require multiple explicit entries.

## 3. Exact implementation areas

Domain and fixtures:

- `src/platform/templates/types.ts`
- `src/platform/templates/personalization.ts`
- `src/platform/templates/repository.ts`
- `src/platform/templates/errors.ts`
- `src/lib/templates/fixtures.ts`
- `src/types/configurator.ts`
- `src/platform/projects/design-document.ts`

Persistence and services:

- `src/server/persistence/database.ts`
- `src/server/persistence/canonical-json.ts`
- `src/server/templates/*`
- `src/server/projects/project-service.ts`
- `src/server/projects/project-preview.ts`
- `src/server/persistence/sqlite-project-repository.ts`
- `src/platform/projects/types.ts`

Versioned API:

- `src/app/api/v1/templates/route.ts`
- `src/app/api/v1/templates/[templateId]/route.ts`
- `src/app/api/v1/templates/[templateId]/preview/route.ts`
- `src/app/api/v1/templates/[templateId]/instantiate/route.ts`
- `src/server/http/api.ts`

Customer UI and navigation:

- `src/app/templates/page.tsx`
- `src/components/templates/TemplateBrowser.tsx`
- `src/lib/templates/client.ts`
- `src/components/gallery/ProductCard.tsx`
- `src/components/studio/StudioPanel.tsx`
- `src/lib/projects/location.ts`
- `src/lib/projects/use-project-session.ts`
- `src/components/projects/ProjectLibrary.tsx`

Tests:

- `tests/platform/template-system.test.ts`
- `tests/platform/project-persistence.test.ts`

## 4. Working end to end

- Product Library opens a Blank-or-Template starting point.
- T-shirt, Mailer Box, and Bottle publish template-capable v2 product snapshots without mutating v1.
- Three editable text/background fixtures cover garment, structural packaging, and wrapped-label families.
- Customers can search/filter compatible templates, edit semantic input fields, and instantiate a revision-1 project.
- Template text remains ordinary editable Studio layers and drives the existing 3D texture path.
- Autosave, previews, duplication, archive, ownership, historical product resolution, and library resume work unchanged.
- A project records its source template version but does not depend on live template state after creation.
- Template versions/previews are immutable; a v2 publication cannot mutate an existing v1-derived project.
- The exact blank link also preserves product version and option selection.

## 5. Verification

- `npm run check`: passed.
- ESLint: passed.
- TypeScript: passed.
- Node test suite: 97 passed, 0 failed.
- Production Next.js build: passed; all four `/api/v1/templates` route families plus `/templates` are present.
- Chrome on localhost:8082:
  - loaded `Team Launch` with a real PNG preview and semantic Company/Tagline inputs;
  - instantiated `team-launch-shirt@1` against exact `tshirt@2`;
  - confirmed personalized text layers and live 3D preview;
  - confirmed `Saved`, edited bound content manually, and saw the binding notice disappear;
  - confirmed autosave created revision 2;
  - fully reloaded and restored the manual text on the exact historical product URL.

Existing Three.js `Clock`/`PCFSoftShadowMap` deprecation warnings remain unrelated and pre-existing.

## 6. Remaining limits and risks

- Reusable template artwork is not enabled. The schema validates declared stable assets, but instantiation/preview deliberately reject image-backed templates until a platform-owned template asset scope and copy/grant adapter exist.
- Bulk CSV types define the domain seam only; parsing, mapping UI, validation reports, job scheduling, and batch rendering are not implemented.
- Placeholder application currently targets text. Semantic image replacement needs an explicit binding/asset workflow rather than URL substitution.
- There is no template admin/publishing UI; checked code fixtures seed the same immutable repository used by future admin tooling.
- Search/filter is sufficient for the initial catalogue, not a ranked full-text service.
- SQLite/local filesystem remain single-node development adapters.

## 7. Next highest-value milestone

P3: formalize page versus surface semantics, make product presentation modes drive Studio layout, and add a chrome-free Preview experience that reads the same project document. A representative flat front/back product should be onboarded rather than pretending every surface is packaging or every page is a mesh.
