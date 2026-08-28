#!/usr/bin/env node
/**
 * Assembles a runnable standalone artifact (#26).
 *
 * `next build` with `output: "standalone"` emits a server plus only its actual
 * dependency closure, but it deliberately does not copy `.next/static` or
 * `public` — so the raw output starts, serves HTML, and 404s every script.
 * The page looks broken in a way that reads like an application bug rather
 * than a packaging step nobody ran.
 *
 *   npm run build && npm run build:standalone
 *   node .next/standalone/server.js
 */
import { cp, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const distDir = process.env.NEXT_DIST_DIR || ".next";
const standalone = join(root, distDir, "standalone");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standalone))) {
  console.error(
    `No standalone output at ${standalone}. Run \`npm run build\` first, and keep \`output: "standalone"\` in next.config.ts.`,
  );
  process.exit(1);
}

await mkdir(join(standalone, distDir), { recursive: true });
await cp(join(root, distDir, "static"), join(standalone, distDir, "static"), {
  recursive: true,
});

if (await exists(join(root, "public"))) {
  await cp(join(root, "public"), join(standalone, "public"), { recursive: true });
}

console.log(
  [
    `Packaged standalone artifact at ${standalone}`,
    "",
    "Run it with:",
    `  node ${join(distDir, "standalone", "server.js")}`,
    "",
    "Required in production: VORTEX_AUTH_SECRET, VORTEX_GUEST_COOKIE_SECRET,",
    "VORTEX_AUTH_URL, VORTEX_DATA_DIR. See docs/platform/DEPLOYMENT.md.",
  ].join("\n"),
);
