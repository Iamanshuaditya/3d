# Commerce boundary

Status: immutable, owner-scoped price quotes and the `PricingProvider` abstraction are implemented. Cart, checkout, payment, tax/shipping calculation, orders, artifact approval, and reprint flows are intentionally not implemented.

## Invariant

Commerce references authoritative platform identities; it does not recreate them:

```text
ProductVersion + server-resolved configuration + quantity
                         │
                         ▼
                  PricingProvider
                         │ validated minor-unit arithmetic
                         ▼
                immutable PriceQuote

Future order line
  ├── PriceQuote id/snapshot
  ├── DesignProject revision
  └── approved ProductionArtifact id
```

A browser may request product options and quantity. It may not assert a price, currency, `configurationId`, product version actually used, production readiness, artifact identity, discount, tax, or total.

## Price quote model

`PriceQuote` records:

- random quote ID and owner;
- owner-scoped idempotency key plus request fingerprint;
- exact product/version/configuration and validated option selection;
- positive bounded quantity;
- `estimate` or `contract` kind;
- three-letter currency and integer minor-unit line items/total;
- explicit tax and shipping inclusion flags;
- pricing version and internal provider provenance;
- creation and expiry timestamps.

Rows are append-only. Expiry is a derived read status, not a row update. A later product publication or provider price change cannot rewrite an earlier quote.

## Provider boundary

```ts
interface PricingProvider {
  readonly id: string;
  quote(input: {
    configuration: ResolvedProductConfiguration;
    quantity: number;
  }): Promise<PricingProviderResult | null>;
}
```

The provider receives the internal server-resolved configuration so future factory, partner, or storefront adapters can use production option values without exposing them in public DTOs. React never calculates prices.

The service verifies provider output before persistence: bounded validity, unique safe line codes, non-negative safe integers, exact line arithmetic, bounded labels, and overflow-safe totals. `null` means unsupported and becomes `PRICING_UNAVAILABLE`; provider exceptions or malformed contracts fail closed with `PRICING_PROVIDER_FAILED` and store nothing.

## Development adapter

`StaticPricingProvider` supports explicit rules keyed by exact `configurationId`, with quantity tiers and optional setup amounts. The application container includes one clearly labeled T-shirt estimate fixture to exercise the lifecycle locally. It is not supplier-approved and is disabled in production unless `VORTEX_ENABLE_DEVELOPMENT_PRICING=true` is intentionally set.

This prevents a demo price from being mistaken for a production commitment. Production checkout must use a real provider returning `kind: "contract"` and must recheck that the quote is unexpired.

## Security

- Quote creation uses the signed guest/future-user owner context, same-origin protection, rate limits, and an owner-scoped idempotency key.
- Quote reads require the same owner; possession of a random quote ID is insufficient.
- Public DTOs omit owner IDs, request fingerprints, provider IDs, and provider references.
- Unlisted products return 404; unsupported prices return 422.
- Unknown request fields—including client prices or totals—are rejected.
- A future order service must read the quote, project, revision, and artifact itself. It must never accept those records' claimed contents from a browser.

## Next step

Add a narrow order-line eligibility service only after a real contract pricing adapter exists. It should require an active contract quote, an owner-matching project revision, a successful preflight, and an approved immutable artifact. Payment and broad e-commerce concerns should remain outside the customization core.
