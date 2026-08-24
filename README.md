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
| Deployment | **Not demonstrated** | reproducible scripts exist; no observed deploy |
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
| `npm run preview` / `npm run deploy` | Cloudflare Workers via OpenNext |

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
- **PostgreSQL** is documented but not runnable; SQLite is the only working
  adapter and `VORTEX_DATABASE=postgresql` fails closed.
- **Rate limiting and job runners are process-local** — not yet suitable for
  horizontal deployment.
- **Pricing** is a development estimate, disabled in production by default.
- **Cloudflare deploy** is not yet demonstrated against a real account.
- Arbitrary dielines and GLBs are **not** promised to fold automatically.
  Unknown construction semantics require reviewed authoring.

---

## Licence

MIT — see [`LICENSE`](LICENSE). Portions derive from the MIT-licensed
`ai-website-cloner-template` by JCodesMore and retain that attribution.
