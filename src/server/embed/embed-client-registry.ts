import type { EmbedClient, EmbedClientReader } from "@/platform/embed/types";
import {
  DEFAULT_EMBED_FEATURES,
  DEFAULT_EMBED_THEME,
  normalizeOrigin,
} from "@/platform/embed/resolve-embed";

/**
 * Client embed registry (#27).
 *
 * Client-specific presentation is configuration, never a fork of product
 * logic, so the whole registry is data loaded from `VORTEX_EMBED_CLIENTS`.
 * Adding a manufacturer is an environment change, not a code change.
 */
export class InvalidEmbedClientConfig extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmbedClientConfig";
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidEmbedClientConfig(`Embed client ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidEmbedClientConfig(`Embed client ${field} must be a non-empty array.`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

function parseClient(raw: unknown): EmbedClient {
  if (!raw || typeof raw !== "object") {
    throw new InvalidEmbedClientConfig("Each embed client must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const id = requireString(record.id, "id");
  const origins = requireStringArray(record.allowedOrigins, `${id}.allowedOrigins`);

  for (const origin of origins) {
    // A wildcard would let any host — including one an attacker controls —
    // frame a client's customer session, so a pattern-shaped or unparseable
    // origin is rejected outright rather than normalized into something
    // permissive.
    if (origin.includes("*") || !normalizeOrigin(origin)) {
      throw new InvalidEmbedClientConfig(
        `Embed client ${id} lists ${origin}, which is not an exact origin. Wildcards are not supported.`,
      );
    }
  }

  const completion = (record.completion ?? {}) as Record<string, unknown>;
  const mode = completion.mode;

  return {
    id,
    name: requireString(record.name, `${id}.name`),
    status: record.status === "disabled" ? "disabled" : "active",
    allowedOrigins: origins.map((origin) => normalizeOrigin(origin)!),
    productIds: requireStringArray(record.productIds, `${id}.productIds`),
    theme: { ...DEFAULT_EMBED_THEME, ...(record.theme as object | undefined) },
    features: { ...DEFAULT_EMBED_FEATURES, ...(record.features as object | undefined) },
    completion: {
      mode: mode === "quote" || mode === "inquiry" ? mode : "save",
      ctaLabel:
        typeof completion.ctaLabel === "string" && completion.ctaLabel.trim()
          ? completion.ctaLabel.trim()
          : "Save design",
      confirmationText:
        typeof completion.confirmationText === "string" && completion.confirmationText.trim()
          ? completion.confirmationText.trim()
          : "Your design has been sent back to the store.",
    },
  };
}

export function parseEmbedClients(raw: string): EmbedClient[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidEmbedClientConfig("VORTEX_EMBED_CLIENTS must contain valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new InvalidEmbedClientConfig("VORTEX_EMBED_CLIENTS must be a JSON array of clients.");
  }
  const clients = parsed.map(parseClient);
  const ids = new Set<string>();
  for (const client of clients) {
    if (ids.has(client.id)) {
      throw new InvalidEmbedClientConfig(`Embed client ${client.id} is declared more than once.`);
    }
    ids.add(client.id);
  }
  return clients;
}

export class StaticEmbedClientRegistry implements EmbedClientReader {
  private readonly byId: ReadonlyMap<string, EmbedClient>;

  constructor(clients: readonly EmbedClient[]) {
    this.byId = new Map(clients.map((client) => [client.id, client]));
  }

  find(clientId: string): EmbedClient | null {
    return this.byId.get(clientId) ?? null;
  }

  list(): EmbedClient[] {
    return [...this.byId.values()];
  }
}

let registry: EmbedClientReader | null = null;

export function getEmbedClientRegistry(): EmbedClientReader {
  if (!registry) {
    const raw = process.env.VORTEX_EMBED_CLIENTS?.trim();
    registry = new StaticEmbedClientRegistry(raw ? parseEmbedClients(raw) : []);
  }
  return registry;
}

/** Test seam; production code always goes through the environment. */
export function setEmbedClientRegistry(next: EmbedClientReader | null) {
  registry = next;
}
