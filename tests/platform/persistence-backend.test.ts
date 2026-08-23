import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredPersistenceBackend } from "@/server/persistence/backend";

test("database backend selection defaults to SQLite and fails closed for incomplete PostgreSQL", () => {
  const previous = process.env.VORTEX_DATABASE;
  try {
    delete process.env.VORTEX_DATABASE;
    assert.equal(configuredPersistenceBackend(), "sqlite");
    process.env.VORTEX_DATABASE = "postgresql";
    assert.throws(
      () => configuredPersistenceBackend(),
      /not runnable yet/,
    );
    process.env.VORTEX_DATABASE = "unknown";
    assert.throws(() => configuredPersistenceBackend(), /Unsupported/);
  } finally {
    if (previous === undefined) delete process.env.VORTEX_DATABASE;
    else process.env.VORTEX_DATABASE = previous;
  }
});
