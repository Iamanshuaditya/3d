/**
 * Every snippet on the developer page.
 *
 * Kept as data so the page stays markup and the examples stay reviewable in
 * one place. They are written to be pasted and edited, not to be clever: no
 * helper indirection, explicit error handling, and the failure modes a real
 * integration meets spelled out rather than omitted for brevity.
 */

export const CREATE_SESSION = `// Your backend: POST /api/design-session
const response = await fetch(VORTEX_URL + "/api/v1/editor-sessions", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.VORTEX_API_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    productId: "mailer-box-001",
    returnUrl: "https://shop.example.com/design-complete",
    referenceId: cartItemId          // your reference, echoed back later
  })
});
if (!response.ok) throw new Error("Could not create editor session");
const session = await response.json();
// Store session.sessionId with your cart item.
// Return session to your browser.`;

export const SESSION_RESPONSE = `{
  "sessionId": "8f2c...",
  "productId": "mailer-box-001",
  "editorUrl": "https://vortex.example.com/editor/acme/mailer-box-001#vxs_...",
  "returnUrl": "https://shop.example.com/design-complete",
  "expiresAt": "2026-09-18T15:04:05.000Z",
  "mode": "pdf",
  "capabilities": { "pdf": true, "svg": true }
}`;

export const OPEN_EDITOR = `<script>
  async function customize() {
    const response = await fetch("/api/design-session", { method: "POST" });
    if (!response.ok) throw new Error("Could not open editor");
    const session = await response.json();
    window.location.assign(session.editorUrl);
  }
</script>
<button onclick="customize()">Customize</button>`;

export const VERIFY_DOWNLOAD = `// Your backend: use the sessionId stored with your cart item.
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
const bytes = await pdf.arrayBuffer();`;

export const RESULT_SHAPE = `{
  "sessionId": "8f2c...",
  "projectId": "b41e...",
  "productId": "mailer-box-001",
  "revision": 7,
  "status": "ready",                 // "ready" = artifact exists, "saved" = preview only
  "mode": "pdf",
  "artifact": {
    "id": "a7d1...",
    "filename": "mailer-box-001.pdf",
    "mimeType": "application/pdf",
    "byteSize": 481203,
    "sha256": "9c1f...",
    "downloadUrl": "/api/v1/production-artifacts/a7d1.../content"
  },
  "warnings": [
    { "code": "BLEED_TIGHT", "message": "Artwork reaches the bleed edge." }
  ]
}`;

export const EMBED_INLINE = `<div id="vortex"></div>
<script src="https://vortex.example.com/embed/vortex-embed.js"></script>
<script>
  var editor = Vortex.mount(document.getElementById("vortex"), {
    baseUrl: "https://vortex.example.com",
    client:  "acme-packaging",       // your registered client id
    product: "mailer-box-001",
    initialHeight: 720,              // before the first resize message

    onReady: function () {
      document.getElementById("loading").hidden = true;
    },
    onComplete: function (message) {
      // Store these against your cart line. Nothing here is a secret.
      document.querySelector("[name='vortex_project']").value = message.projectId;
      document.querySelector("[name='vortex_revision']").value = message.revision;
      document.querySelector("form").submit();
    },
    onError: function (error) {
      console.error(error.code, error.message);
    }
  });
</script>`;

export const EMBED_MODAL = `// Needs an editorUrl from your server, so the modal is only for
// integrations that already have a backend. The loader refuses any URL
// whose host parameter is not this page's own origin.
const session = await fetch("/api/design-session", { method: "POST" }).then(r => r.json());

Vortex.open({
  editorUrl: session.editorUrl,
  title: "Make it yours",
  closeOnComplete: true,
  onComplete: function (result) {
    window.location.assign("/cart");
  }
});`;

export const EMBED_EVENTS_RAW = `// Without the loader, you own the origin check. Do not skip it:
// any page can post to your window.
window.addEventListener("message", function (event) {
  if (event.origin !== "https://vortex.example.com") return;
  var data = event.data;
  if (!data || data.namespace !== "vortex-embed" || data.version !== 1) return;

  var message = data.payload;
  if (message.type === "completed") {
    saveToCart(message.projectId, message.revision);
  }
});`;

export const WORDPRESS_SHORTCODE = `<?php
/**
 * Plugin Name: Vortex Configurator
 * Paste into a site-specific plugin, not into your theme.
 */

// [vortex product="mailer-box-001"]
add_shortcode( 'vortex', function ( $atts ) {
    $atts = shortcode_atts( array( 'product' => '' ), $atts );
    $base   = esc_url( get_option( 'vortex_base_url' ) );
    $client = esc_attr( get_option( 'vortex_client_id' ) );

    wp_enqueue_script( 'vortex-embed', $base . '/embed/vortex-embed.js', array(), null, true );

    return sprintf(
        '<div class="vortex-mount" data-base="%s" data-client="%s" data-product="%s"></div>',
        $base, $client, esc_attr( $atts['product'] )
    );
} );`;

export const WORDPRESS_PHP = `<?php
// Path A on WordPress: WordPress has PHP, so keep the key server-side and
// get a verified PDF rather than trusting the browser.
// Put VORTEX_API_KEY in wp-config.php, never in a theme or a page.

add_action( 'wp_ajax_vortex_session',        'vortex_create_session' );
add_action( 'wp_ajax_nopriv_vortex_session', 'vortex_create_session' );

function vortex_create_session() {
    check_ajax_referer( 'vortex_session' );

    $response = wp_remote_post( VORTEX_URL . '/api/v1/editor-sessions', array(
        'timeout' => 15,
        'headers' => array(
            'Authorization' => 'Bearer ' . VORTEX_API_KEY,
            'Content-Type'  => 'application/json',
        ),
        'body' => wp_json_encode( array(
            'productId'   => sanitize_text_field( $_POST['product'] ),
            'returnUrl'   => home_url( '/design-complete' ),
            'referenceId' => WC()->session->get_customer_id(),
        ) ),
    ) );

    if ( is_wp_error( $response ) || 201 !== wp_remote_retrieve_response_code( $response ) ) {
        wp_send_json_error( array( 'message' => 'Could not open the editor.' ), 502 );
    }

    $session = json_decode( wp_remote_retrieve_body( $response ), true );
    WC()->session->set( 'vortex_session_id', $session['sessionId'] );
    wp_send_json_success( array( 'editorUrl' => $session['editorUrl'] ) );
}`;

export const WOOCOMMERCE_CART = `<?php
// Carry the design onto the cart line, then onto the order.

add_filter( 'woocommerce_add_cart_item_data', function ( $data ) {
    if ( ! empty( $_POST['vortex_project'] ) ) {
        $data['vortex_project']  = sanitize_text_field( $_POST['vortex_project'] );
        $data['vortex_revision'] = absint( $_POST['vortex_revision'] );
        // Makes each design its own cart line instead of bumping quantity.
        $data['unique_key'] = md5( $data['vortex_project'] . $data['vortex_revision'] );
    }
    return $data;
} );

add_action( 'woocommerce_checkout_create_order_line_item', function ( $item, $key, $values ) {
    if ( isset( $values['vortex_project'] ) ) {
        $item->add_meta_data( 'Design',   $values['vortex_project'], true );
        $item->add_meta_data( 'Revision', $values['vortex_revision'], true );
    }
}, 10, 3 );

// Never fulfill on the browser's word. Confirm server-side before production.
add_action( 'woocommerce_order_status_processing', function ( $order_id ) {
    $session_id = WC()->session->get( 'vortex_session_id' );
    $response = wp_remote_get( VORTEX_URL . '/api/v1/editor-sessions/' . $session_id, array(
        'headers' => array( 'Authorization' => 'Bearer ' . VORTEX_API_KEY ),
    ) );
    // Store the artifact against the order only when status is "ready".
} );`;

export const SHOPIFY_LIQUID = `{% comment %}
  sections/vortex-configurator.liquid — theme app extension or custom section.
  Register BOTH origins with Vortex: your-store.myshopify.com and your
  custom domain. There are no wildcards.
{% endcomment %}

<div id="vortex"></div>

<form action="/cart/add" method="post" id="vortex-form">
  <input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
  <input type="hidden" name="properties[_vortex_project]" id="vortex-project">
  <input type="hidden" name="properties[_vortex_revision]" id="vortex-revision">
  <button type="submit" disabled id="vortex-add">Finish your design first</button>
</form>

<script src="https://vortex.example.com/embed/vortex-embed.js" defer></script>
<script>
  document.addEventListener("DOMContentLoaded", function () {
    Vortex.mount(document.getElementById("vortex"), {
      baseUrl: "https://vortex.example.com",
      client:  "acme-packaging",
      product: "{{ product.metafields.vortex.product_id }}",
      onComplete: function (message) {
        document.getElementById("vortex-project").value  = message.projectId;
        document.getElementById("vortex-revision").value = message.revision;
        var button = document.getElementById("vortex-add");
        button.disabled = false;
        button.textContent = "Add to cart";
      }
    });
  });
</script>`;

export const SHOPIFY_APP = `// Shopify app (Remix) route — the path that gets you a verified PDF.
// A theme alone cannot hold an API key; this needs a real app backend.
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const created = await fetch(process.env.VORTEX_URL + "/api/v1/editor-sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.VORTEX_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      productId: form.get("productId"),
      hostOrigin: "https://" + session.shop,   // must be registered with Vortex
      returnUrl: "https://" + session.shop + "/pages/design-complete",
      referenceId: form.get("cartToken")
    })
  });
  if (!created.ok) throw new Response("Could not create session", { status: 502 });

  const launch = await created.json();
  // Persist launch.sessionId against the cart token in your app's database,
  // then verify it server-side from your orders/create webhook.
  return json({ editorUrl: launch.editorUrl });
}`;

export const NOCODE_EMBED = `<!-- Squarespace: a Code Block. Wix: an HTML iframe element.
     Webflow: an Embed component. Same markup in all three. -->

<div id="vortex" style="min-height:720px"></div>
<script src="https://vortex.example.com/embed/vortex-embed.js"></script>
<script>
  Vortex.mount(document.getElementById("vortex"), {
    baseUrl: "https://vortex.example.com",
    client:  "acme-packaging",
    product: "mailer-box-001",
    onComplete: function (message) {
      // No backend here, so there is nowhere secure to put this.
      // Use completion mode "inquiry" or "quote" and let Vortex record it,
      // or paste the reference into your own form field.
      document.getElementById("design-reference").value = message.projectId;
    }
  });
</script>`;

export const EMBED_CLIENTS_ENV = `[
  {
    "id": "acme-packaging",
    "name": "Acme Packaging",
    "status": "active",
    "allowedOrigins": [
      "https://shop.example.com",
      "https://acme.myshopify.com"
    ],
    "productIds": ["mailer-box-001", "coffee-cup"],
    "theme": { "accent": "#17191c", "radiusPx": 8 },
    "features": {
      "text": true, "uploads": true, "background": true,
      "adjust": true, "preview3d": true, "unfold": false,
      "downloadArtifact": false
    },
    "completion": {
      "mode": "save",
      "ctaLabel": "Save design",
      "confirmationText": "Your design has been sent back to the store."
    }
  }
]`;

export const OPERATOR_SETUP = `# Node 24+, from the Vortex repository.
node scripts/create-integration-client.mjs acme \\
  https://shop.example.com \\
  https://vortex.example.com

# Writes .data/integrations/acme/vortex.env and merchant.env with
# permissions 0600, without printing the key.
#
# 1. Merge the generated client into VORTEX_EMBED_CLIENTS.
# 2. Set VORTEX_PUBLIC_URL to the public HTTPS URL.
# 3. Restart Vortex — the registry is read once at boot.
# 4. Send merchant.env to the partner privately. Never commit it.`;
