# Third-Party Integrations

Only integrations that materially affect runtime behaviour are listed. Ordinary
UI libraries (Radix/`@base-ui`, Tailwind, lucide, clsx, class-variance-authority,
tailwind-merge) are omitted.

---

## 1. S3-compatible object storage (optional, runtime)

```text
Service          Any S3-compatible store. Cloudflare R2 is the documented target
                 (region "auto").
Purpose          Durable storage for artwork, previews, production artifacts,
                 personalization datasets/outputs, template assets, onboarding
                 assets and production fonts.
SDK/package      NONE. A hand-written SigV4 client, ~180 lines.
Configuration    VORTEX_OBJECT_STORE=s3 activates it. Selected in
                 src/server/storage/container.ts::createConfiguredObjectStore().
Env vars         VORTEX_S3_ENDPOINT   (required; must be https unless localhost)
                 VORTEX_S3_BUCKET     (required; validated against an S3 bucket
                                       name regex at construction)
                 VORTEX_S3_ACCESS_KEY_ID     (required)
                 VORTEX_S3_SECRET_ACCESS_KEY (required)
                 VORTEX_S3_REGION            (default "auto")
                 All four "required" ones are also checked at startup by
                 validateDeploymentConfig().
Main files       src/server/storage/s3-object-store.ts
                 src/server/storage/container.ts
                 src/server/storage/storage-key.ts
                 src/platform/storage/object-store.ts
Outgoing         PUT / GET / DELETE, plus PUT with x-amz-copy-source for copy().
                 AWS4-HMAC-SHA256, path-style addressing
                 (<endpoint>/<bucket>/<key>).
Incoming         Object bytes and the Content-Type header. contentType falls back
                 to application/octet-stream when the header is absent.
Failure          Non-2xx throws `S3 <op> failed with status <n>`. GET 404 → null.
                 DELETE 404 is tolerated. There is NO retry and NO timeout —
                 a hung store hangs the request.
Rate limits      None applied or respected.
Webhooks         None.
Assumptions      • Keys are validated by assertStorageKey():
                   /^[a-zA-Z0-9][a-zA-Z0-9/_\-.]{0,511}$/ and must not contain "..".
                 • The bucket is PRIVATE. Nothing generates a presigned URL;
                   every byte is proxied through an owner-scoped route.
                 • put() is not conditional — the caller relies on the DB's
                   UNIQUE(storage_key) for single-writer semantics.
```

Default alternative: `FilesystemObjectStore`
(`<VORTEX_DATA_DIR>/objects`). It writes bytes and a sibling
`<key>.metadata.json` holding the content type, using exclusive-create temp
files plus `rename` for atomicity, mode 0600, and refuses any key that resolves
outside the configured root.

---

## 2. Better Auth (required, runtime)

```text
Service          better-auth ^1.7.1 — a self-hosted library, not a SaaS.
Purpose          Credential storage, password hashing, session issuance, cookies.
Configuration    src/server/auth/create-auth.ts (pure factory) and
                 src/server/auth/better-auth.ts (lazy process singleton).
                 basePath "/api/auth"; emailAndPassword only;
                 minPasswordLength 10, maxPasswordLength 128;
                 revokeSessionsOnPasswordReset true;
                 advanced.database.generateId "uuid", joins true;
                 useSecureCookies when NODE_ENV=production.
Env vars         VORTEX_AUTH_SECRET (or BETTER_AUTH_SECRET) — ≥32 bytes;
                 in development a random secret is written once to
                 <VORTEX_DATA_DIR>/auth-secret (mode 0600, flag "wx").
                 VORTEX_AUTH_URL (or BETTER_AUTH_URL) — the public origin;
                 required and must be https in production.
Storage          The same better-sqlite3 handle as the rest of the app; tables
                 remapped to auth_users / auth_sessions / auth_accounts /
                 auth_verifications (migration 9).
Outgoing         None. No email is sent; there is no configured mailer, so
                 password reset and verification flows have no delivery channel.
Failure          getAuth() throws on a missing production secret. Session
                 resolution failures surface as "no authenticated owner", which
                 falls back to a guest identity for customer routes and to 401
                 for operator routes.
Assumptions      • Better Auth owns the auth_* schema shape. Migration 9 was
                   hand-written to match it; a Better Auth major upgrade may
                   require a schema migration.
                 • The Better Auth adapter is SQLite-only, which is one of the
                   two blockers on the PostgreSQL port.
```

---

## 3. `sharp` (required, runtime, native)

```text
Purpose          Upload validation and decode, project/template preview
                 rendering, production artwork rasterisation.
Package          sharp ^0.35.3 (libvips binding). Declared in
                 next.config.ts serverExternalPackages so Next does not bundle it.
Main files       src/server/projects/image-upload.ts
                 src/server/projects/project-preview.ts
                 src/server/rendering/render-surface-artwork.ts
                 src/server/production/server-production-artwork.ts
                 scripts/smoke-deployment.mjs
Limits           limitInputPixels 40 000 000; failOn "error"; sequentialRead.
                 decoder.stats() forces a full decode so a truncated file with a
                 valid header cannot pass validation.
Failure          Any throw becomes ValidationError UPLOAD_DECODE_FAILED — the
                 underlying libvips message is never surfaced to the client.
Consequence      This is one of the two native modules that make Cloudflare
                 Workers impossible for this app.
```

---

## 4. `better-sqlite3` (required, runtime, native)

Synchronous SQLite binding. Also in `serverExternalPackages`. Compiled from
source in the Docker build (`python3 make g++` in the deps stage) when no
prebuild matches. The second native-module blocker for Workers.

---

## 5. `pdf-lib` and `pdfjs-dist`

```text
pdf-lib ^1.17.1     Writes the PDF/X-4 production artifact.
                    src/lib/print/generate-production-pdf.ts
                    src/server/production/pdf-production-exporter.ts
pdfjs-dist ^6.2.108 Reads a production dieline PDF to extract raw vector paths
                    and spot-colour separations.
                    src/lib/structure/import-pdf.ts, import-pdf-raw.ts
```

Both are in-process libraries; neither makes a network call. The ICC profile
`Coated_Fogra39L_VIGC_260.icc` is served from `public/print-profiles/` and is
integrity-checked against a byte length and sha256 declared in
`src/lib/print/printer-profiles.ts`.

---

## 6. three.js stack (browser)

`three ^0.185`, `@react-three/fiber ^9`, `@react-three/drei ^10`. Renders the
configurator preview and consumes `createStructuralPanelGeometry()` output.
Note that `src/lib/structure/structural-mesh.ts` imports `three` directly — it is
the one place the structural engine depends on a rendering library.

---

## 7. Konva (browser)

`konva ^10` + `react-konva ^19` back the 2D design editor
(`src/components/configurator/DesignEditor.tsx`).

---

## 8. Python onboarding toolchain (operator-triggered subprocess)

```text
Purpose          Turn an arbitrary GLB into a customizable product: inspect UV
                 charts, build editable regions, validate the UV mapping.
Runtime          Python 3.13. Packages: trimesh, numpy, pillow, pygltflib,
                 scipy, networkx (product-onboarding/requirements.txt).
Invocation       spawn() from OnboardingRunner — see BACKGROUND_JOBS.md.
Env vars         VORTEX_ONBOARDING_PYTHON (default
                 product-onboarding/.venv/bin/python)
                 VORTEX_ONBOARDING_TIMEOUT_MS (default 300 000; clamped)
Provenance       command_version = sha256(onboard.py). A changed script
                 invalidates every attached provenance record.
Failure          Non-zero exit or timeout marks the job failed with a specific
                 ONBOARDING_* code. There is no retry.
Assumption       The interpreter and its packages exist on the app host. The
                 shipped Dockerfile does NOT install Python — onboarding is
                 unavailable in the reference container image. (KNOWN_RISKS)
```

---

## 9. Embed host websites (inbound integration surface)

```text
Service          Manufacturer websites that iframe the configurator.
Configuration    VORTEX_EMBED_CLIENTS — a JSON array, parsed and validated by
                 src/server/embed/embed-client-registry.ts. Validated for
                 well-formedness again at startup by validateDeploymentConfig().
Per client       { id, name, status: "active"|"disabled", allowedOrigins[],
                   productIds[], theme, features, completion }
Security         • allowedOrigins must be exact origins; a "*" anywhere or an
                   unparseable value throws InvalidEmbedClientConfig at load.
                 • Duplicate client ids throw.
                 • features default to ALL FALSE (DEFAULT_EMBED_FEATURES is
                   frozen) so shipping a capability never enables it for an
                   existing client.
Incoming         Host origin via the ?host query parameter, plus postMessage.
Outgoing         postMessage to the parent frame.
Failure          Any of UNKNOWN_CLIENT / CLIENT_DISABLED / MISSING_HOST_ORIGIN /
                 ORIGIN_NOT_ALLOWED / PRODUCT_NOT_ENABLED renders the same
                 rejection shell, so probing cannot enumerate clients, origins
                 or products.
Cookies          An embedded request is marked by the x-vortex-embed-client
                 header; over https the guest cookie becomes
                 SameSite=None; Secure; Partitioned (CHIPS), giving each host
                 site its own cookie jar. Over plain http it deliberately stays
                 Lax rather than emitting a cookie browsers would reject.
```

---

## 10. Google Fonts (build/runtime, first-party proxied)

`next/font/google` loads Geist and Geist Mono in `src/app/layout.tsx`. Next.js
self-hosts the font files at build time, so there is no runtime request to
Google from the browser. It does mean **`next build` requires network access**.

---

## 11. Cloudflare Workers (configured, explicitly unsupported)

`@opennextjs/cloudflare`, `wrangler`, `open-next.config.ts` and `wrangler.jsonc`
are present, and `package.json` exposes `experimental:cloudflare-build` /
`experimental:cloudflare-preview`. `README.md` and `docs/platform/DEPLOYMENT.md`
state plainly that this target cannot work: `better-sqlite3` and `sharp` are
native modules. Treat this as retained research, not a deployment path.

`next.config.ts` also calls
`import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev())` at
module scope — an unawaited side effect that runs on every config load.
