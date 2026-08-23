import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { PlatformError } from "@/platform/projects/errors";
import { assertSameOriginMutation } from "@/server/http/api";

test("same-origin checks accept the actual HTTP host even when framework URLs are normalized", () => {
  const request = new NextRequest("http://localhost:8082/api/v1/projects", {
    method: "POST",
    headers: {
      host: "127.0.0.1:8082",
      origin: "http://127.0.0.1:8082",
      "sec-fetch-site": "same-origin",
    },
  });
  assert.doesNotThrow(() => assertSameOriginMutation(request));
});

test("same-origin checks reject cross-site browser mutations", () => {
  const request = new NextRequest("https://test.nexiworld.com/api/v1/projects", {
    method: "POST",
    headers: {
      host: "test.nexiworld.com",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
  });
  assert.throws(
    () => assertSameOriginMutation(request),
    (error) => error instanceof PlatformError && error.status === 403,
  );
});
