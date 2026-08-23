import assert from "node:assert/strict";
import { test } from "node:test";
import { GuestIdentityCodec } from "@/server/auth/owner-context";

const GUEST_ID = "7a31fb40-df33-4a4e-83e1-4d2f76f22a40";

test("guest identities are signed and tamper-evident", () => {
  const codec = new GuestIdentityCodec(Buffer.alloc(32, 17));
  const token = codec.issue(GUEST_ID);

  assert.equal(codec.verify(token), GUEST_ID);
  assert.equal(codec.verify(undefined), null);
  assert.equal(codec.verify("not-a-token"), null);

  const [id, signature] = token.split(".");
  assert.equal(codec.verify(`${id.slice(0, -1)}1.${signature}`), null, "changed ids must fail");
  assert.equal(
    codec.verify(`${id}.${signature.slice(0, -1)}A`),
    null,
    "changed signatures must fail",
  );
});

test("guest identity secrets must have production-grade entropy", () => {
  assert.throws(() => new GuestIdentityCodec(Buffer.alloc(16)), /at least 32 bytes/);
});
