# Configuration

## How configuration works

There is **one** configuration mechanism: process environment variables read
directly via `process.env`. There is no config file, no config service, no
runtime settings table and no remote flag provider.

The single validation point is `validateDeploymentConfig(env = process.env)` in
`src/server/config/environment.ts`. It is:

- **pure and env-injected**, so a test can exercise a production configuration
  without touching `process.env`;
- called by `register()` in `src/instrumentation.ts` **before the server accepts
  a request** — a `DeploymentConfigError` is rethrown and the process refuses to
  start, printing every problem with its variable name;
- called again by `GET /api/ready` so a live instance reports the same verdict.

Anything it does not check is read ad hoc at the point of use.

```text
process start
   └─ instrumentation.register()          NEXT_RUNTIME === "nodejs" only
        └─ validateDeploymentConfig()
             ├─ ok    → console.info {event:"deployment.configured", …}
             └─ throw → console.error {event:"deployment.misconfigured", problems}
                        then rethrow → the server never accepts a request
```

---

## Deployment shape

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VORTEX_DEPLOYMENT_MODE` | no | `single-node` | Only `single-node` is accepted. `scaled` **fails closed** with an explanation; any other value is rejected as unknown. |
| `VORTEX_DATABASE` | no | `sqlite` | Only `sqlite` is accepted. `postgresql` fails closed at startup *and* again in `configuredPersistenceBackend()`. |
| `VORTEX_DATA_DIR` | in production with filesystem storage | `.data` (relative to cwd) | Root for the SQLite file (`<dir>/vortex.sqlite`), objects (`<dir>/objects`), onboarding work (`<dir>/onboarding-work`), and the dev-only auto-generated secrets. Must be a persistent volume. |
| `NODE_ENV` | — | — | `production` switches on secret requirements, secure cookies, the pricing kill-switch and the golden-reference route guard. |
| `PORT`, `HOSTNAME` | no | `3000`, `0.0.0.0` | Read by the Next.js standalone server. Set in the Dockerfile. |
| `NEXT_DIST_DIR` | no | `.next` | Overrides `distDir` in `next.config.ts` and is honoured by `scripts/package-standalone.mjs`. |
| `NEXT_TELEMETRY_DISABLED` | no | — | Set to `1` in the Dockerfile. |

---

## Secrets

| Variable | Required | Purpose |
|---|---|---|
| `VORTEX_AUTH_SECRET` | **yes in production** | Better Auth signing secret. ≥32 bytes. Fallback name `BETTER_AUTH_SECRET` is accepted by `better-auth.ts` but **not** by the startup gate. In development a random secret is written once to `<VORTEX_DATA_DIR>/auth-secret`. |
| `VORTEX_GUEST_COOKIE_SECRET` | **yes in production** | HMAC key for the `vortex_guest` cookie. Must decode from base64url to ≥32 bytes. In development auto-generated into `<VORTEX_DATA_DIR>/guest-cookie-secret`. |
| `VORTEX_AUTH_URL` | **yes in production** | The public origin this deployment is served from. Must start with `https://`. Fallback name `BETTER_AUTH_URL` is accepted by `better-auth.ts` only. |

Generate either secret with:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

Never commit values. `.env.local` in this working tree contains only a local
path to the private reference PDF.

---

## Object storage

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VORTEX_OBJECT_STORE` | no | `filesystem` | `filesystem` or `s3`. Anything else is rejected. |
| `VORTEX_S3_ENDPOINT` | when `s3` | — | Must be `https://` unless the host is `localhost`/`127.0.0.1`. |
| `VORTEX_S3_BUCKET` | when `s3` | — | Validated against an S3 bucket-name regex. |
| `VORTEX_S3_ACCESS_KEY_ID` | when `s3` | — | |
| `VORTEX_S3_SECRET_ACCESS_KEY` | when `s3` | — | |
| `VORTEX_S3_REGION` | no | `auto` | Cloudflare R2 uses `auto`. Not checked by the startup gate. |

---

## Embedded configurator

| Variable | Required | Purpose |
|---|---|---|
| `VORTEX_EMBED_CLIENTS` | no | JSON **array** of embed clients. The startup gate checks only that it parses to an array; the full schema is validated lazily on first registry use, where a wildcard origin, an unparseable origin or a duplicate client id throws `InvalidEmbedClientConfig`. |

Shape per client (`src/platform/embed/types.ts`):

```json
[{
  "id": "acme",
  "name": "Acme Packaging",
  "status": "active",
  "allowedOrigins": ["https://shop.acme.example"],
  "productIds": ["kraft-visiting-card-88.9x50.8"],
  "theme":   { "accent": "#1f6feb", "surface": "#ffffff", "panel": "#f6f7f9",
               "text": "#14171a", "dim": "#5b6472", "line": "#e3e6ea",
               "radiusPx": 8, "fontFamily": null },
  "features":{ "text": false, "uploads": false, "background": false,
               "adjust": false, "preview3d": false, "unfold": false,
               "downloadArtifact": false },
  "completion": { "mode": "save", "ctaLabel": "Save design",
                  "confirmationText": "…" }
}]
```

Every `features` flag defaults to `false` and every theme key falls back to
`DEFAULT_EMBED_THEME`, so a partial client object is valid.

---

## Operators

| Variable | Required | Purpose |
|---|---|---|
| `VORTEX_BOOTSTRAP_OPERATOR_USER_IDS` | no | Comma-separated authenticated user ids granted **all** operator permissions without a database row. Read **once** at service construction — a change needs a restart. |

---

## Product onboarding (Python subprocess)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VORTEX_ONBOARDING_PYTHON` | no | `product-onboarding/.venv/bin/python` | Interpreter used by `OnboardingRunner`. CI sets it to `python`. |
| `VORTEX_ONBOARDING_TIMEOUT_MS` | no | `300000` | Per-stage timeout, clamped to `[10 000, 900 000]`. |

---

## PostgreSQL (foundation only — the app fails closed on it)

| Variable | Default | Purpose |
|---|---|---|
| `VORTEX_POSTGRES_URL` | — | **Required** when PostgreSQL code is used. |
| `VORTEX_POSTGRES_MAX_CONNECTIONS` | `10` | Pool ceiling. |
| `VORTEX_POSTGRES_CONNECT_TIMEOUT_MS` | `5000` | |
| `VORTEX_POSTGRES_STATEMENT_TIMEOUT_MS` | `15000` | Passed as `statement_timeout`. |
| `VORTEX_POSTGRES_IDLE_TIMEOUT_MS` | `30000` | |
| `VORTEX_POSTGRES_SSL` | `require` | Any value other than `disable` enables TLS with `rejectUnauthorized: true`. |
| `VORTEX_POSTGRES_TEST_URL` | — | Test-only. When unset, the 9 PostgreSQL integration tests skip. CI sets it against a `postgres:17` service. |

> **Discrepancy (VERIFIED).** `.env.example` documents `VORTEX_DATABASE_URL`.
> That name appears **nowhere** in the codebase. The code reads
> `VORTEX_POSTGRES_URL`. See `KNOWN_RISKS.md`.

---

## Feature flags

| Flag | Effect |
|---|---|
| `VORTEX_ENABLE_DEVELOPMENT_PRICING=true` | Installs `StaticPricingProvider` even when `NODE_ENV=production`. Without it, production pricing returns 422 `PRICING_UNAVAILABLE`. |
| `VORTEX_GOLDEN_REFERENCE_PDF=<abs path>` | Enables `/studio/golden-reference[/capture]` and the `verify:golden-*` scripts. Ignored when `NODE_ENV=production`. The file is licensed and must never be committed; it is locked by SHA-256 in `fixtures/`. |
| Per-client `EmbedFeatures` | The real feature-flag surface: seven booleans per embed client, all default off. |

---

## Development and tooling

| Variable | Purpose |
|---|---|
| `VORTEX_SMOKE_URL` | Base URL for `npm run smoke:deployment` (also positional argv). |
| `VORTEX_SMOKE_PRODUCT_ID` | Product used by the smoke test. Default `kraft-visiting-card-88.9x50.8`. |
| `NEXTJS_ENV` | Set to `development` in `.dev.vars` for the OpenNext/Wrangler dev path. |

## Files

```text
.env.example         Documented template (contains the VORTEX_DATABASE_URL slip).
.env.local           Local-only; git-ignored. Holds the private PDF path here.
.dev.vars            Wrangler dev vars for the unsupported Workers path.
docker-compose.yml   Reference single-node deployment; requires AUTH_SECRET,
                     GUEST_COOKIE_SECRET and AUTH_URL via ${VAR:?message}.
Dockerfile           Bakes NODE_ENV=production, PORT, HOSTNAME, VORTEX_DATA_DIR.
.github/workflows/   CI sets VORTEX_ONBOARDING_PYTHON, VORTEX_POSTGRES_TEST_URL,
                     and generates ephemeral secrets for the deployment job.
next.config.ts       output "standalone", serverExternalPackages, optional
                     distDir override.
```

## Minimum production environment

```bash
NODE_ENV=production
VORTEX_DEPLOYMENT_MODE=single-node
VORTEX_DATABASE=sqlite
VORTEX_OBJECT_STORE=filesystem      # or s3 + the five S3 vars
VORTEX_DATA_DIR=/data               # a persistent volume
VORTEX_AUTH_SECRET=<32+ random bytes, base64url>
VORTEX_GUEST_COOKIE_SECRET=<32+ random bytes, base64url>
VORTEX_AUTH_URL=https://configurator.example.com
```
