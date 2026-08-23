# Product domain

Status: the existing `ProductConfig` registry remains the resolved-product contract. The higher-level option/version domain is the next milestone and is not yet production implemented.

## Current resolved contract

`src/types/configurator.ts` and `src/lib/configurator/product-config.ts` describe everything the engine currently needs: physical editable surfaces, mesh/model binding, UV strategy results, render modes, material profile, print profile, camera, dielines, and articulation/carton metadata.

Existing registrations must continue to open unchanged.

## Target separation

```text
ProductDefinition + OptionSelection
                 │
                 ▼
resolveProductConfiguration()
                 │
                 ▼
ResolvedConfiguration / ProductConfig adapter
                 │
                 ├── Studio surfaces and presentation
                 ├── 3D/procedural structure
                 ├── material and render modes
                 └── production profile
```

The resolver—not UI components—will validate defaults, dependency conditions, units, availability, and deterministic configuration identity. Capability fields will drive UI; product-name conditionals are not an accepted extension mechanism.

## Version invariant

A project already records `productVersionId`. Legacy registrations currently use `<productId>@legacy-v1`. P1 will replace that placeholder with immutable published `ProductVersion` records. Existing projects remain bound to their original version unless an explicit migration creates a new project revision and audit record.

## Migration strategy

1. Introduce definitions/options/resolver without removing `ProductConfig`.
2. Provide a static-definition adapter for all current products.
3. Migrate one flat, pouch, carton, garment, and wrapped-label representative.
4. Assert resolved surfaces and production geometry match legacy fixtures.
5. Publish new immutable versions only after onboarding and visual harnesses pass.
