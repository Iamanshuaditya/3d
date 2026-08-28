# Embeddable configurator

Issue #27. A packaging manufacturer puts the customization experience on their
own website so their customer can pick a product, upload artwork and inspect an
accurate 3D preview without waiting for a physical sample. That makes the
configurator an integration surface with a contract, not the internal Studio
with its chrome hidden.

## Iframe, not a JS component

The frame is the product; `vortex-embed.js` is a loader and a message bridge.

- **Isolation the browser enforces.** Host CSS cannot reach into the editor and
  editor CSS cannot leak out. A component library would depend on convention.
- **No dependency collision.** The editor ships three.js, Konva and React.
  Injecting that into an arbitrary host page fights their bundler and their
  React version.
- **Update without a host deploy.** The editor changes behind a stable
  postMessage contract; manufacturers do not ship a new SDK to get fixes.
- **Least privilege.** The host page never gets DOM access to upload controls or
  to the customer's session.

The cost is that layout is negotiated rather than automatic, which is what the
`resize` message exists for.

## Setting up a client

Clients are data in `VORTEX_EMBED_CLIENTS`, never a code fork:

```jsonc
[
  {
    "id": "acme-packaging",
    "name": "Acme Packaging",
    "status": "active",
    // Exact origins only. Wildcards are rejected at load.
    "allowedOrigins": ["https://shop.acme.example"],
    "productIds": ["nexibles-rstz-190x265-110"],
    "theme": { "accent": "#c2410c", "radiusPx": 4 },
    "features": { "uploads": true, "adjust": true, "preview3d": true },
    "completion": {
      "mode": "quote",
      "ctaLabel": "Request a quote",
      "confirmationText": "Your design was sent to Acme."
    }
  }
]
```

Every feature defaults to `false`. Shipping a new capability therefore never
switches it on inside a live client's site — enabling it is their decision.

## Host integration

```html
<div id="configurator"></div>
<script src="https://configurator.example.com/embed/vortex-embed.js"></script>
<script>
  const session = Vortex.mount(document.getElementById("configurator"), {
    baseUrl: "https://configurator.example.com",
    client: "acme-packaging",
    product: "nexibles-rstz-190x265-110",
    project: existingProjectId, // optional: reopen a saved design
    onComplete: (result) => saveToOrder(result.projectId, result.revision),
    onError: (error) => showBanner(error.message),
  });
</script>
```

A complete working page is in [`examples/embed/index.html`](../../examples/embed/index.html).

### Messages

Frame → host:

| Type | Payload | Meaning |
|---|---|---|
| `ready` | `clientId`, `productId` | Mounted and accepting host messages |
| `resize` | `heightPx` | Content height changed |
| `busy` | `busy`, `label` | Long-running work the host may reflect |
| `completed` | `mode`, `projectId`, `revision`, `productId`, `configurationId` | A durable reference to store |
| `error` | `code`, `message` | Something the host should surface |

Host → frame: `remeasure`, `complete`.

Every message is namespaced `vortex-embed` and carries a protocol version. A
host that integrated against v1 keeps working when the editor inside the frame
is rewritten.

`completed` is only emitted after the revision is durably saved. A host storing
the reference against a quote can always load exactly what the customer saw.

## Security model

**Framing.** `src/proxy.ts` sets `frame-ancestors` per request from the client's
registered origins. Everything outside `/embed/:client/:product` gets
`frame-ancestors 'none'` and `X-Frame-Options: DENY`, so the Studio and the
operator console can never be framed. An unknown or disabled client falls back
to no framing at all.

**Origin.** The host origin is declared in the frame URL and checked against the
client's exact allow-list. `https://shop.acme.example.attacker.test` is not
`https://shop.acme.example`, and a scheme or port change is a different origin.
Outbound messages are posted to that exact origin, never `*`, so a customer's
project reference cannot be broadcast to whatever page happens to be framing.

**Sessions.** A `SameSite=Lax` cookie is not sent when the top-level site
belongs to the manufacturer, so an embedded session would have no durable
identity and every save would land under a new guest. Embedded requests
therefore receive `SameSite=None; Secure; Partitioned`. CHIPS gives each
top-level site its own cookie jar, which also means one client's customers can
never inherit another client's session — isolation enforced by the browser
rather than by our own checks.

**This requires HTTPS.** Over plain HTTP the cookie stays `Lax`, because
`SameSite=None` without `Secure` is rejected by browsers and emitting it would
produce a session that fails with nothing explaining why. Embedding is an
HTTPS-only capability; local development works same-origin.

**Internal surface.** The embed shell has no catalogue switcher, no account
control, no operator export and no admin route. The resolved config handed to
the frame carries branding, enabled tools and completion wording — not the
origin allow-list, not other clients, not operator permissions.

## Where to look

| Concern | File |
|---|---|
| Contract types | `src/platform/embed/types.ts` |
| Resolution and origin policy | `src/platform/embed/resolve-embed.ts` |
| Client registry | `src/server/embed/embed-client-registry.ts` |
| Message protocol | `src/lib/embed/protocol.ts` |
| Frame shell | `src/components/embed/EmbedShell.tsx` |
| Host bridge | `src/components/embed/use-embed-host.ts` |
| Framing policy | `src/proxy.ts` |
| Host loader | `public/embed/vortex-embed.js` |
