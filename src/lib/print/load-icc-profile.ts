import type { IccProfileDefinition } from "./types";
import { srgb2014ProfileBytes } from "./srgb2014-profile";

const cache = new Map<string, Promise<Uint8Array>>();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function load(profile: IccProfileDefinition): Promise<Uint8Array> {
  if (profile.source.kind === "embedded-srgb2014") return srgb2014ProfileBytes();

  const response = await fetch(profile.source.url);
  if (!response.ok) {
    throw new Error(`Could not load ICC profile ${profile.label} (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== profile.source.byteLength) {
    throw new Error(
      `ICC profile ${profile.label} has ${bytes.byteLength} bytes; expected ${profile.source.byteLength}.`,
    );
  }
  const digest = toHex(await crypto.subtle.digest("SHA-256", bytes));
  if (digest !== profile.source.sha256) {
    throw new Error(`ICC profile ${profile.label} failed its SHA-256 integrity check.`);
  }
  return bytes;
}

/** Loads and integrity-checks an ICC asset once per browser session. */
export function loadIccProfile(profile: IccProfileDefinition): Promise<Uint8Array> {
  const existing = cache.get(profile.id);
  if (existing) return existing;
  const pending = load(profile);
  cache.set(profile.id, pending);
  return pending;
}
