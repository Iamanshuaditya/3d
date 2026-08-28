import {
  EmbedRejection,
  type EmbedClient,
  type EmbedClientReader,
  type EmbedFeatures,
  type EmbedTheme,
  type ResolvedEmbedConfig,
} from "./types";

/**
 * Everything off by default (#27).
 *
 * A client's enabled tools are an agreement, not a snapshot of what the
 * product happened to support on the day they integrated. Defaulting a new
 * capability to `false` means shipping one never silently turns it on inside
 * somebody else's website.
 */
export const DEFAULT_EMBED_FEATURES: EmbedFeatures = Object.freeze({
  text: false,
  uploads: false,
  background: false,
  adjust: false,
  preview3d: false,
  unfold: false,
  downloadArtifact: false,
});

export const DEFAULT_EMBED_THEME: EmbedTheme = Object.freeze({
  accent: "#1f6feb",
  surface: "#ffffff",
  panel: "#f6f7f9",
  text: "#14171a",
  dim: "#5b6472",
  line: "#e3e6ea",
  radiusPx: 8,
  fontFamily: null,
});

/** Normalizes an origin so comparisons cannot be defeated by a trailing slash. */
export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function embedTheme(client: EmbedClient): EmbedTheme {
  return { ...DEFAULT_EMBED_THEME, ...client.theme };
}

export function embedFeatures(client: EmbedClient): EmbedFeatures {
  return { ...DEFAULT_EMBED_FEATURES, ...client.features };
}

/**
 * Resolves one embed request, failing closed on every axis: unknown or
 * disabled client, an origin the client has not registered, or a product
 * outside their agreed catalogue subset.
 */
export function resolveEmbedConfig(
  clients: EmbedClientReader,
  input: { clientId: string; productId: string; hostOrigin: string | null },
): ResolvedEmbedConfig {
  const client = clients.find(input.clientId);
  if (!client) {
    throw new EmbedRejection("UNKNOWN_CLIENT", "This configurator is not registered.");
  }
  if (client.status !== "active") {
    throw new EmbedRejection("CLIENT_DISABLED", "This configurator is not currently available.");
  }

  if (!input.hostOrigin) {
    throw new EmbedRejection(
      "MISSING_HOST_ORIGIN",
      "The embedding page did not identify itself. Pass the host origin when mounting the configurator.",
    );
  }
  const hostOrigin = normalizeOrigin(input.hostOrigin);
  const allowed = client.allowedOrigins
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);
  if (!hostOrigin || !allowed.includes(hostOrigin)) {
    throw new EmbedRejection(
      "ORIGIN_NOT_ALLOWED",
      "This origin is not registered for this configurator.",
    );
  }

  if (!client.productIds.includes(input.productId)) {
    throw new EmbedRejection(
      "PRODUCT_NOT_ENABLED",
      "This product is not available in this configurator.",
    );
  }

  return {
    clientId: client.id,
    clientName: client.name,
    productId: input.productId,
    hostOrigin,
    theme: embedTheme(client),
    features: embedFeatures(client),
    completion: { ...client.completion },
  };
}

/** The exact origins a client's frame may be embedded by, for `frame-ancestors`. */
export function frameAncestors(client: EmbedClient): string[] {
  return client.allowedOrigins
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);
}
