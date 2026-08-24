<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vortex

## What This Is
A 3D packaging configurator and structural carton engine. A production vector
dieline (PDF/SVG/DXF) is the single geometric authority: the same canonical
geometry drives the 2D editor, the exact folding 3D model, artwork mapping and
the print-ready manufacturing output.

North-star invariant:

```text
fully flattened 3D structural geometry == canonical production dieline
```

## Tech Stack
- **Framework:** Next.js 16 (App Router, React 19, TypeScript strict)
- **3D:** three.js via @react-three/fiber + drei
- **UI:** Radix primitives, Tailwind CSS v4, `cn()` utility
- **Persistence:** better-sqlite3 (PostgreSQL migration boundary in `docs/platform/`)
- **Deployment:** Cloudflare Workers via OpenNext

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` / `npm run typecheck` / `npm test`
- `npm run check` — lint + typecheck + test + build

Structural verification (requires the authorized local reference PDF):
- `npm run verify:golden-local -- <reference.pdf>` — source acceptance gates
- `npm run verify:golden-reference -- <reference.pdf>` — runtime recreation
- `npm run capture:golden-reference` — six fixed-camera evidence captures
- `npm run finalize:golden-reference -- <run-summary.json> <visual-review.json>`

## Code Style
- TypeScript strict mode, no `any`
- Named exports, PascalCase components, camelCase utils
- Tailwind utility classes, no inline styles
- 2-space indentation
- Files under ~800 lines; extract modules rather than growing one

## Engineering Principles
- **The dieline is authority** — never author a second, separately-maintained
  shape for the 3D model. Flat 3D must reproduce the source exactly.
- **Fail closed on unknown geometry** — never silently guess a hidden
  construction fact. Reference-derived estimates must be explicitly labelled
  and must never be presented as manufacturer certification.
- **Measure, don't assume** — chirality, handedness and fold direction are
  decided by measurement on the assembled rig, then locked with a regression
  test confirmed to fail against the old behaviour.
- **Camera is independent of fold state** — fold logic never owns or mutates
  camera/orbit state.

## Project Structure
```
src/
  app/              # Next.js routes
  components/       # React components (configurator/, studio/, ui/)
  lib/
    structure/      # Canonical vector domain, topology, meshes, rig, gates
    configurator/   # Product config, unfold plan, hinge animation
    print/          # Manufacturing geometry and production PDF
  server/           # Persistence, products, projects, personalization
  types/            # Shared TypeScript contracts
docs/
  structural-engine/ # Engine contracts, quality gates, golden reference
  platform/          # Product/project/API/production milestones
fixtures/            # Reference manifests (private sources are NOT committed)
tests/               # node:test suites (structure/, unfold/, platform/)
scripts/             # Verification, capture and asset tooling
```

## MOST IMPORTANT NOTES
- When launching Claude Code agent teams, ALWAYS have each teammate work in their own worktree branch and merge everyone's work at the end, resolving any merge conflicts smartly since you are basically serving the orchestrator role and have full context to our goals, work given, work achieved, and desired outcomes.
- Licensed/private reference sources (the golden PDF, reference screenshots) are never committed. They are referenced by SHA-256 in `fixtures/` and supplied locally via `VORTEX_GOLDEN_REFERENCE_PDF`.
- `quality-report.json` and `QUALITY_STATE.md` record the current certification state. CI success alone must never flip them to PASS.
