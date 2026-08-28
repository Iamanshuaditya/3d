import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EMBED_FEATURES,
  DEFAULT_EMBED_THEME,
  frameAncestors,
  normalizeOrigin,
  resolveEmbedConfig,
} from "@/platform/embed/resolve-embed";
import { EmbedRejection, type EmbedClient } from "@/platform/embed/types";
import {
  InvalidEmbedClientConfig,
  parseEmbedClients,
  StaticEmbedClientRegistry,
} from "@/server/embed/embed-client-registry";
import {
  embedEnvelope,
  embedFrameUrl,
  EMBED_PROTOCOL_VERSION,
  parseInboundMessage,
  parseOutboundMessage,
} from "@/lib/embed/protocol";
import { guestCookieAttributes } from "@/server/auth/owner-context";

const ACME: EmbedClient = {
  id: "acme-packaging",
  name: "Acme Packaging",
  status: "active",
  allowedOrigins: ["https://shop.acme.example"],
  productIds: ["nexibles-rstz-190x265-110"],
  theme: { ...DEFAULT_EMBED_THEME, accent: "#c2410c" },
  features: { ...DEFAULT_EMBED_FEATURES, uploads: true, preview3d: true },
  completion: {
    mode: "quote",
    ctaLabel: "Request a quote",
    confirmationText: "Your design was sent to Acme.",
  },
};

const RIVAL: EmbedClient = {
  ...ACME,
  id: "rival-cartons",
  name: "Rival Cartons",
  allowedOrigins: ["https://store.rival.example"],
  productIds: ["mailer-box-001"],
};

const registry = new StaticEmbedClientRegistry([ACME, RIVAL]);

test("an embed resolves only for a registered origin and an enabled product", () => {
  const resolved = resolveEmbedConfig(registry, {
    clientId: "acme-packaging",
    productId: "nexibles-rstz-190x265-110",
    hostOrigin: "https://shop.acme.example",
  });
  assert.equal(resolved.clientId, "acme-packaging");
  assert.equal(resolved.hostOrigin, "https://shop.acme.example");
  assert.equal(resolved.completion.ctaLabel, "Request a quote");
  assert.equal(resolved.theme.accent, "#c2410c");
});

test("one client cannot host, or configure, another client's product", () => {
  // Acme's own page may not open Rival's catalogue.
  assert.throws(
    () =>
      resolveEmbedConfig(registry, {
        clientId: "acme-packaging",
        productId: "mailer-box-001",
        hostOrigin: "https://shop.acme.example",
      }),
    (error: unknown) =>
      error instanceof EmbedRejection && error.code === "PRODUCT_NOT_ENABLED",
  );

  // And Rival's page may not frame Acme's configurator at all.
  assert.throws(
    () =>
      resolveEmbedConfig(registry, {
        clientId: "acme-packaging",
        productId: "nexibles-rstz-190x265-110",
        hostOrigin: "https://store.rival.example",
      }),
    (error: unknown) =>
      error instanceof EmbedRejection && error.code === "ORIGIN_NOT_ALLOWED",
  );
});

test("origin checks cannot be defeated by lookalikes, paths or a missing host", () => {
  const attempts = [
    "https://shop.acme.example.attacker.test",
    "http://shop.acme.example",
    "https://shop.acme.example:8443",
    "https://evil.test",
    "not-a-url",
  ];
  for (const hostOrigin of attempts) {
    assert.throws(
      () =>
        resolveEmbedConfig(registry, {
          clientId: "acme-packaging",
          productId: "nexibles-rstz-190x265-110",
          hostOrigin,
        }),
      (error: unknown) => error instanceof EmbedRejection,
      `${hostOrigin} must not resolve`,
    );
  }

  // A trailing path or slash is the same origin and must still work.
  assert.equal(
    resolveEmbedConfig(registry, {
      clientId: "acme-packaging",
      productId: "nexibles-rstz-190x265-110",
      hostOrigin: "https://shop.acme.example/products/pouch",
    }).hostOrigin,
    "https://shop.acme.example",
  );

  assert.throws(
    () =>
      resolveEmbedConfig(registry, {
        clientId: "acme-packaging",
        productId: "nexibles-rstz-190x265-110",
        hostOrigin: null,
      }),
    (error: unknown) =>
      error instanceof EmbedRejection && error.code === "MISSING_HOST_ORIGIN",
  );
});

test("unknown and disabled clients are refused", () => {
  assert.throws(
    () =>
      resolveEmbedConfig(registry, {
        clientId: "not-a-client",
        productId: "nexibles-rstz-190x265-110",
        hostOrigin: "https://shop.acme.example",
      }),
    (error: unknown) => error instanceof EmbedRejection && error.code === "UNKNOWN_CLIENT",
  );

  const disabled = new StaticEmbedClientRegistry([{ ...ACME, status: "disabled" }]);
  assert.throws(
    () =>
      resolveEmbedConfig(disabled, {
        clientId: "acme-packaging",
        productId: "nexibles-rstz-190x265-110",
        hostOrigin: "https://shop.acme.example",
      }),
    (error: unknown) => error instanceof EmbedRejection && error.code === "CLIENT_DISABLED",
  );
});

test("every feature is off until a client turns it on", () => {
  const bare = new StaticEmbedClientRegistry([
    { ...ACME, features: {} as EmbedClient["features"] },
  ]);
  const resolved = resolveEmbedConfig(bare, {
    clientId: "acme-packaging",
    productId: "nexibles-rstz-190x265-110",
    hostOrigin: "https://shop.acme.example",
  });
  for (const [name, enabled] of Object.entries(resolved.features)) {
    assert.equal(enabled, false, `${name} must default to off`);
  }

  // Shipping a new capability must never switch it on inside a live client site.
  assert.ok(Object.values(DEFAULT_EMBED_FEATURES).every((value) => value === false));
});

test("the resolved config exposes no internal or operator surface", () => {
  const resolved = resolveEmbedConfig(registry, {
    clientId: "acme-packaging",
    productId: "nexibles-rstz-190x265-110",
    hostOrigin: "https://shop.acme.example",
  });
  const serialized = JSON.stringify(resolved);
  for (const forbidden of ["allowedOrigins", "operator", "permissions", "storageKey", "admin"]) {
    assert.ok(!serialized.includes(forbidden), `${forbidden} must not reach the frame`);
  }
  // The other client must not be discoverable through a resolved config.
  assert.ok(!serialized.includes("rival"));
});

test("wildcard and malformed origins are rejected at configuration load", () => {
  for (const origins of [["https://*.acme.example"], ["*"], ["acme.example"], []]) {
    assert.throws(
      () =>
        parseEmbedClients(
          JSON.stringify([{ ...ACME, allowedOrigins: origins }]),
        ),
      InvalidEmbedClientConfig,
      `${JSON.stringify(origins)} must be rejected`,
    );
  }
  assert.throws(() => parseEmbedClients("{}"), InvalidEmbedClientConfig);
  assert.throws(() => parseEmbedClients("not json"), InvalidEmbedClientConfig);
  assert.throws(
    () => parseEmbedClients(JSON.stringify([ACME, { ...RIVAL, id: ACME.id }])),
    InvalidEmbedClientConfig,
  );
});

test("client configuration is data, and a parsed client keeps its own branding", () => {
  const [parsed] = parseEmbedClients(
    JSON.stringify([
      {
        id: "acme-packaging",
        name: "Acme Packaging",
        allowedOrigins: ["https://shop.acme.example/"],
        productIds: ["nexibles-rstz-190x265-110"],
        theme: { accent: "#0f766e", radiusPx: 2 },
        features: { uploads: true },
        completion: { mode: "inquiry", ctaLabel: "Send to Acme" },
      },
    ]),
  );
  assert.equal(parsed.allowedOrigins[0], "https://shop.acme.example");
  assert.equal(parsed.theme.accent, "#0f766e");
  assert.equal(parsed.theme.radiusPx, 2);
  // Unstated tokens fall back rather than being left undefined in the frame.
  assert.equal(parsed.theme.text, DEFAULT_EMBED_THEME.text);
  assert.equal(parsed.features.uploads, true);
  assert.equal(parsed.features.downloadArtifact, false);
  assert.equal(parsed.completion.mode, "inquiry");
  assert.equal(parsed.completion.confirmationText.length > 0, true);
});

test("frame-ancestors lists exactly the client's registered origins", () => {
  assert.deepEqual(frameAncestors(ACME), ["https://shop.acme.example"]);
  assert.deepEqual(frameAncestors(RIVAL), ["https://store.rival.example"]);
  assert.equal(normalizeOrigin("https://a.test/x?y=1"), "https://a.test");
  assert.equal(normalizeOrigin("javascript:alert(1)"), null);
});

test("the message protocol rejects foreign, unversioned and unknown messages", () => {
  assert.deepEqual(
    parseOutboundMessage(embedEnvelope({ type: "ready", clientId: "a", productId: "b" })),
    { type: "ready", clientId: "a", productId: "b" },
  );
  assert.equal(parseOutboundMessage({ type: "ready" }), null);
  assert.equal(
    parseOutboundMessage({ namespace: "other", version: 1, payload: { type: "ready" } }),
    null,
  );
  assert.equal(
    parseOutboundMessage({
      namespace: "vortex-embed",
      version: EMBED_PROTOCOL_VERSION + 1,
      payload: { type: "ready" },
    }),
    null,
  );
  assert.equal(parseOutboundMessage(embedEnvelope({ type: "drop-tables" })), null);

  // Host-bound and frame-bound vocabularies stay separate, so a host cannot
  // replay a frame message back at the frame to drive it.
  assert.equal(parseInboundMessage(embedEnvelope({ type: "completed" })), null);
  assert.deepEqual(parseInboundMessage(embedEnvelope({ type: "complete" })), {
    type: "complete",
  });
});

test("the frame url always declares its host origin", () => {
  const url = new URL(
    embedFrameUrl({
      baseUrl: "https://configurator.example.com",
      clientId: "acme-packaging",
      productId: "nexibles-rstz-190x265-110",
      hostOrigin: "https://shop.acme.example",
      projectId: "project-1",
    }),
  );
  assert.equal(url.origin, "https://configurator.example.com");
  assert.equal(url.pathname, "/embed/acme-packaging/nexibles-rstz-190x265-110");
  assert.equal(url.searchParams.get("host"), "https://shop.acme.example");
  assert.equal(url.searchParams.get("project"), "project-1");
});

test("an embedded session over HTTPS gets a partitioned cookie, and never a bare SameSite=None", () => {
  const embedded = guestCookieAttributes(
    { owner: { type: "guest", id: "g" }, pendingGuestCookie: "t", embedded: true },
    true,
  );
  assert.equal(embedded.sameSite, "none");
  assert.equal(embedded.secure, true);
  assert.equal("partitioned" in embedded && embedded.partitioned, true);

  // Plain HTTP must stay Lax: SameSite=None without Secure is rejected by
  // browsers, so emitting it would produce a silently broken session.
  const insecure = guestCookieAttributes(
    { owner: { type: "guest", id: "g" }, pendingGuestCookie: "t", embedded: true },
    false,
  );
  assert.equal(insecure.sameSite, "lax");
  assert.ok(!("partitioned" in insecure));

  // The Studio's own cookie is untouched by any of this.
  const studio = guestCookieAttributes(
    { owner: { type: "guest", id: "g" }, pendingGuestCookie: "t", embedded: false },
    true,
  );
  assert.equal(studio.sameSite, "lax");
  assert.ok(!("partitioned" in studio));
});
