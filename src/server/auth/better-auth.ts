import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createVortexAuth } from "@/server/auth/create-auth";
import { getVortexDatabase } from "@/server/persistence/database";

function dataRoot() {
  return process.env.VORTEX_DATA_DIR || join(process.cwd(), ".data");
}

function loadAuthSecret() {
  const configured = process.env.VORTEX_AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
  if (configured) {
    if (Buffer.byteLength(configured) < 32) {
      throw new Error("VORTEX_AUTH_SECRET must contain at least 32 bytes of entropy.");
    }
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("VORTEX_AUTH_SECRET is required in production.");
  }

  const root = dataRoot();
  const path = join(root, "auth-secret");
  mkdirSync(root, { recursive: true });
  try {
    writeFileSync(path, randomBytes(32).toString("base64url"), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return readFileSync(path, "utf8").trim();
}

type VortexAuth = ReturnType<typeof createVortexAuth>;
let singleton: VortexAuth | null = null;

/**
 * Better Auth owns credential/session mechanics; domain code sees only owner
 * ids. Lazy initialization keeps production secrets out of build-time page
 * collection while still failing closed on the first runtime auth request.
 */
export function getAuth(): VortexAuth {
  singleton ??= createVortexAuth(
    getVortexDatabase(),
    loadAuthSecret(),
    process.env.VORTEX_AUTH_URL || process.env.BETTER_AUTH_URL,
  );
  return singleton;
}
