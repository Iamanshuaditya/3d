# Deployment

Issue #26. There is **one** supported production target for V1: a Node
standalone Next.js build, run as a single instance with SQLite and object
storage on one persistent volume.

Cloudflare Workers is experimental and unsupported. See
[Why not Workers](#why-not-workers).

## What "supported" means here

- One app process. Not horizontally scaled — see [Scaling](#scaling).
- SQLite. `VORTEX_DATABASE=postgresql` fails closed (issue #25).
- One persistent volume holding the database and uploaded artwork, or S3-
  compatible object storage for artwork.
- HTTPS in front. Sessions and embedded cookies both require TLS.

## Deploy from scratch

### 1. Generate secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # VORTEX_AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # VORTEX_GUEST_COOKIE_SECRET
```

Two different values. Rotating `VORTEX_GUEST_COOKIE_SECRET` invalidates every
anonymous guest's saved work, so treat it as durable state.

### 2. Configure

| Variable | Required | Purpose |
|---|---|---|
| `VORTEX_AUTH_SECRET` | production | Signs authenticated sessions. ≥32 random bytes, base64url. |
| `VORTEX_GUEST_COOKIE_SECRET` | production | Signs the anonymous guest identity. ≥32 random bytes, base64url. |
| `VORTEX_AUTH_URL` | production | The public **https** origin this deployment serves from. |
| `VORTEX_DATA_DIR` | production (filesystem storage) | Persistent volume for the SQLite database and uploads. |
| `VORTEX_DATABASE` | no | `sqlite` (default and only supported value). |
| `VORTEX_OBJECT_STORE` | no | `filesystem` (default) or `s3`. |
| `VORTEX_S3_ENDPOINT` / `_BUCKET` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | with `s3` | S3-compatible storage. `VORTEX_S3_REGION` defaults to `auto`. |
| `VORTEX_DEPLOYMENT_MODE` | no | `single-node` (default and only supported value). |
| `VORTEX_EMBED_CLIENTS` | no | Embedded configurator clients — see [EMBED.md](./EMBED.md). |
| `VORTEX_BOOTSTRAP_OPERATOR_USER_IDS` | no | Seeds the first operator accounts. |

Every one of these is validated at startup. A misconfigured deployment refuses
to start and names the variable — it never boots and fails later on a customer's
first save.

### 3. Run

**Docker (recommended):**

```bash
export VORTEX_AUTH_SECRET=... VORTEX_GUEST_COOKIE_SECRET=... VORTEX_AUTH_URL=https://configurator.example.com
docker compose up --build -d
```

**Node directly:**

```bash
npm ci
npm run build
npm run build:standalone   # copies .next/static and public into the artifact
NODE_ENV=production \
VORTEX_AUTH_SECRET=... \
VORTEX_GUEST_COOKIE_SECRET=... \
VORTEX_AUTH_URL=https://configurator.example.com \
VORTEX_DATA_DIR=/var/lib/vortex \
npm start
```

`build:standalone` is not optional. `next build` emits the standalone server
without `.next/static` or `public`, so the raw output starts, serves HTML, and
404s every script — a page that looks like an application bug rather than a
missing packaging step.

### 4. Verify

```bash
npm run smoke:deployment -- https://configurator.example.com
```

This does what a customer does: liveness, readiness, session, create a project,
upload artwork, reopen the project, and render the 3D preview — the last
verified by pixel variance, because a failed WebGL context leaves a correctly
sized blank canvas that any element check would pass.

CI runs exactly this against the artifact it just built.

## Operating

### Health checks

| Endpoint | Use | Behaviour |
|---|---|---|
| `GET /api/health` | liveness | Process only. Deliberately touches no dependency: a liveness probe that checks the database turns a transient blip into a crash loop. |
| `GET /api/ready` | readiness / load-balancer gate | Checks configuration, database and object store separately. `503` with the failing check named. |

Point restarts at `/api/health` and traffic at `/api/ready`.

### Persistence

Everything durable lives under `VORTEX_DATA_DIR`:

```
$VORTEX_DATA_DIR/
  vortex.db            # SQLite, WAL mode
  guest-cookie-secret  # development only; production uses the env var
  objects/             # uploaded artwork and production artifacts
```

Back up the whole directory with the app stopped, or use SQLite's online backup
while it runs. Restoring a database without its matching `objects/` leaves
projects referencing artwork that no longer exists.

With `VORTEX_OBJECT_STORE=s3`, artwork moves to the bucket and only the
database stays on the volume.

### Startup failures

The startup gate prints one block naming each problem:

```
This deployment is not correctly configured:
  - VORTEX_AUTH_SECRET: Required in production. Generate one with: ...
  - VORTEX_DATA_DIR: Required in production with filesystem storage: it must
    point at a persistent volume, or uploads and the database are lost on restart.
See docs/platform/DEPLOYMENT.md.
```

The process then exits non-zero. A half-configured production server is worse
than one that never accepted a request.

## Scaling

**Not supported yet.** `VORTEX_DEPLOYMENT_MODE=scaled` fails closed, because:

- rate limits are process-local counters, so N instances give N times the limit;
- background job runners are process-local, so a restart loses in-flight work;
- SQLite on a local volume cannot be shared by multiple instances.

Issue #25 tracks the PostgreSQL adapter, shared rate limiting and distributed
jobs. Until it lands, scale vertically.

A reliable single instance is an acceptable first commercial deployment. Do not
delay customer-facing work for a platform migration that current traffic does
not require.

## Why not Workers

The OpenNext build passes and the Worker deploy was attempted with valid
credentials. It is still not viable, and **not because of bundle size**:

`better-sqlite3` and `sharp` are native modules that cannot execute on Workers
at any size. The 13.69 MiB bundle against a 3 MiB limit is a symptom; a larger
plan limit would not make the runtime compatible. A real Workers target needs
SQLite replaced with D1 or Hyperdrive and sharp-based image work moved off the
Worker — a different architecture, not a smaller build.

The commands remain, named for what they are:

```bash
npm run experimental:cloudflare-build
npm run experimental:cloudflare-preview
```

There is deliberately no `npm run deploy`. A command by that name implies a
supported path.
