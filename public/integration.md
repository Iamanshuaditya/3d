# Vortex editor API — quick start

Two ways to put the packaging editor on your site. Pick by answering one question: **can your website keep a secret?**

| | Hosted editor | Embedded configurator |
| --- | --- | --- |
| Backend required | Yes | No |
| API key | Server-side only | None |
| Where the customer designs | On Vortex, full page | Inside your own page |
| Access granted by | Merchant API key | Client id + exactly registered origin |
| What comes back | A session your server verifies | `projectId` + `revision`, as a browser event |
| Safe to fulfil from directly | Yes, after the server check | No — confirm server-side first |
| Good for | Custom stacks, WooCommerce, a Shopify app | Squarespace, Wix, Webflow, Shopify themes |

You can use both: embed the configurator for browsing, and create a hosted session when an order needs a production PDF.

**See it happen:** open `/developers/demo`, choose Stand-up pouch, and click **Send API request**. Inspect the live `201` response and `editorUrl`, then click **Open full-page editor**. The playground uses the local development endpoint; the integration below uses your authenticated merchant API.

---

# Path A — Hosted editor

You need your **Vortex host URL**, a **server API key**, and your website's registered origin (for example `https://shop.example.com`).

## 1. Your server creates a session

```js
// Inside your own POST /api/design-session handler:
const response = await fetch(VORTEX_URL + "/api/v1/editor-sessions", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.VORTEX_API_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    productId: "mailer-box-001",
    returnUrl: "https://shop.example.com/design-complete"
  })
});
if (!response.ok) throw new Error("Could not create editor session");
const session = await response.json();
// Store session.sessionId against the authenticated customer's cart item.
// Return session as JSON to that customer's browser.
```

Response: `{ sessionId, productId, editorUrl, returnUrl, expiresAt, mode, capabilities }`.

Optional body fields: `hostOrigin` (defaults to your first registered origin), `returnUrl` (must be on that origin; defaults to its home page), `referenceId` (your cart/order reference, max 200 characters), `mode: "pdf" | "preview"` (product default when omitted), `resumeSessionId` (continue an existing design), `optionSelection` (pre-select product options such as structural dimensions; ignored when resuming). Your backend chooses the allowed product and associates the session with its customer; Vortex does not authenticate your storefront users.

## 2. Your browser navigates to the full-page editor

```html
<button onclick="customize()">Customize</button>
<script>
async function customize() {
  const response = await fetch("/api/design-session", { method: "POST" });
  if (!response.ok) throw new Error("Could not open editor");
  const session = await response.json();
  window.location.assign(session.editorUrl);
}
</script>
```

No browser SDK is required for this path. The `/editor/...` route includes the same artwork tools, 3D preview, inflation and folding controls as the studio. **Save design / Finish** completes the current revision. **Back** saves pending edits and navigates to `returnUrl`, adding `vortexSessionId`. Returning is not proof that a production PDF exists: your backend must verify the session associated with its cart item.

## 3. Your server verifies the result and downloads the PDF

```js
// Use the sessionId you stored, never an unverified browser/order reference.
const headers = { Authorization: "Bearer " + process.env.VORTEX_API_KEY };
const response = await fetch(
  VORTEX_URL + "/api/v1/editor-sessions/" + sessionId, { headers }
);
if (!response.ok) throw new Error("Could not verify design");
const session = await response.json();
if (session.status !== "ready") throw new Error("PDF is not ready");
const pdf = await fetch(
  new URL(session.result.artifact.downloadUrl, VORTEX_URL), { headers }
);
if (!pdf.ok) throw new Error("Could not download PDF");
const bytes = await pdf.arrayBuffer();
```

The artifact includes `id`, `filename`, `mimeType`, `byteSize`, and `sha256`. The download response is `application/pdf` with `X-Content-SHA256`. Keep the revision, PDF and print notes with your order. Check the status again before fulfillment if you allow further edits.

---

# Path B — Embedded configurator

No API key, no backend. Vortex grants access by your **client id** plus the **exact origin** of the page mounting the frame, and fails closed on anything else.

```html
<div id="vortex"></div>
<script src="https://vortex.example.com/embed/vortex-embed.js"></script>
<script>
  var editor = Vortex.mount(document.getElementById("vortex"), {
    baseUrl: "https://vortex.example.com",
    client:  "acme-packaging",
    product: "mailer-box-001",
    initialHeight: 720,
    onReady:    function () { /* hide your loading state */ },
    onComplete: function (message) {
      // message.projectId, message.revision — store these with your cart line.
    },
    onError:    function (error) { console.error(error.code, error.message); }
  });
</script>
```

`Vortex.mount(container, options)` returns `{ iframe, complete(), remeasure(), destroy() }`. `Vortex.open(options)` shows the same frame in a modal dialog, but requires a server-created `editorUrl`, so it belongs to Path A.

Mount options: `baseUrl`, `client`, `product` (or `editorUrl` instead of all three), `project`, `options`, `title`, `initialHeight` (default 720), `fill`, `autoResize` (default true), `onReady`, `onResize`, `onBusy`, `onComplete`, `onError`.

## Events

Messages are namespaced `vortex-embed` and versioned. The loader checks the frame origin for you; if you listen directly, you must check `event.origin` yourself.

| Event | Payload | Meaning |
| --- | --- | --- |
| `ready` | `productId, clientId, sessionId?` | The configurator mounted |
| `resize` | `heightPx` | Content height changed |
| `busy` | `busy, label` | Long-running work started or finished |
| `completed` | `mode, projectId, revision, productId, configurationId, sessionId?, result?` | The customer finished |
| `error` | `code, message` | See the codes below |

Embed error codes: `UNKNOWN_CLIENT`, `CLIENT_DISABLED`, `MISSING_HOST_ORIGIN`, `ORIGIN_NOT_ALLOWED`, `PRODUCT_NOT_ENABLED`, `PRODUCT_UNAVAILABLE`, `SESSION_FAILED`, `SAVE_FAILED`, `EXPORT_FAILED`, `UPLOAD_REJECTED`. The first five are almost always a registration problem rather than a code problem.

**A `completed` event is a claim, not a receipt.** Use it to move the customer along; confirm server-side before anything is manufactured.

---

# Platform notes

**WordPress / WooCommerce.** WordPress runs PHP, so prefer Path A: put `VORTEX_API_KEY` in `wp-config.php`, create the session from an admin-ajax handler, and carry the design onto the cart with `woocommerce_add_cart_item_data` and onto the order with `woocommerce_checkout_create_order_line_item`. Set a `unique_key` on the cart item data so two different designs are two cart lines rather than quantity 2. Keep all of this in a site-specific plugin, never a theme. Use Path B only where you want the configurator inline on a page.

**Shopify.** A theme has no server you control, so a theme-only integration uses Path B and carries the design as a line item property — `properties[_vortex_project]` and `properties[_vortex_revision]`, underscore-prefixed so they stay hidden. For a verified production PDF you need an app with a real backend, which then uses Path A and passes `hostOrigin: "https://" + session.shop`. **Register both** `your-store.myshopify.com` and the custom domain: origins are matched exactly and wildcards are rejected, so a shop reached on two domains needs two entries.

**Squarespace, Wix, Webflow.** Path B only — a Code Block, an HTML element, or an Embed component, with identical markup. There is no server, so pair it with a completion mode of `quote` or `inquiry` and let Vortex record the design rather than treating a browser event as an order.

---

# Reference

| Product | productId | Default completion |
| --- | --- | --- |
| Mailer box | `mailer-box-001` | `ready`: PDF artwork and dieline |
| Paper coffee cup | `coffee-cup` | `ready`: PDF label artwork |
| Original stand-up pouch | `blender-pouch-v3-preview` | `saved`: visual preview, no PDF |

**Print scope:** review `result.warnings` with your printer. A generated PDF is not manufacturer certification. The cup exports a rectangular artwork area, not a curved manufacturing dieline. The original pouch is a visual prototype; requesting `mode: "pdf"` returns 422, as does any product when your client does not have `downloadArtifact` enabled.

**Lifecycle:** `editing` → `ready` (PDF) or `saved` (preview). Further saved edits invalidate the previous completion until the customer finishes again. Editor URLs expire after one hour. POST the same `productId` and `resumeSessionId` to continue the same saved project/version; this rotates the browser token and invalidates the previous URL. Server status/download remain available after browser expiry. Sessions are isolated per merchant and project.

**Errors:** JSON `{ error: { code, message } }`; 400 invalid input, 401 invalid key/expired browser session, 403 product/origin disabled, 404 unknown session, 409 design not finished or revision changed, 422 PDF unavailable, 429 rate limit. Display a retry message; do not fulfill from a browser callback alone.

**Limits:** 60 session creations per minute per client. Origins are exact — no wildcards, so www and apex, staging, and a store's two domains each need their own entry. The API has no CORS headers: a browser cannot call it cross-origin, by design.

**Keys and URLs:** send the merchant key only from your backend. Treat `editorUrl` as a temporary secret; don't log or publish it. It contains a scoped token in its URL fragment, so third-party cookies are not required. Register exact HTTPS origins for production. If your host uses CSP, allow your Vortex host in `script-src`, `style-src` and `frame-src`. Do not alter the returned URL.

---

# Vortex operator: one-time setup

Run Node 24+ from the Vortex repository:

```sh
node scripts/create-integration-client.mjs acme https://shop.example.com https://YOUR-VORTEX-HOST
```

This creates private `.data/integrations/acme/vortex.env` and `merchant.env` files without printing the key. Configure Vortex's `VORTEX_EMBED_CLIENTS` with the generated client (merge into the existing array if needed), and `VORTEX_PUBLIC_URL` with its public HTTPS URL. Restart Vortex — **the client registry is read once at boot**, so adding a merchant is currently an environment change and a restart, not a self-serve action. Configure the partner backend with `VORTEX_API_URL` and `VORTEX_API_KEY` from `merchant.env`. Send these privately. Never put `merchant.env` into frontend code or source control.

Embed feature flags (`text`, `uploads`, `background`, `adjust`, `preview3d`, `unfold`, `downloadArtifact`) all default to `false`, so shipping a new capability never switches it on inside somebody else's website. `downloadArtifact` is also what permits `mode: "pdf"`.

The local `/developers/demo` works without a key only under `npm run dev` on localhost. It keeps its temporary session in browser session storage so the request, response and saved design survive the trip to the editor and back. Open `http://127.0.0.1:3000/developers/demo` to test a host and editor on different origins. This demo endpoint and its client are disabled in production. Production deployment, backups and printer approval remain operator responsibilities.
