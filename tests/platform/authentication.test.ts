import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { createVortexAuth } from "@/server/auth/create-auth";
import { BetterAuthAuthenticationProvider } from "@/server/auth/owner-context";
import { openVortexDatabase } from "@/server/persistence/database";

test("email credentials create a server-verifiable session projected as a user owner", async (t) => {
  const database = openVortexDatabase(":memory:");
  t.after(() => database.close());
  const auth = createVortexAuth(
    database,
    "test-secret-with-more-than-thirty-two-bytes-of-entropy",
    "http://localhost:3000",
  );

  const response = await auth.handler(new Request(
    "http://localhost:3000/api/auth/sign-up/email",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        name: "Project Owner",
        email: "owner@example.test",
        password: "strong-test-password",
      }),
    },
  ));
  assert.equal(response.status, 200);

  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  assert.match(cookie, /better-auth\.session_token=/);

  const provider = new BetterAuthAuthenticationProvider((headers) =>
    auth.api.getSession({ headers }),
  );
  const owner = await provider.authenticatedOwner(new NextRequest(
    "http://localhost:3000/api/v1/session",
    { headers: { cookie } },
  ));
  assert.equal(owner?.type, "user");
  assert.match(owner?.id ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get() as {
      count: number;
    }).count,
    1,
  );
});

test("missing or forged session cookies do not resolve an authenticated owner", async (t) => {
  const database = openVortexDatabase(":memory:");
  t.after(() => database.close());
  const auth = createVortexAuth(
    database,
    "another-test-secret-with-thirty-two-bytes-of-entropy",
    "http://localhost:3000",
  );
  const provider = new BetterAuthAuthenticationProvider((headers) =>
    auth.api.getSession({ headers }),
  );

  assert.equal(await provider.authenticatedOwner(
    new NextRequest("http://localhost:3000/api/v1/session"),
  ), null);
  assert.equal(await provider.authenticatedOwner(new NextRequest(
    "http://localhost:3000/api/v1/session",
    { headers: { cookie: "better-auth.session_token=forged" } },
  )), null);
});
