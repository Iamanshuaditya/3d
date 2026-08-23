import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { PRODUCTS } from "@/lib/configurator/product-config";
import type { PricingProvider } from "@/platform/pricing/types";
import { PlatformError } from "@/platform/projects/errors";
import type { ProjectOwner } from "@/platform/projects/types";
import { openVortexDatabase } from "@/server/persistence/database";
import { PricingService } from "@/server/pricing/pricing-service";
import { SqlitePriceQuoteRepository } from "@/server/pricing/sqlite-price-quote-repository";
import { StaticPricingProvider } from "@/server/pricing/static-pricing-provider";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";

const guest: ProjectOwner = { type: "guest", id: "guest-pricing-a" };
const otherGuest: ProjectOwner = { type: "guest", id: "guest-pricing-b" };

function staticProvider() {
  return new StaticPricingProvider("test-static-pricing", [
    {
      productVersionId: "tshirt@2",
      configurationId: "tshirt@2|",
      currency: "INR",
      pricingVersion: "test-inr-1",
      kind: "estimate",
      setupAmountMinor: 25_000,
      tiers: [
        { minimumQuantity: 1, unitAmountMinor: 59_900 },
        { minimumQuantity: 10, unitAmountMinor: 49_900 },
      ],
      validForSeconds: 15 * 60,
    },
  ]);
}

function fixture(t: TestContext, provider: PricingProvider = staticProvider()) {
  const database = openVortexDatabase(":memory:");
  const catalog = new ProductCatalogService(
    new SqliteProductCatalogRepository(database),
  );
  const repository = new SqlitePriceQuoteRepository(database);
  let nowMs = Date.UTC(2026, 7, 24, 10, 0, 0);
  let id = 0;
  const service = new PricingService(
    catalog,
    provider,
    repository,
    () => new Date(nowMs).toISOString(),
    () => `price-quote-${++id}`,
  );
  t.after(() => database.close());
  return {
    database,
    catalog,
    service,
    advance(milliseconds: number) {
      nowMs += milliseconds;
    },
  };
}

function quoteInput(overrides: Partial<Parameters<PricingService["create"]>[0]> = {}) {
  return {
    owner: guest,
    productId: "tshirt",
    productVersionId: "tshirt@2",
    optionSelection: {},
    quantity: 10,
    requestKey: "pricing-request-1",
    ...overrides,
  };
}

test("server-resolved quotes are immutable, owner scoped, and idempotent", async (t) => {
  const { database, service, advance } = fixture(t);
  const created = await service.create(quoteInput());

  assert.equal(created.created, true);
  assert.equal(created.quote.productVersionId, "tshirt@2");
  assert.equal(created.quote.configurationId, "tshirt@2|");
  assert.equal(created.quote.quantity, 10);
  assert.equal(created.quote.kind, "estimate");
  assert.equal(created.quote.currency, "INR");
  assert.deepEqual(created.quote.lineItems.map((line) => line.amountMinor), [499_000, 25_000]);
  assert.equal(created.quote.totalAmountMinor, 524_000);
  assert.equal(created.quote.taxIncluded, false);
  assert.equal(created.quote.shippingIncluded, false);
  assert.equal(created.quote.status, "active");
  assert.equal(JSON.stringify(created.quote).includes("providerId"), false);
  assert.equal(JSON.stringify(created.quote).includes("requestFingerprint"), false);

  const retry = await service.create(quoteInput());
  assert.equal(retry.created, false);
  assert.equal(retry.quote.id, created.quote.id);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM price_quotes").get() as { count: number }).count,
    1,
  );
  await assert.rejects(
    () => service.get(otherGuest, created.quote.id),
    (error) => error instanceof PlatformError && error.status === 404,
  );

  advance(16 * 60 * 1_000);
  const expired = await service.get(guest, created.quote.id);
  assert.equal(expired.status, "expired");
  assert.equal(expired.totalAmountMinor, created.quote.totalAmountMinor);
});

test("quote idempotency keys cannot be replayed with different commercial input", async (t) => {
  const { service } = fixture(t);
  await service.create(quoteInput());
  await assert.rejects(
    () => service.create(quoteInput({ quantity: 11 })),
    (error) =>
      error instanceof PlatformError &&
      error.status === 409 &&
      error.code === "QUOTE_IDEMPOTENCY_CONFLICT",
  );
});

test("a later product publication cannot mutate or float an existing quote", async (t) => {
  const { catalog, service } = fixture(t);
  const original = await service.create(quoteInput({
    productVersionId: null,
    requestKey: "current-version-request",
  }));
  const previousVersion = await catalog.currentVersion("tshirt");
  const previousDefinition = await catalog.definition("tshirt");
  const publishedAt = "2026-08-24T10:05:00.000Z";
  const nextVersion = {
    ...structuredClone(previousVersion),
    id: "tshirt@3",
    version: 3,
    publishedAt,
  };
  await catalog.publish({
    ...structuredClone(previousDefinition),
    currentVersionId: nextVersion.id,
    updatedAt: publishedAt,
  }, nextVersion);

  assert.equal((await catalog.currentVersion("tshirt")).id, "tshirt@3");
  const retry = await service.create(quoteInput({
    productVersionId: null,
    requestKey: "current-version-request",
  }));
  assert.equal(retry.created, false);
  assert.equal(retry.quote.id, original.quote.id);
  assert.equal(retry.quote.productVersionId, "tshirt@2");
  assert.equal(retry.quote.totalAmountMinor, original.quote.totalAmountMinor);

  const historical = await service.create(quoteInput({
    requestKey: "historical-version-request",
  }));
  assert.equal(historical.quote.productVersionId, "tshirt@2");
  await assert.rejects(
    () => service.create(quoteInput({
      productVersionId: null,
      requestKey: "new-current-version-request",
    })),
    (error) =>
      error instanceof PlatformError &&
      error.status === 422 &&
      error.code === "PRICING_UNAVAILABLE",
  );
});

test("invalid, hidden, and unpriced quote requests fail closed", async (t) => {
  const { service } = fixture(t);
  await assert.rejects(
    () => service.create(quoteInput({ quantity: 0 })),
    (error) =>
      error instanceof PlatformError &&
      error.status === 400 &&
      error.code === "INVALID_QUANTITY",
  );
  await assert.rejects(
    () => service.create(quoteInput({
      productId: "mailer-box-001",
      productVersionId: "mailer-box-001@3",
      requestKey: "unpriced-mailer",
    })),
    (error) =>
      error instanceof PlatformError &&
      error.status === 422 &&
      error.code === "PRICING_UNAVAILABLE",
  );
  const hidden = Object.values(PRODUCTS).find((product) => product.hidden);
  assert.ok(hidden);
  await assert.rejects(
    () => service.create(quoteInput({
      productId: hidden.id,
      productVersionId: null,
      requestKey: "hidden-product",
    })),
    (error) => error instanceof PlatformError && error.status === 404,
  );
});

test("provider arithmetic is verified before any quote is stored", async (t) => {
  const invalidProvider: PricingProvider = {
    id: "invalid-provider",
    async quote() {
      return {
        kind: "contract",
        currency: "INR",
        pricingVersion: "invalid-1",
        lineItems: [{
          code: "product",
          label: "Broken price",
          quantity: 10,
          unitAmountMinor: 100,
          amountMinor: 999,
        }],
        taxIncluded: false,
        shippingIncluded: false,
        validForSeconds: 900,
      };
    },
  };
  const { database, service } = fixture(t, invalidProvider);
  await assert.rejects(
    () => service.create(quoteInput()),
    (error) =>
      error instanceof PlatformError &&
      error.status === 503 &&
      error.code === "PRICING_PROVIDER_FAILED",
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM price_quotes").get() as { count: number }).count,
    0,
  );
});

test("concurrent quote retries persist one immutable record", async (t) => {
  const { database, service } = fixture(t);
  const [left, right] = await Promise.all([
    service.create(quoteInput()),
    service.create(quoteInput()),
  ]);
  assert.equal(left.quote.id, right.quote.id);
  assert.deepEqual([left.created, right.created].sort(), [false, true]);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM price_quotes").get() as { count: number }).count,
    1,
  );
});
