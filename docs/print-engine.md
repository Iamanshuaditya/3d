# Vortex Print Engine

The print engine turns the same saved `DesignDocument` used by the 2D editor and 3D preview into a physical-size production PDF. It does not screenshot the 3D model or enlarge the on-screen canvas.

## Production contract

Each product references a reusable `PrinterProfile` through `printProfileId`. A profile controls:

- PDF standard and output condition;
- independent artwork render resolution;
- minimum and warning effective image PPI;
- raster-memory safety limit;
- cutting and creasing layer names, spot colors, line weights, dash patterns, and overprint.

The shipped `pdfx4-srgb-packaging-v1` profile is a generic color-managed PDF/X-4 handoff. It embeds the official ICC sRGB2014 profile and preserves RGB artwork. Before unattended production, a factory must approve this profile or add its exact press/substrate ICC condition and naming contract. A generic color-managed file is not a substitute for a converter's press-specific approval.

`vortex-carton-works-coated-offset-v1` is a simulated company contract used to prove the reusable path. Its substrate assumption is a white coated litho liner laminated to corrugated board, not direct printing onto raw brown kraft. It accepts tagged sRGB artwork in a PDF/X-4 workflow and declares the registered Coated Fogra39L VIGC 260 CMYK output condition (260% TAC). It requires 3 mm bleed, 300 PPI rendering, 250 PPI minimum placed-image resolution, and overprinting `CutContour`/`Crease` technical separations. It remains marked `simulated-company` until a real converter approves a physical proof.

## Reusable pipeline

1. `normalizePrintJob` combines the product, saved design, resolved dieline, and printer profile.
2. `preflightPrintJob` blocks mismatched products, invalid dimensions, missing cut paths, unknown source-image dimensions, images under the minimum effective PPI, and oversized render jobs.
3. `renderProductionArtwork` redraws original objects at the profile PPI using the real physical dimensions. It applies the same printer-authored panel rotations used by the product adapter.
4. `generateProductionPdf` creates exact PDF page boxes, embeds artwork, adds ICC output intent and PDF/X metadata, then writes vector optional-content layers for cutting and creasing as overprinting Separation spot colors.
5. The server stores bytes, checksum, report, and exact revision/version/configuration provenance as an immutable artifact.
6. Studio downloads only through the owner-authorized artifact endpoint after pending autosave has flushed.

The 2D document is the source of truth. Both the 3D viewer and PDF exporter are deterministic consumers, so adding another product does not require copying export logic.

## Onboard another product

1. Define real physical surface dimensions and editor dimensions in `ProductConfig`.
2. Provide a printer-authored `SurfaceDieline`, or a geometry adapter resolved by `resolveSurfaceDieline`.
3. Add section bounds and `textureRotation` only where panels need production orientation changes.
4. Set `printProfileId` to a profile approved for that printer, process, ink set, and substrate.
5. Upload source images with original pixel metadata intact and run a representative export.
6. Validate the exported artifact with `npm run validate:pdf -- path/to/file.pdf`, then run the printer's certified preflight (for example callas pdfToolbox, Enfocus PitStop, or the printer's portal).

## Current guarantees

- exact physical page size from product configuration;
- profile-controlled 300 PPI artwork rendering;
- source-image effective-PPI enforcement;
- embedded ICC output intent and PDF/X-4 identification metadata;
- vector `Cutting` and `Creasing` optional-content groups;
- `CutContour` and `Crease` Separation spot colors with overprint;
- deterministic filename and one page per editable surface;
- structural validation script for CI or operator QA.
- immutable revision-bound artifact metadata and SHA-256-verified storage;
- server-side stable asset resolution rather than browser object URLs.

Editable text currently carries a server-font approval warning because exact licensed font bytes are not bundled yet. Visual embroidery treatment fails production preflight because the embroidery engine is a preview simulation, not machine digitization.

## Factory sign-off boundary

No software can infer a factory's ink, substrate, trapping, total-area coverage, finishing equipment, or required spot-color names from a 3D model. Those values belong in a printer-approved profile. The engine is designed so that approval is configuration, not a rewrite; do not label a generic profile “printer approved” until the receiving company has tested and signed it off.
