import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The local integration demo uses 127.0.0.1 as the storefront and localhost as the editor.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["better-sqlite3", "sharp"],
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
