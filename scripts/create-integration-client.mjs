import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [id, originInput, apiInput] = process.argv.slice(2);
if (!id || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id) || !originInput || !apiInput) {
  throw new Error("Usage: node scripts/create-integration-client.mjs <client-id> <https://shop.example.com> <https://vortex.example.com>");
}
const origin = new URL(originInput);
const api = new URL(apiInput);
for (const url of [origin, api]) {
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Provide exact HTTPS origins without credentials, paths, queries or fragments.");
  }
}
const key = "vx_live_" + randomBytes(32).toString("base64url");
const client = {
  id, name: id, allowedOrigins: [origin.origin],
  productIds: ["blender-pouch-v3-preview", "mailer-box-001", "coffee-cup"],
  apiKeySha256: createHash("sha256").update(key).digest("hex"),
  features: { text: true, uploads: true, background: true, adjust: true, preview3d: true, unfold: true, downloadArtifact: true },
  completion: { ctaLabel: "Finish design", confirmationText: "Your design is ready." }
};
const parent = resolve(".data/integrations");
await mkdir(parent, { recursive: true, mode: 0o700 });
const directory = resolve(parent, id);
// Existing clients must be rotated deliberately; never silently replace keys.
await mkdir(directory, { mode: 0o700 });
await writeFile(resolve(directory, "vortex.env"), `VORTEX_PUBLIC_URL=${api.origin}\nVORTEX_EMBED_CLIENTS='${JSON.stringify([client])}'\n`, { mode: 0o600, flag: "wx" });
await writeFile(resolve(directory, "merchant.env"), `VORTEX_API_URL=${api.origin}\nVORTEX_API_KEY=${key}\n`, { mode: 0o600, flag: "wx" });
console.log(`Created private integration configuration in ${directory}. The API key was not printed.`);
