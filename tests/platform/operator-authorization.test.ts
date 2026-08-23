import assert from "node:assert/strict";
import { test } from "node:test";
import { PlatformError } from "@/platform/projects/errors";
import { openVortexDatabase } from "@/server/persistence/database";
import {
  OperatorAuthorizationService,
  operatorHasPermission,
} from "@/server/operators/operator-authorization-service";
import { SqliteOperatorGrantRepository } from "@/server/operators/sqlite-operator-grant-repository";

function addUser(database: ReturnType<typeof openVortexDatabase>, id: string) {
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO auth_users(id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(id, id, `${id}@example.test`, now, now);
}

test("operator permissions come from authenticated server grants, not request data", async (t) => {
  const database = openVortexDatabase(":memory:");
  t.after(() => database.close());
  addUser(database, "user-editor");
  database.prepare(`
    INSERT INTO operator_grants(user_id, permission, granted_by, granted_at)
    VALUES ('user-editor', 'products:edit', 'deployment-bootstrap', ?)
  `).run(new Date().toISOString());

  const service = new OperatorAuthorizationService(
    new SqliteOperatorGrantRepository(database),
    async () => ({ user: { id: "user-editor" } }),
    new Set(),
  );
  const operator = await service.require(new Headers(), "products:read");
  assert.equal(operator.id, "user-editor");
  assert.deepEqual(operator.permissions, ["products:edit"]);
  await assert.rejects(
    () => service.require(new Headers({ "x-client-role": "publisher" }), "products:publish"),
    (error) => error instanceof PlatformError && error.code === "OPERATOR_FORBIDDEN",
  );
});

test("ordinary authenticated users and anonymous requests cannot enter admin", async (t) => {
  const database = openVortexDatabase(":memory:");
  t.after(() => database.close());
  addUser(database, "ordinary-user");
  const grants = new SqliteOperatorGrantRepository(database);
  const ordinary = new OperatorAuthorizationService(
    grants,
    async () => ({ user: { id: "ordinary-user" } }),
    new Set(),
  );
  const anonymous = new OperatorAuthorizationService(grants, async () => null, new Set());

  await assert.rejects(
    () => ordinary.require(new Headers(), "products:read"),
    (error) => error instanceof PlatformError && error.status === 403,
  );
  await assert.rejects(
    () => anonymous.require(new Headers(), "products:read"),
    (error) => error instanceof PlatformError && error.status === 401,
  );
});

test("permission inheritance is explicit and bounded by domain", () => {
  assert.equal(operatorHasPermission(["products:publish"], "products:read"), true);
  assert.equal(operatorHasPermission(["products:edit"], "products:validate"), false);
  assert.equal(operatorHasPermission(["templates:publish"], "templates:read"), true);
  assert.equal(operatorHasPermission(["templates:publish"], "products:read"), false);
  assert.equal(operatorHasPermission(["assets:upload"], "templates:edit"), false);
});
