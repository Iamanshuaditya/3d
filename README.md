# Vortex

A 2D/3D product-customization and structural-packaging system.

Vortex imports a **production dieline** — the flat plan a factory actually
cuts — and treats it as the single geometric authority for everything
downstream: the 2D editor, the exact 3D panel geometry, the folding motion,
artwork mapping, and the print-ready output.

```text
fully flattened 3D structural geometry == canonical production dieline
```

That invariant is enforced by automated gates, not by convention. On the
reference carton the flat 3D boundary matches its source to **4.5e-13 mm**.

---

## What is and is not certified

Vortex keeps certification lanes deliberately separate. A green CI run does not
grant manufacturing approval, and a convincing render does not prove glue, tuck
or board facts.

| Lane | Status | Basis |
|---|---|---|
| Engineering / software | **Green** | lint, typecheck, full test suite, production build |
| Reference recreation | **Certified** | 45/50, all 10 hard gates true, 12/12 source gates on the authorized source |
| Manufacturing construction | **Not certified** | requires converter evidence; not obtainable from this repository |
| Deployment | **Supported (single-node)** | Node standalone build; CI builds the shipping artifact, starts it and smoke-tests project create, artwork upload and 3D preview |
| Commercial / supplier | **Not ready** | development pricing only |

Current machine-readable state lives in [`quality-report.json`](quality-report.json);
the human-readable version is [`QUALITY_STATE.md`](QUALITY_STATE.md); the
append-only history is [`quality-run-log.md`](quality-run-log.md). A test
(`tests/platform/quality-record-consistency.test.ts`) fails the build if those
three ever contradict each other.

---

## Quick start

Requires **Node 24+** and **Python 3.13+**.

```bash
npm ci
python -m pip install -r product-onboarding/requirements.txt
npm run dev            # http://localhost:3000
```

Full gate:

```bash
npm run check          # lint + typecheck + test + build
```

---

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` / `npm test` | Individual gates |
| `npm run check` | All of the above |
| `npm run verify:golden-local -- <ref.pdf>` | 12 source-acceptance gates |
| `npm run verify:golden-reference -- <ref.pdf>` | Runtime fold recreation + 100-cycle certificate |
| `npm run capture:golden-reference` | Six fixed-camera evidence captures |
| `npm run finalize:golden-reference -- <run-summary> <visual-review>` | Issues the certification verdict |
| `npm run build:standalone` | Packages the runnable production artifact |
| `npm start` | Runs the packaged production artifact |
| `npm run smoke:deployment -- <url>` | Verifies a running deployment end to end |

---

## Architecture

| Area | Path | Owns |
|---|---|---|
| Structural engine | `src/lib/structure` | Vector domain, PDF/SVG/DXF import, topology, panels, meshes, hinge rig, quality gates |
| Configurator | `src/lib/configurator` | Product definitions, fold plan and timing, carton/pouch geometry, editor state |
| Print engine | `src/lib/print` | Printer profiles, preflight, PDF/X-4 and manufacturing SVG |
| Embroidery | `src/lib/embroidery` | Visual stitch simulation and material maps (**not** machine digitization) |
| Platform | `src/server`, `src/platform` | Identity, projects, immutable versioning, storage, templates, personalization, production, pricing |
| Onboarding | `product-onboarding` | Python pipeline turning an arbitrary GLB into a customizable product |

Dependencies run one way: the structural engine knows nothing about React, the
database or products. `src/lib/structure` must never import from
`src/lib/configurator`.

**Read next:** [`docs/VORTEX-GUIDE.html`](docs/VORTEX-GUIDE.html) — a detailed
field manual covering every engine from first principles, written for both
non-technical and technical readers. Deeper contracts live in
[`docs/structural-engine/`](docs/structural-engine/) and
[`docs/platform/ARCHITECTURE.md`](docs/platform/ARCHITECTURE.md).

---

## Private reference material

The authorized golden reference PDF, its screenshots and any customer artwork
are **never committed**. They are locked by SHA-256 in
[`fixtures/`](fixtures/) and supplied locally:

```bash
VORTEX_GOLDEN_REFERENCE_PDF=/absolute/path/to/reference.pdf npm run dev
# then open /studio/golden-reference   (disabled in production by construction)
```

Verification commands only run when the local file is present and its checksum
matches the manifest.

---

## Known limitations

These are real and mostly deliberate. See `quality-report.json` →
`blockingEvidence` for the exact external evidence each one needs.

- **Manufacturing certification** needs converter data — board caliper, glue and
  tuck destinations, hidden lock-bottom diagonal signs. The engine fails closed
  rather than guessing.
- **Embroidery** is a visual simulation. DST/PES machine output is deliberately
  unsupported; it would require a real digitization plan and physical sew-out
  evidence.
- **PostgreSQL is partially implemented.** The target schema, pooled
  connections with transactions, the shared rate limiter and the distributed
  job queue are built and verified against a real PostgreSQL 17. The twelve
  domain repositories and the Better Auth adapter are not ported, so
  `VORTEX_DATABASE=postgresql` still fails closed. See
  [`docs/platform/POSTGRESQL.md`](docs/platform/POSTGRESQL.md).
- **Rate limits and background jobs are now shared-store backed** — durable
  across restarts, with jobs claimed under a recoverable lease. Horizontal
  scale still needs the PostgreSQL repositories, so
  `VORTEX_DEPLOYMENT_MODE=scaled` fails closed at startup rather than
  degrading silently.
- **Pricing** is a development estimate, disabled in production by default.
- **Cloudflare Workers is experimental and unsupported.** `better-sqlite3` and
  `sharp` are native modules that cannot execute on Workers at any bundle size,
  so the 13.69 MiB build is a symptom rather than the cause — a larger plan
  limit would not make it run. A viable Workers target needs D1 or Hyperdrive
  instead of SQLite and image work moved off the Worker. The supported target
  is a Node standalone build; see
  [`docs/platform/DEPLOYMENT.md`](docs/platform/DEPLOYMENT.md).
- Arbitrary dielines and GLBs are **not** promised to fold automatically.
  Unknown construction semantics require reviewed authoring.

---

## Licence

MIT — see [`LICENSE`](LICENSE). Portions derive from the MIT-licensed
`ai-website-cloner-template` by JCodesMore and retain that attribution.
