# Vortex — AI Context Layer

Canonical technical map of this repository, written so another AI coding agent
or a new engineer can start work without re-deriving the system from source.

- **Generated:** 2026-08-29
- **Repository commit:** `616e26fd48fc978b0eb7b0c48435593944dd1541` (branch `main`, clean tree)
- **Package:** `vortex` v0.1.0 (private) — the directory name
  `ai-website-cloner-template` is a leftover of the MIT template this repo was
  seeded from (see `LICENSE`, `README.md`); it says nothing about the system.
- **Overall confidence:** High for the platform layer (`src/app`, `src/server`,
  `src/platform`), the persistence schema, the HTTP surface, auth, jobs and
  deployment — all read directly. Medium for the deep geometry internals of
  `src/lib/structure` and `src/lib/embroidery` (contracts and gates read; the
  numerical algorithms are summarised, not line-audited). See
  `KNOWN_RISKS.md` for what could not be confirmed.

---

## What this system is, in three sentences

Vortex is a 3D packaging configurator and structural carton engine. A production
**dieline** (the flat plan a factory cuts, supplied as PDF/SVG/DXF) is imported
into a canonical millimetre vector domain and becomes the single geometric
authority for the 2D editor, the folding 3D model, artwork mapping and the
print-ready PDF/X-4 or manufacturing SVG output. Around that engine sits a
modular-monolith Next.js platform: guest/user identity, immutable product and
template versions, immutable project revisions, object storage, bulk
personalization, pricing and an operator publishing console.

The north-star invariant, enforced by tests rather than convention:

```text
fully flattened 3D structural geometry == canonical production dieline
```

---

## Recommended reading order

1. `AGENT_START_HERE.md` — compact onboarding; read this first, always.
2. `ARCHITECTURE.md` — layers, boundaries, entry points, cross-cutting concerns.
3. `GLOSSARY.md` — the vocabulary (dieline, panel, hinge, provenance, owner…).
4. `DATA_FLOW.md` — the six end-to-end flows that matter.
5. Then the reference documents below, as the task requires.

## Which document for which task

| If you are… | Read |
|---|---|
| Adding or changing an HTTP endpoint | `API_MAP.md` + `AUTH_AND_PERMISSIONS.md` + `DATA_FLOW.md` |
| Touching the database or a repository | `DATABASE_MAP.md` + `ARCHITECTURE.md` |
| Changing project save / revision behaviour | `STATE_MACHINES.md` + `DATA_FLOW.md` (Flow 2) |
| Working on background/async work | `BACKGROUND_JOBS.md` (read the duplication section) |
| Working on the embedded configurator | `THIRD_PARTY_INTEGRATIONS.md` (Embed hosts) + `AUTH_AND_PERMISSIONS.md` |
| Touching the structural/dieline engine | `ARCHITECTURE.md` (Structural engine) + `BUSINESS_RULES.md` + `TESTING_MAP.md` |
| Touching print/production output | `BUSINESS_RULES.md` (preflight, provenance) + `STATE_MACHINES.md` |
| Changing pricing | `BUSINESS_RULES.md` (pricing) + `API_MAP.md` (`/api/v1/products/:id/quotes`) |
| Changing auth, cookies, or operator grants | `AUTH_AND_PERMISSIONS.md` |
| Changing configuration or env vars | `CONFIGURATION.md` |
| Deploying, or debugging a deployment | `DEPLOYMENT_AND_RUNTIME.md` |
| Trying to find where something lives | `CODEBASE_MAP.md` |
| Assessing risk before a change | `KNOWN_RISKS.md` |
| Writing or locating tests | `TESTING_MAP.md` |
| Machine-parsing this map | `REPO_CONTEXT.yaml` |

## There are no webhooks

`WEBHOOKS.md` exists and documents this explicitly: this repository has **no**
inbound or outbound webhook handlers, no payment provider, no CRM, no analytics
or messaging integration. Read it before assuming otherwise — the presence of
Dodo Payments / Paddle / Cloudflare MCP tooling in a developer's local agent
config is not evidence of an integration in this codebase.

## Certainty labels used throughout

- **VERIFIED** — read directly from code, config or schema in this commit.
- **INFERRED** — strongly implied by the architecture but not directly asserted
  anywhere in the repository.
- **UNKNOWN** — could not be determined from the repository alone.

Unlabelled statements in these documents are VERIFIED unless the surrounding
text says otherwise.
