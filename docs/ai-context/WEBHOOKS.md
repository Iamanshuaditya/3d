# Webhooks

## There are none. VERIFIED.

This repository contains **no inbound webhook endpoints and no outbound webhook
delivery**. There is no payment provider, no communication platform, no CRM, no
analytics pipeline and no external AI provider integrated into it.

## Evidence

- Every route handler in the application is enumerated in `API_MAP.md`; all 49
  live under `src/app/api/**`. None accepts a third-party callback, and none
  verifies a provider signature.
- There is no signature-verification code anywhere. The only HMAC in the
  codebase is `GuestIdentityCodec` in `src/server/auth/owner-context.ts`, which
  signs *this application's own* guest cookie, and AWS SigV4 request signing in
  `src/server/storage/s3-object-store.ts`.
- The only outbound HTTP in the whole server is `fetch` inside `S3ObjectStore`
  (used only when `VORTEX_OBJECT_STORE=s3`). VERIFIED by inspection of every
  `src/server` module.
- `package.json` contains no payment, messaging, analytics or AI SDK.

## Why an agent might wrongly believe otherwise

The developer's local Claude Code environment advertises MCP servers and skills
for Dodo Payments, Paddle, Cloudflare and others. **Those are the developer's
tooling, not this application's dependencies.** Nothing in `src/`, `package.json`
or the deployment configuration references any of them.

Similarly, `docs/platform/COMMERCE.md` and
`docs/platform/MILESTONE-P6-COMMERCE-BOUNDARY.md` describe a commerce *boundary
contract* — the seam a future payment integration would attach to. The
implemented surface today is limited to `PricingProvider` (`src/platform/pricing/
types.ts`) with two in-process implementations, `StaticPricingProvider` and
`UnavailablePricingProvider`. Neither makes a network call.

## The closest thing to a webhook: the embed postMessage protocol

`src/lib/embed/protocol.ts` defines a versioned, namespaced `postMessage`
contract between a manufacturer's page and the embedded configurator iframe.

```text
Direction     bidirectional, browser-to-browser (window.postMessage)
Namespace     "vortex-embed"   (EMBED_MESSAGE_NAMESPACE)
Version       1                (EMBED_PROTOCOL_VERSION)
Transport     no HTTP; the host page and the frame are different origins
Authentication  the frame's allowed parents are constrained by the
                Content-Security-Policy: frame-ancestors header set per request
                in src/proxy.ts from the client's registered allowedOrigins.
                Message handlers additionally check the sender origin.
Retry         none — messages are fire-and-forget
Failure       an unrecognised message from an unexpected origin is
              indistinguishable from noise, by design
Files         src/lib/embed/protocol.ts
              src/components/embed/use-embed-host.ts
              src/components/embed/EmbedShell.tsx
              src/platform/embed/resolve-embed.ts
              src/server/embed/embed-client-registry.ts
              src/proxy.ts
```

This is an in-browser integration surface, not a webhook. It carries no
server-to-server traffic and has no delivery guarantees.

## If you are asked to add a webhook

The pieces that do **not** exist yet and would have to be built:

1. A signature-verification helper (there is no `crypto.timingSafeEqual`-based
   request verifier for third-party payloads today — only the cookie codec).
2. A raw-body reader. `readJson()` in `src/server/http/api.ts` parses JSON after
   reading text; most providers require the exact raw bytes for HMAC comparison.
3. An idempotency store for provider event ids. `background_jobs` already has
   `UNIQUE(queue, idempotency_key)` and would be the natural home — see
   `BACKGROUND_JOBS.md` for why that table is currently unused.
4. An exemption from `assertSameOriginMutation()`, which would otherwise reject
   every provider POST with 403 `CROSS_SITE_REQUEST` / `ORIGIN_MISMATCH`.
   This is the trap: a webhook route added under `withOwner` will silently fail.
