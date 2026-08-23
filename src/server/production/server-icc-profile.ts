import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IccProfileLoader } from "@/lib/print/types";
import { srgb2014ProfileBytes } from "@/lib/print/srgb2014-profile";

function assertIntegrity(
  id: string,
  bytes: Uint8Array,
  expectedLength: number,
  expectedSha256: string,
) {
  if (bytes.byteLength !== expectedLength) {
    throw new Error(`ICC profile ${id} has an unexpected byte length.`);
  }
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== expectedSha256) {
    throw new Error(`ICC profile ${id} failed its SHA-256 integrity check.`);
  }
}

const PUBLIC_PROFILE_LOADERS: Readonly<Record<string, () => Promise<Uint8Array>>> = {
  // Keep filesystem-backed profiles explicit. Besides preventing a product
  // definition from turning this into an arbitrary file reader, the literal
  // path lets Next's standalone file tracer package only the approved asset.
  "/print-profiles/Coated_Fogra39L_VIGC_260.icc": async () =>
    readFile(
      join(
        process.cwd(),
        "public",
        "print-profiles",
        "Coated_Fogra39L_VIGC_260.icc",
      ),
    ),
};

export function createServerIccProfileLoader(): IccProfileLoader {
  const cache = new Map<string, Promise<Uint8Array>>();
  return async (profile) => {
    const existing = cache.get(profile.id);
    if (existing) return existing;
    const pending = (async () => {
      if (profile.source.kind === "embedded-srgb2014") return srgb2014ProfileBytes();
      let bytes: Uint8Array;
      if (profile.source.url.startsWith("/")) {
        const loadPublicProfile = PUBLIC_PROFILE_LOADERS[profile.source.url];
        if (!loadPublicProfile) {
          throw new Error(`ICC profile ${profile.id} is not in the server profile registry.`);
        }
        bytes = await loadPublicProfile();
      } else {
        const url = new URL(profile.source.url);
        if (url.protocol !== "https:") {
          throw new Error(`ICC profile ${profile.id} must use HTTPS.`);
        }
        const response = await fetch(url, { redirect: "error" });
        if (!response.ok) throw new Error(`ICC profile ${profile.id} could not be loaded.`);
        bytes = new Uint8Array(await response.arrayBuffer());
      }
      assertIntegrity(
        profile.id,
        bytes,
        profile.source.byteLength,
        profile.source.sha256,
      );
      return bytes;
    })().catch((error) => {
      cache.delete(profile.id);
      throw error;
    });
    cache.set(profile.id, pending);
    return pending;
  };
}
