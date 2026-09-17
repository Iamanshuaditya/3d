/**
 * Reference tables for the developer documentation.
 *
 * Every row here is checked against the code that implements it: the session
 * contract in `src/lib/embed/editor-session-types.ts`, the host↔frame protocol
 * in `src/lib/embed/protocol.ts`, the client contract in
 * `src/platform/embed/types.ts`, and the validation in
 * `src/server/embed/editor-session-service.ts`. Change one of those and this
 * file is part of the change.
 */

export type DocsSectionLink = { id: string; label: string };

export const DOCS_NAV: ReadonlyArray<{ group: string; items: DocsSectionLink[] }> = [
  { group: "Start", items: [
    { id: "choose", label: "Choose your integration" },
    { id: "concepts", label: "How it fits together" },
  ] },
  { group: "Hosted editor", items: [
    { id: "hosted", label: "Overview" },
    { id: "hosted-create", label: "1 · Create a session" },
    { id: "hosted-open", label: "2 · Open the editor" },
    { id: "hosted-verify", label: "3 · Verify and download" },
  ] },
  { group: "Embedded configurator", items: [
    { id: "embed", label: "Overview" },
    { id: "embed-inline", label: "Inline on your page" },
    { id: "embed-modal", label: "As a modal" },
    { id: "embed-events", label: "Events" },
  ] },
  { group: "Platforms", items: [
    { id: "wordpress", label: "WordPress / WooCommerce" },
    { id: "shopify", label: "Shopify" },
    { id: "nocode", label: "Squarespace, Wix, Webflow" },
  ] },
  { group: "Reference", items: [
    { id: "products", label: "Products" },
    { id: "fields", label: "Session fields" },
    { id: "result", label: "Result shape" },
    { id: "errors", label: "Errors" },
    { id: "limits", label: "Limits and security" },
    { id: "operator", label: "Operator setup" },
  ] },
];

export const PRODUCTS: ReadonlyArray<[string, string, string, string]> = [
  ["Mailer box", "mailer-box-001", "PDF artwork + dieline", "ready"],
  ["Paper coffee cup", "coffee-cup", "PDF label artwork", "ready"],
  ["Stand-up pouch", "blender-pouch-v3-preview", "Visual preview, no PDF", "saved"],
];

/** POST /api/v1/editor-sessions request body. */
export const SESSION_FIELDS: ReadonlyArray<[string, string, string]> = [
  ["productId", "string · required", "Max 160 characters. Must be in your client's enabled product list."],
  ["hostOrigin", "string", "Defaults to your first registered origin. Must be one you registered, exactly."],
  ["returnUrl", "string", "Max 2048 characters. Must resolve to the same origin as hostOrigin. Defaults to that origin."],
  ["referenceId", "string", "Your own cart or order reference. Max 200 characters. Echoed back when you read the session."],
  ["mode", '"pdf" | "preview"', "Defaults to the product's own default, downgraded to preview if your client cannot download artifacts."],
  ["resumeSessionId", "string", "Continue an existing design. The product and hostOrigin must match the original."],
  ["optionSelection", "object", "Pre-selects product options, such as structural dimensions. Ignored when resuming."],
];

/** Frame → host messages, from `EmbedOutboundMessage`. */
export const EMBED_EVENTS: ReadonlyArray<[string, string, string]> = [
  ["ready", "productId, clientId, sessionId?", "The configurator mounted. Hide your own loading state here."],
  ["resize", "heightPx", "Content height changed. The loader resizes the iframe unless autoResize is false."],
  ["busy", "busy, label", "Long-running work started or finished. Reflect it in your own UI if you want."],
  ["completed", "mode, projectId, revision, productId, configurationId, sessionId?, result?", "The customer finished. This is the reference you store."],
  ["error", "code, message", "Something failed. See the error codes below."],
];

/** Host → frame messages, from `EmbedInboundMessage`. */
export const EMBED_COMMANDS: ReadonlyArray<[string, string]> = [
  ["editor.complete()", "Triggers completion from your own button instead of the configurator's."],
  ["editor.remeasure()", "Ask the frame to re-measure after you changed the surrounding layout."],
  ["editor.destroy()", "Remove the iframe and detach the message listener."],
];

export const API_ERRORS: ReadonlyArray<[string, string, string]> = [
  ["400", "INVALID_REQUEST, INVALID_PRODUCT, INVALID_MODE, INVALID_REFERENCE, INVALID_SESSION, INVALID_RETURN_URL", "Fix the request body."],
  ["401", "INVALID_API_KEY, INVALID_EDITOR_SESSION, EDITOR_SESSION_EXPIRED", "Bad or missing key, or an editor session past its hour."],
  ["403", "EDITOR_NOT_ALLOWED, EDITOR_SESSION_DISABLED, EDITOR_SCOPE_FORBIDDEN", "The product or origin is not enabled for your integration."],
  ["404", "—", "Unknown session."],
  ["409", "EDITOR_SESSION_MISMATCH", "The design is not finished, or the revision moved under you."],
  ["422", "PRINT_EXPORT_UNAVAILABLE", "This product or integration is preview-only. Use mode: preview."],
  ["429", "—", "Rate limited. 60 session creations per minute per client."],
];

/** From `EmbedErrorCode`. These arrive on the `error` event, not as HTTP. */
export const EMBED_ERRORS: ReadonlyArray<[string, string]> = [
  ["UNKNOWN_CLIENT", "The client id is not registered on this Vortex host."],
  ["CLIENT_DISABLED", "The client exists but its status is disabled."],
  ["MISSING_HOST_ORIGIN", "The frame URL had no host parameter. Use the loader rather than a hand-written iframe."],
  ["ORIGIN_NOT_ALLOWED", "The page's origin is not on the client's registered list. Exact match, no wildcards."],
  ["PRODUCT_NOT_ENABLED", "That product is not in this client's enabled catalogue subset."],
  ["PRODUCT_UNAVAILABLE", "The product exists but could not be resolved."],
  ["SESSION_FAILED", "The editor session could not be established."],
  ["SAVE_FAILED", "The design could not be saved."],
  ["EXPORT_FAILED", "The print-ready artifact could not be produced."],
  ["UPLOAD_REJECTED", "The customer's upload was refused."],
];

/** From `EmbedFeatures`. Everything defaults to false in the resolver. */
export const EMBED_FEATURES: ReadonlyArray<[string, string]> = [
  ["text", "Add and edit type on the design surface."],
  ["uploads", "Upload artwork and logos."],
  ["background", "Change the background colour or fill."],
  ["adjust", "Reposition, scale and crop placed artwork."],
  ["preview3d", "Live 3D preview beside the 2D editor."],
  ["unfold", "Flat/folded structural control, where the construction supports it."],
  ["downloadArtifact", "Let the customer download the print-ready file themselves. Also required for mode: pdf."],
];
