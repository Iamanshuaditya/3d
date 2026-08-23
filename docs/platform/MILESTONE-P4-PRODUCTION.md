# P4 milestone report — immutable server production artifacts

Date: 2026-08-23

Branch: `feat/vortex-platform-p0-projects`

Baseline: `main` at `c88b3fd`

## 1. What the repository already provided

The existing print engine was substantial: `normalizePrintJob`, measured surfaces, resolved dielines, effective-PPI/bleed/raster checks, production-resolution object rendering, ICC profiles, PDF/X-oriented metadata, exact page boxes, overprinting Separation spot colors, and optional cut/crease layers. Studio generated and downloaded this PDF in the browser.

Two environment defects blocked server authority. `render-production-artwork.ts` required DOM canvas/`window.Image`, and the CMYK profile loader fetched a browser-relative public URL. There was no artifact repository, revision binding, owner-authorized production API, checksum record, or server-controlled project transition.

## 2. Architecture chosen and why

- Preserve the existing normalizer, preflight rules, PDF generator, profile registry, and geometry contracts.
- Inject `ProductionArtworkRenderer` and `IccProfileLoader` environment adapters into `generateProductionPdf`; core preflight is still rerun and cannot be bypassed.
- Share one Sharp-backed server surface renderer between project previews and production-resolution artwork.
- Add a format-neutral `ProductionExporter`; register PDF only in P4.
- Build a `ProductionService` that resolves the stored product version/configuration, loads the exact immutable revision, verifies stable assets and bytes, and then exports.
- Store immutable artifact metadata in SQLite schema v5 and bytes through the existing `ObjectStore` abstraction.
- Load filesystem ICC profiles through an explicit, integrity-checked server registry so production cannot read arbitrary paths and standalone builds trace only approved assets.
- Enforce one artifact per project revision/format, owner scope every lookup, and verify artifact checksums again at read time.
- Reset readiness to draft after later edits; change status only when the generated/preflighted revision is still current.

This makes the browser a client of production rather than the production authority and does not create a second print engine.

## 3. Exact files added or changed

Core print extension:

- `src/lib/print/types.ts`
- `src/lib/print/preflight.ts`
- `src/lib/print/render-production-artwork.ts`
- `src/lib/print/generate-production-pdf.ts`

Production domain/server:

- `src/platform/production/*`
- `src/server/production/*`
- `src/server/rendering/render-surface-artwork.ts`
- `src/server/projects/project-preview.ts`
- `src/platform/projects/repository.ts`
- `src/server/persistence/database.ts`
- `src/server/persistence/sqlite-project-repository.ts`
- `src/server/storage/filesystem-object-store.ts`

Versioned HTTP/client/UI:

- `src/app/api/v1/projects/[projectId]/production/*`
- `src/app/api/v1/production-artifacts/[artifactId]/*`
- `src/lib/production/client.ts`
- `src/components/studio/StudioShell.tsx`
- `src/components/studio/StudioTopBar.tsx`

Reliability, tests, and docs:

- `src/lib/projects/use-project-session.ts`
- `tests/platform/production-artifact.test.ts`
- `docs/platform/PRODUCTION.md`
- `docs/platform/API.md`
- `docs/platform/ARCHITECTURE.md`
- `docs/platform/PROJECTS.md`
- `docs/platform/AUDIT-2026-08-23.md`
- `docs/print-engine.md`
- `docs/platform/MILESTONE-P4-PRODUCTION.md`

## 4. Working end to end

- Studio flushes pending autosave before requesting server production.
- Server freezes the exact current or requested historical revision.
- Product version/configuration and every surface are re-resolved and checked.
- Referenced artwork is owner scoped and verified by MIME metadata, byte length, and SHA-256.
- Server preflight and server PDF generation use physical dimensions/profile rules, not browser assertions.
- PDF bytes, full preflight report, revision/version/configuration provenance, size, and checksum are persisted immutably.
- Repeated/concurrent generation is idempotent.
- Download re-authorizes the owner and re-verifies the stored artifact.
- Editing after production creates a new draft revision without mutating the old artifact.
- Visual embroidery is rejected as unsupported machine production rather than flattened or mislabeled.
- Blank Studio creation now uses one tab-stable idempotency key through React Strict Mode; Fast Refresh recovers the project ID from the replaced URL.

## 5. Tests executed and results

- Target production suite: 5 passed, 0 failed.
- Full `npm run check`: passed — lint clean, TypeScript clean, 106 tests passed, and the Next.js production build completed successfully.
- Real PDF assertions cover PDF 1.6 header, parsing, page count, output intent, cut/crease spot resources, checksum, and immutable readback.
- Mailer integration generated a 376×554 mm server PDF, exercised section rotations, loaded the checked 8.65 MB public CMYK profile, and exposed four output channels.
- Revision test generated artifact A for revision 2, edited to revision 3, generated artifact B, and re-read unchanged artifact A.
- Security tests cover guest isolation, artwork storage tampering, missing machine embroidery support, and concurrent generation convergence.
- Chrome on localhost:8082 generated and downloaded a revision-1 Bottle artifact through the real API/content routes and displayed the immutable revision/warning result.
- Chrome/server logs also showed two Strict Mode create requests resolving to the same project ID after the client idempotency fix.

## 6. Remaining limitations and risks

- Exact production fonts are not bundled. Text artifacts carry a warning until a licensed/versioned font registry pins bytes and glyph metrics.
- PDF uses the established PDF/X-oriented implementation and structural validator; formal certification by a dedicated PDF/X validator and receiving factory remains external acceptance work.
- Generic/simulated ICC contracts are not factory approval.
- Synchronous generation is suitable for the current bounded modular monolith, not a final high-volume job system.
- SQLite/local filesystem require durable single-node storage; PostgreSQL/object storage adapters remain deployment work.
- Artifact operational repair, approval signatures, order linkage, retention policy, and audit actor IDs are not yet implemented.
- PDF is the only registered exporter. SVG/CFF2 are P5.
- Production output for visual embroidery deliberately fails; machine digitization remains a separate future capability.

## 7. Next highest-value milestone

P5: parameterized packaging and manufacturing exports. First prove one structure drives dimensions, dieline, assembled geometry, unfolding, PDF, and physical rulers. Then add authoritative SVG over a format-neutral manufacturing geometry model. Add experimental CFF2 only after round-trip fixtures with real target CAD systems satisfy the existing research gate.
