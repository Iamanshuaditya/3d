/**
 * Deployment configuration contract (#26).
 *
 * The failure this exists to prevent: a production server that starts happily,
 * serves its home page, and only reveals a missing secret as an opaque 500 the
 * first time a customer tries to save. Every required setting is checked once,
 * before the server accepts a request, and every message names the variable and
 * what it is for.
 */

export type DeploymentMode =
  /** One process, local SQLite, local disk. Supported for V1. */
  | "single-node"
  /** Multiple processes behind a load balancer. Not yet supported. */
  | "scaled";

export type ConfigProblem = {
  variable: string;
  detail: string;
};

export class DeploymentConfigError extends Error {
  constructor(readonly problems: ConfigProblem[]) {
    super(
      [
        "This deployment is not correctly configured:",
        ...problems.map((problem) => `  - ${problem.variable}: ${problem.detail}`),
        "See docs/platform/DEPLOYMENT.md.",
      ].join("\n"),
    );
    this.name = "DeploymentConfigError";
  }
}

export type DeploymentConfig = {
  mode: DeploymentMode;
  database: "sqlite";
  objectStore: "filesystem" | "s3";
  dataDir: string;
  production: boolean;
};

function secretByteLength(value: string): number {
  return Buffer.from(value, "base64url").byteLength;
}

/**
 * Validates the environment for one deployment.
 *
 * Pure and env-injected so a test can exercise a production configuration
 * without setting process-wide variables, and so the same rules apply whether
 * they run at startup or in CI.
 */
export function validateDeploymentConfig(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentConfig {
  const problems: ConfigProblem[] = [];
  const production = env.NODE_ENV === "production";

  const requestedMode = env.VORTEX_DEPLOYMENT_MODE?.trim() || "single-node";
  if (requestedMode !== "single-node" && requestedMode !== "scaled") {
    problems.push({
      variable: "VORTEX_DEPLOYMENT_MODE",
      detail: `"${requestedMode}" is not a deployment mode. Use "single-node".`,
    });
  }
  if (requestedMode === "scaled") {
    // Rate limits and job runners are process-local and SQLite is the only
    // adapter, so a second instance would silently diverge rather than scale.
    problems.push({
      variable: "VORTEX_DEPLOYMENT_MODE",
      detail:
        "Scaled mode is not supported yet. Rate limiting and background jobs are now shared-store backed, but SQLite on a local volume cannot be shared between instances and the PostgreSQL domain repositories are not ported. See docs/platform/POSTGRESQL.md.",
    });
  }

  const database = env.VORTEX_DATABASE?.trim() || "sqlite";
  if (database !== "sqlite") {
    problems.push({
      variable: "VORTEX_DATABASE",
      detail:
        database === "postgresql"
          ? "The PostgreSQL schema, pool, shared rate limiter and job queue are implemented, but the domain repositories and the Better Auth adapter are not, so the application cannot serve requests on it. Use sqlite. See docs/platform/POSTGRESQL.md."
          : `"${database}" is not a supported database. Use sqlite.`,
    });
  }

  const objectStore = env.VORTEX_OBJECT_STORE?.trim() || "filesystem";
  if (objectStore !== "filesystem" && objectStore !== "s3") {
    problems.push({
      variable: "VORTEX_OBJECT_STORE",
      detail: `"${objectStore}" is not a supported object store. Use filesystem or s3.`,
    });
  }
  if (objectStore === "s3") {
    for (const variable of [
      "VORTEX_S3_ENDPOINT",
      "VORTEX_S3_BUCKET",
      "VORTEX_S3_ACCESS_KEY_ID",
      "VORTEX_S3_SECRET_ACCESS_KEY",
    ]) {
      if (!env[variable]?.trim()) {
        problems.push({
          variable,
          detail: "Required when VORTEX_OBJECT_STORE=s3.",
        });
      }
    }
  }

  if (production) {
    for (const variable of ["VORTEX_AUTH_SECRET", "VORTEX_GUEST_COOKIE_SECRET"]) {
      const value = env[variable]?.trim();
      if (!value) {
        problems.push({
          variable,
          detail:
            "Required in production. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\".",
        });
        continue;
      }
      if (secretByteLength(value) < 32) {
        problems.push({
          variable,
          detail: "Must decode to at least 32 random bytes (base64url).",
        });
      }
    }

    const authUrl = env.VORTEX_AUTH_URL?.trim();
    if (!authUrl) {
      problems.push({
        variable: "VORTEX_AUTH_URL",
        detail: "Required in production: the public origin this deployment is served from.",
      });
    } else if (!/^https:\/\//.test(authUrl)) {
      problems.push({
        variable: "VORTEX_AUTH_URL",
        detail: `Must be an https origin. Sessions and embedded cookies both require TLS; got "${authUrl}".`,
      });
    }

    // Filesystem storage on an ephemeral container filesystem loses every
    // customer upload on restart, which looks like data corruption rather than
    // like a configuration mistake.
    if (objectStore === "filesystem" && !env.VORTEX_DATA_DIR?.trim()) {
      problems.push({
        variable: "VORTEX_DATA_DIR",
        detail:
          "Required in production with filesystem storage: it must point at a persistent volume, or uploads and the database are lost on restart.",
      });
    }
  }

  if (env.VORTEX_EMBED_CLIENTS?.trim()) {
    try {
      const parsed: unknown = JSON.parse(env.VORTEX_EMBED_CLIENTS);
      if (!Array.isArray(parsed)) throw new Error("not an array");
    } catch {
      problems.push({
        variable: "VORTEX_EMBED_CLIENTS",
        detail: "Must be a JSON array of embed clients. See docs/platform/EMBED.md.",
      });
    }
  }

  if (problems.length) throw new DeploymentConfigError(problems);

  return {
    mode: requestedMode as DeploymentMode,
    database: "sqlite",
    objectStore: objectStore as "filesystem" | "s3",
    dataDir: env.VORTEX_DATA_DIR?.trim() || ".data",
    production,
  };
}
