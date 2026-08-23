import { betterAuth } from "better-auth";
import type { VortexDatabase } from "@/server/persistence/database";

/**
 * Creates the credential/session adapter without touching the application
 * singleton. Keeping this factory pure lets migration and integration tests use
 * an isolated database.
 */
export function createVortexAuth(
  database: VortexDatabase,
  secret: string,
  baseURL?: string,
) {
  return betterAuth({
    appName: "Vortex",
    basePath: "/api/auth",
    baseURL,
    secret,
    database,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    user: { modelName: "auth_users" },
    session: { modelName: "auth_sessions" },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" },
    advanced: {
      database: {
        generateId: "uuid",
        joins: true,
      },
      useSecureCookies: process.env.NODE_ENV === "production",
    },
  });
}
