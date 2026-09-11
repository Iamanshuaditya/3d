# Vortex editor API — quick start

You need your **Vortex host URL**, a **server API key**, and your website's registered origin (for example `https://shop.example.com`). No editor installation is required.

**See it happen:** open `/developers/demo`, choose Stand-up pouch, and click **Send API request**. Inspect the live `201` response and `editorUrl`, then click **Open full-page editor**. The editor opens on its own route. **Back** saves pending edits and returns to the demo. Select automatic opening to combine the request and navigation into one button. The playground uses the local development endpoint; the integration below uses your authenticated merchant API.

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

Optional body fields: `hostOrigin` (defaults to your first registered origin), `returnUrl` (must be on that origin; defaults to its home page), `referenceId` (your cart/order reference, max 200 characters), `mode: "pdf" | "preview"` (product default when omitted), `resumeSessionId` (continue an existing design). Your backend chooses the allowed product and associates the session with its customer; Vortex does not authenticate your storefront users.

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

No browser SDK is required. The `/editor/...` route includes the same artwork tools, 3D preview, inflation and folding controls as the studio. **Save design / Finish** completes the current revision. **Back** saves pending edits and navigates to `returnUrl`, adding `vortexSessionId`. Returning is not proof that a production PDF exists: your backend must verify the session associated with its cart item.

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

| Product | productId | Default completion |
| --- | --- | --- |
| Mailer box | `mailer-box-001` | `ready`: PDF artwork and dieline |
| Paper coffee cup | `coffee-cup` | `ready`: PDF label artwork |
| Original stand-up pouch | `blender-pouch-v3-preview` | `saved`: visual preview, no PDF |

**Print scope:** review `result.warnings` with your printer. A generated PDF is not manufacturer certification. The cup exports a rectangular artwork area, not a curved manufacturing dieline. The original pouch is a visual prototype; requesting `mode: "pdf"` returns 422.

**Lifecycle:** `editing` → `ready` (PDF) or `saved` (preview). Further saved edits invalidate the previous completion until the customer finishes again. Editor URLs expire after one hour. POST the same `productId` and `resumeSessionId` to continue the same saved project/version; this rotates the browser token and invalidates the previous URL. Server status/download remain available after browser expiry. Sessions are isolated per merchant and project.

**Errors:** JSON `{ error: { code, message } }`; 400 invalid input, 401 invalid key/expired browser session, 403 product/origin disabled, 404 unknown session, 409 design not finished or revision changed, 422 PDF unavailable, 429 rate limit. Display a retry message; do not fulfill from a browser callback alone.

**Keys and URLs:** send the merchant key only from your backend. Treat `editorUrl` as a temporary secret; don't log or publish it. It contains a scoped token in its URL fragment, so third-party cookies are not required. Register exact HTTPS origins for production. If your host uses CSP, allow your Vortex host in `script-src`, `style-src` and `frame-src`. Do not alter the returned URL.

## Vortex operator: one-time setup

Run Node 24+ from the Vortex repository:

```sh
node scripts/create-integration-client.mjs acme https://shop.example.com https://YOUR-VORTEX-HOST
```

This creates private `.data/integrations/acme/vortex.env` and `merchant.env` files without printing the key. Configure Vortex's `VORTEX_EMBED_CLIENTS` with the generated client (merge into the existing array if needed), and `VORTEX_PUBLIC_URL` with its public HTTPS URL. Restart Vortex. Configure the partner backend with `VORTEX_API_URL` and `VORTEX_API_KEY` from `merchant.env`. Send these privately. Never put `merchant.env` into frontend code or source control.

The local `/developers/demo` works without a key only under `npm run dev` on localhost. It keeps its temporary session in browser session storage so the request, response and saved design survive the trip to the editor and back. Open `http://127.0.0.1:3000/developers/demo` to test a host and editor on different origins. This demo endpoint and its client are disabled in production. Production deployment, backups and printer approval remain operator responsibilities.
