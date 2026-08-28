import assert from "node:assert/strict";
import test from "node:test";
import {
  DeploymentConfigError,
  validateDeploymentConfig,
} from "@/server/config/environment";

const SECRET = Buffer.alloc(32, 7).toString("base64url");

const PRODUCTION = {
  NODE_ENV: "production",
  VORTEX_AUTH_SECRET: SECRET,
  VORTEX_GUEST_COOKIE_SECRET: SECRET,
  VORTEX_AUTH_URL: "https://configurator.example.com",
  VORTEX_DATA_DIR: "/data",
} satisfies NodeJS.ProcessEnv;

function problemsFor(env: NodeJS.ProcessEnv): string[] {
  try {
    validateDeploymentConfig(env);
    return [];
  } catch (error) {
    assert.ok(error instanceof DeploymentConfigError);
    return error.problems.map((problem) => problem.variable);
  }
}

test("the supported single-node production configuration validates", () => {
  const config = validateDeploymentConfig(PRODUCTION);
  assert.equal(config.mode, "single-node");
  assert.equal(config.database, "sqlite");
  assert.equal(config.objectStore, "filesystem");
  assert.equal(config.production, true);
});

test("development needs no secrets, so a fresh clone still runs", () => {
  const config = validateDeploymentConfig({ NODE_ENV: "development" });
  assert.equal(config.production, false);
  assert.equal(config.mode, "single-node");
});

test("a production deployment missing its secrets refuses to start", () => {
  const problems = problemsFor({ NODE_ENV: "production" });
  assert.deepEqual(problems.sort(), [
    "VORTEX_AUTH_SECRET",
    "VORTEX_AUTH_URL",
    "VORTEX_DATA_DIR",
    "VORTEX_GUEST_COOKIE_SECRET",
  ]);
});

test("every problem names its variable and how to fix it", () => {
  try {
    validateDeploymentConfig({ NODE_ENV: "production" });
    assert.fail("Expected the configuration to be rejected.");
  } catch (error) {
    assert.ok(error instanceof DeploymentConfigError);
    for (const problem of error.problems) {
      assert.ok(problem.variable.startsWith("VORTEX_"));
      assert.ok(problem.detail.length > 20, `${problem.variable} needs an actionable detail`);
    }
    // The message has to be readable in a container log with no other context.
    assert.ok(error.message.includes("docs/platform/DEPLOYMENT.md"));
  }
});

test("a short or non-random secret is rejected rather than quietly accepted", () => {
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_AUTH_SECRET: "short" }),
    ["VORTEX_AUTH_SECRET"],
  );
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_GUEST_COOKIE_SECRET: Buffer.alloc(16).toString("base64url") }),
    ["VORTEX_GUEST_COOKIE_SECRET"],
  );
});

test("a production auth URL must be https", () => {
  // Sessions and embedded partitioned cookies both require TLS, so an http
  // origin here produces a deployment that cannot hold a session.
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_AUTH_URL: "http://configurator.example.com" }),
    ["VORTEX_AUTH_URL"],
  );
});

test("filesystem storage in production must name a persistent volume", () => {
  // Without it, uploads and the SQLite database live on an ephemeral container
  // filesystem and vanish on restart, which reads as data loss, not misconfig.
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_DATA_DIR: "" }),
    ["VORTEX_DATA_DIR"],
  );
});

test("s3 storage requires its complete credential set", () => {
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_OBJECT_STORE: "s3" }).sort(),
    [
      "VORTEX_S3_ACCESS_KEY_ID",
      "VORTEX_S3_BUCKET",
      "VORTEX_S3_ENDPOINT",
      "VORTEX_S3_SECRET_ACCESS_KEY",
    ],
  );

  const config = validateDeploymentConfig({
    ...PRODUCTION,
    VORTEX_OBJECT_STORE: "s3",
    VORTEX_S3_ENDPOINT: "https://s3.example.com",
    VORTEX_S3_BUCKET: "vortex",
    VORTEX_S3_ACCESS_KEY_ID: "key",
    VORTEX_S3_SECRET_ACCESS_KEY: "secret",
  });
  assert.equal(config.objectStore, "s3");
});

test("unsupported combinations fail clearly instead of degrading silently", () => {
  // PostgreSQL has no runnable adapter, and scaled mode has process-local rate
  // limits and job runners. Both must refuse rather than half-work.
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_DATABASE: "postgresql" }),
    ["VORTEX_DATABASE"],
  );
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_DEPLOYMENT_MODE: "scaled" }),
    ["VORTEX_DEPLOYMENT_MODE"],
  );
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_OBJECT_STORE: "gcs" }),
    ["VORTEX_OBJECT_STORE"],
  );
});

test("both unsupported-mode errors say where the remaining work is documented", () => {
  for (const env of [
    { ...PRODUCTION, VORTEX_DATABASE: "postgresql" },
    { ...PRODUCTION, VORTEX_DEPLOYMENT_MODE: "scaled" },
  ]) {
    try {
      validateDeploymentConfig(env);
      assert.fail("Expected rejection.");
    } catch (error) {
      assert.ok(error instanceof DeploymentConfigError);
      // Refusing is only half of it; an operator has to be able to find out
      // what would actually unblock them.
      assert.ok(error.problems[0].detail.includes("docs/platform/POSTGRESQL.md"));
    }
  }
});

test("malformed embed client configuration is caught at startup, not at first request", () => {
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_EMBED_CLIENTS: "{not json" }),
    ["VORTEX_EMBED_CLIENTS"],
  );
  assert.deepEqual(
    problemsFor({ ...PRODUCTION, VORTEX_EMBED_CLIENTS: '{"id":"x"}' }),
    ["VORTEX_EMBED_CLIENTS"],
  );
  assert.deepEqual(problemsFor({ ...PRODUCTION, VORTEX_EMBED_CLIENTS: "[]" }), []);
});
