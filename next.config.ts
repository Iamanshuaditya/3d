import type { NextConfig } from "next";

// Standalone output is for self-hosting: the Dockerfile and `npm start` run
// `.next/standalone/server.js`. A build adapter — Vercel injects one through
// NEXT_ADAPTER_PATH — packages the output itself, and in that case Next never
// writes `.next/next-server.js.nft.json`, yet the standalone step still runs
// after the adapter and fails trying to read it. So the two are exclusive.
const packagedByPlatform = Boolean(process.env.NEXT_ADAPTER_PATH || process.env.VERCEL);

const nextConfig: NextConfig = {
  ...(packagedByPlatform ? {} : { output: "standalone" as const }),
  // The local integration demo uses 127.0.0.1 as the storefront and localhost as the editor.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["better-sqlite3", "sharp"],
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;

// Starts a local Cloudflare platform proxy for `next dev`. It has no role in a
// production build on any host, so it does not run during one.
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
