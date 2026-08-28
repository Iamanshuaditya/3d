/**
 * Host ↔ configurator message contract (#27).
 *
 * The host page and the configurator are different origins by design, so this
 * is the entire integration surface between them. Every message is namespaced
 * and versioned: a host that integrated against v1 must keep working when the
 * editor inside the frame is rewritten, and an unrecognised message from an
 * unexpected origin must be indistinguishable from noise.
 */

export const EMBED_PROTOCOL_VERSION = 1 as const;
export const EMBED_MESSAGE_NAMESPACE = "vortex-embed" as const;

export type EmbedErrorCode =
  | "UNKNOWN_CLIENT"
  | "CLIENT_DISABLED"
  | "ORIGIN_NOT_ALLOWED"
  | "PRODUCT_NOT_ENABLED"
  | "MISSING_HOST_ORIGIN"
  | "PRODUCT_UNAVAILABLE"
  | "SESSION_FAILED"
  | "SAVE_FAILED"
  | "UPLOAD_REJECTED";

/** Frame → host. */
export type EmbedOutboundMessage =
  /** The configurator has mounted and is ready for host messages. */
  | { type: "ready"; productId: string; clientId: string }
  /** Content height changed; the host resizes the iframe to match. */
  | { type: "resize"; heightPx: number }
  /** Long-running work the host may reflect in its own UI. */
  | { type: "busy"; busy: boolean; label: string }
  /** A durable reference the host can store against its own order/quote. */
  | {
      type: "completed";
      mode: "save" | "quote" | "inquiry";
      projectId: string;
      revision: number;
      productId: string;
      configurationId: string | null;
    }
  | { type: "error"; code: EmbedErrorCode; message: string };

/** Host → frame. */
export type EmbedInboundMessage =
  /** Ask the frame to re-measure, e.g. after the host changed layout. */
  | { type: "remeasure" }
  /** Programmatically trigger the completion action. */
  | { type: "complete" };

type Envelope<TPayload> = {
  namespace: typeof EMBED_MESSAGE_NAMESPACE;
  version: typeof EMBED_PROTOCOL_VERSION;
  payload: TPayload;
};

export type EmbedOutboundEnvelope = Envelope<EmbedOutboundMessage>;
export type EmbedInboundEnvelope = Envelope<EmbedInboundMessage>;

export function embedEnvelope<TPayload>(payload: TPayload): Envelope<TPayload> {
  return { namespace: EMBED_MESSAGE_NAMESPACE, version: EMBED_PROTOCOL_VERSION, payload };
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.namespace === EMBED_MESSAGE_NAMESPACE &&
    record.version === EMBED_PROTOCOL_VERSION &&
    typeof record.payload === "object" &&
    record.payload !== null
  );
}

const OUTBOUND_TYPES = new Set(["ready", "resize", "busy", "completed", "error"]);
const INBOUND_TYPES = new Set(["remeasure", "complete"]);

/**
 * Parses a message received by the host. `expectedOrigin` is checked by the
 * caller against `MessageEvent.origin`; a message from anywhere else is
 * dropped silently rather than reported, because reporting it would tell an
 * attacker their probe landed.
 */
export function parseOutboundMessage(data: unknown): EmbedOutboundMessage | null {
  if (!isEnvelope(data)) return null;
  const payload = data.payload as { type?: unknown };
  return typeof payload.type === "string" && OUTBOUND_TYPES.has(payload.type)
    ? (payload as EmbedOutboundMessage)
    : null;
}

/** Parses a message received inside the frame from the host page. */
export function parseInboundMessage(data: unknown): EmbedInboundMessage | null {
  if (!isEnvelope(data)) return null;
  const payload = data.payload as { type?: unknown };
  return typeof payload.type === "string" && INBOUND_TYPES.has(payload.type)
    ? (payload as EmbedInboundMessage)
    : null;
}

/** Builds the frame URL a host mounts. The host origin is always declared. */
export function embedFrameUrl(input: {
  baseUrl: string;
  clientId: string;
  productId: string;
  hostOrigin: string;
  projectId?: string | null;
}): string {
  const url = new URL(
    `/embed/${encodeURIComponent(input.clientId)}/${encodeURIComponent(input.productId)}`,
    input.baseUrl,
  );
  url.searchParams.set("host", input.hostOrigin);
  if (input.projectId) url.searchParams.set("project", input.projectId);
  return url.toString();
}
