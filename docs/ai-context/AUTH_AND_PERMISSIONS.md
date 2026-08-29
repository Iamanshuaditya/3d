# Authentication and Permissions

## Overview

There are **three identity kinds** and **three authorization boundaries**.

```text
                      ┌─────────────────────────────────────────┐
   Request ──────────▶│ resolveOwnerContext()                   │
                      │  1. Better Auth session   → user owner  │
                      │  2. signed vortex_guest   → guest owner │
                      │  3. neither               → issue guest │
                      └───────────────┬─────────────────────────┘
                                      │  ProjectOwner
      ┌───────────────────────────────┼───────────────────────────────┐
      ▼                               ▼                               ▼
 withOwner()                    withPublicApi()                 withAdminApi()
 owner-scoped SQL               no identity at all              require(headers, perm)
 customer resources             catalogue reads                 Better Auth session
                                                                + operator_grants
```

---

## 1. Customer authentication (Better Auth)

| Aspect | Value |
|---|---|
| Library | `better-auth` ^1.7.1, self-hosted |
| Mount | `/api/auth/[...all]` → `getAuth().handler(request)` |
| Methods | Email + password only. No OAuth provider, no magic link, no MFA. |
| Password policy | min 10, max 128 characters (`create-auth.ts`) |
| Session revocation | `revokeSessionsOnPasswordReset: true` |
| Session format | Opaque token in `auth_sessions.token` (UNIQUE), with `expiresAt`, `ipAddress`, `userAgent` |
| Cookies | Managed entirely by Better Auth; `useSecureCookies` when `NODE_ENV=production` |
| Ids | UUID (`advanced.database.generateId: "uuid"`) |
| Storage | The same SQLite handle; tables remapped to `auth_users` / `auth_sessions` / `auth_accounts` / `auth_verifications` |
| Secret | `VORTEX_AUTH_SECRET` (fallback `BETTER_AUTH_SECRET`), ≥32 bytes. In development a random secret is written once to `<VORTEX_DATA_DIR>/auth-secret` with `flag: "wx"`, mode 0600. In production a missing secret **throws**. |
| Base URL | `VORTEX_AUTH_URL` (fallback `BETTER_AUTH_URL`); required and must be `https://` in production |
| Email delivery | **None configured.** Verification and password-reset emails have no sender. |

Session lookup goes through an injectable seam so tests never need real cookies:

```ts
// src/server/auth/owner-context.ts
export class BetterAuthAuthenticationProvider implements AuthenticationProvider {
  constructor(private readonly resolveSession = async (headers) =>
    (await import("@/server/auth/better-auth")).getAuth().api.getSession({ headers }))
}
export function setAuthenticationProvider(p: AuthenticationProvider)  // test seam
export function resetAuthenticationProvider()
```

`setAuthenticationProvider` mutates a module-level variable. It is exported from
production code and is **not** guarded by `NODE_ENV`. Only tests call it today.

---

## 2. Guest identity (this application's own scheme)

```text
Cookie name    vortex_guest
Value          `${uuidv4}.${base64url(HMAC-SHA256(uuid, secret))}`
Secret         VORTEX_GUEST_COOKIE_SECRET, base64url, ≥32 decoded bytes.
               In development, auto-generated once into
               <VORTEX_DATA_DIR>/guest-cookie-secret (mode 0600, flag "wx").
               In production a missing secret THROWS (and the startup gate
               catches it first).
Verification   GuestIdentityCodec.verify():
               • split at the FIRST "."
               • the id must match a strict UUID v1–v8 regex
               • timingSafeEqual on equal-length buffers
               • any failure → null → a NEW guest is issued
Attributes     HttpOnly; Path=/; priority high; Max-Age 31 536 000 (365 days)
               SameSite=Lax; Secure when NODE_ENV=production
               SameSite=None; Secure; Partitioned  when embedded AND https
Cleared by     clearGuestCookie() — only on a successful /api/v1/session/claim
Files          src/server/auth/owner-context.ts
```

**The opaque owner id is never returned to the client.** `GET /api/v1/session`
answers only `{owner:{type}}`.

---

## 3. Guest → user claim

```text
POST /api/v1/session/claim
  requires a Better Auth session          → else 401 AUTHENTICATION_REQUIRED
  requires a valid signed guest cookie    → else 401 GUEST_IDENTITY_REQUIRED
  rate limit "project-claim" 10/60s, keyed on the USER owner
  → claimAll(guestOwner, userOwner, now)  one SQLite transaction:
       project_owner_claims lookup:
         a row for a DIFFERENT user  → 409 GUEST_ALREADY_CLAIMED (no writes)
       UPDATE design_projects          SET owner = user WHERE owner = guest
       UPDATE personalization_datasets SET owner = user WHERE owner = guest
       UPDATE personalization_jobs     SET owner = user WHERE owner = guest
       INSERT/UPDATE project_owner_claims(guest_id, user_id, project_count)
  → response clears the guest cookie
```

`price_quotes` are **not** migrated. See `KNOWN_RISKS.md`.

---

## 4. Operator authorization

```text
Permissions (9, declared in src/platform/products/drafts.ts):
  products:read  products:edit  products:validate  products:publish
  templates:read templates:edit templates:publish
  assets:upload  onboarding:run

Storage:   operator_grants(user_id, permission)  PK (user_id, permission),
           user_id → auth_users ON DELETE CASCADE, permission CHECK-constrained

Resolution: OperatorAuthorizationService.require(headers, permission)
  1. resolveSession(headers) — no session → 401 OPERATOR_AUTHENTICATION_REQUIRED
  2. bootstrapUserIds.has(user.id)
        ? ALL_OPERATOR_PERMISSIONS
        : grants.listPermissions(user.id)
  3. operatorHasPermission(permissions, required) — no → 403 OPERATOR_FORBIDDEN
  4. returns ProductOperator { id, permissions }

Implication lattice (operatorHasPermission):
  products:publish  ⟹ products:edit, products:validate, products:read
  products:edit     ⟹ products:read
  products:validate ⟹ products:read
  templates:publish ⟹ templates:edit, templates:read
  templates:edit    ⟹ templates:read
  assets:upload, onboarding:run imply nothing and are implied by nothing.
```

`ProductOperator` is explicitly typed as "must be created by a trusted
authentication adapter, never from request JSON". Services then re-check with
`authorize(operator, permission)` internally, so a service call bypassing the
route still fails.

### Bootstrap operators

`VORTEX_BOOTSTRAP_OPERATOR_USER_IDS` — comma-separated authenticated user ids
that receive every permission with no database row.

Two things to know:

1. The set is captured **once**, in the default constructor parameter
   `configuredBootstrapIds()`, evaluated when `getOperatorAuthorizationService()`
   first runs. Changing the variable requires a restart.
2. **There is no API or UI to insert `operator_grants` rows.** The only writer of
   that table in this repository would be a manual SQL statement. In practice the
   bootstrap variable *is* the operator model today.

---

## 5. Route-by-route authentication posture

| Surface | Boundary | Identity required | Notes |
|---|---|---|---|
| `/api/health`, `/api/ready` | none | none | Intentionally public. `/api/ready` leaks per-dependency `detail` strings — including configuration problems — to any caller. See `KNOWN_RISKS.md`. |
| `/api/auth/*` | Better Auth | n/a | |
| `GET /api/v1/session` | `withOwner` | none (issues a guest) | |
| `POST /api/v1/session/claim` | `withPublicApi` + manual checks | user **and** guest | |
| `/api/v1/products*`, `/api/v1/templates*` (GET), `POST …/configurations/resolve` | `withPublicApi` | none | Intentionally public catalogue. No rate limit. |
| `/api/v1/projects*`, `/api/v1/production-artifacts*`, `/api/v1/price-quotes*`, `/api/v1/personalization-*` | `withOwner` | guest or user | Owner-scoped SQL is the authorization. |
| `/api/v1/admin/**` | `withAdminApi` | user + operator grant | No rate limiting on any admin route. |
| `/admin/products` (page) | server component | `products:read` | 401 → `redirect("/sign-in?returnTo=…")`; any other failure → `notFound()` (so a signed-in non-operator sees a 404, not a 403). |
| `/embed/:clientId/:productId` | registry resolution | none | Fail-closed on client, origin and product. |
| `/studio/golden-reference[/capture]` | none | none | Refuses to render when `NODE_ENV=production` (`golden-preview.ts:77`) and when the private PDF is absent. |
| `/test` | none | none | `PacdoraLab` research prototype, publicly reachable in production. |
| `/`, `/studio`, `/designs`, `/templates`, `/sign-in` | none | none | Data is fetched client-side under `withOwner`. |

**Intentionally unauthenticated:** the catalogue endpoints, `/api/health`,
`/api/ready`, and the guest-issuing session endpoint.
**Potentially accidental:** `/test` and the verbose `/api/ready` payload — both
recorded in `KNOWN_RISKS.md`.

---

## 6. Cross-site request protection

`assertSameOriginMutation(request)` (`src/server/http/api.ts`) runs on every
mutating route:

```text
1. Sec-Fetch-Site === "cross-site"        → 403 CROSS_SITE_REQUEST
2. If an Origin header is present, it must be in:
     { nextUrl.origin,
       `${proto}://${host}`,
       `${proto}://${x-forwarded-host}` }  → else 403 ORIGIN_MISMATCH
   proto = x-forwarded-proto (first value) ?? nextUrl.protocol
```

Notes:

- A request with **no** `Origin` header and no `Sec-Fetch-Site` header passes.
  That is the classic non-browser client (curl, a server) — which is deliberate,
  since there is no API-key surface, but it means CSRF protection rests on
  browsers sending those headers.
- `x-forwarded-host` and `x-forwarded-proto` are trusted unconditionally. Behind
  a proxy that does not strip client-supplied forwarding headers, an attacker
  could widen the allowed origin set. See `KNOWN_RISKS.md`.
- There is **no** CSRF token anywhere.

## 7. Framing policy

Set per request in `src/proxy.ts`:

```text
non-/embed path      Content-Security-Policy: frame-ancestors 'none'
                     X-Frame-Options: DENY

/embed/:c/:p         client active with origins →
                       Content-Security-Policy: frame-ancestors <exact origins>
                       (no X-Frame-Options — it has no multi-origin form)
                     otherwise →
                       frame-ancestors 'none' + X-Frame-Options: DENY
```

Baseline headers on every matched response: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`, and
`Strict-Transport-Security: max-age=31536000; includeSubDomains` when the
forwarded protocol is https.

There is **no `script-src` / `default-src` CSP** on application pages. The only
`script-src`-adjacent hardening is `Content-Security-Policy: sandbox` on
downloadable artifact and NDJSON responses.

## 8. Service-to-service authentication

None exists. There are no API keys, no HMAC-signed inbound requests, no OAuth
client credentials and no mTLS. The only outbound authenticated call is AWS
SigV4 to the S3 object store.
