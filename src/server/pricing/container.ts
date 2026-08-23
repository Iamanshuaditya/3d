import { getVortexDatabase } from "@/server/persistence/database";
import { getProductCatalogService } from "@/server/products/container";
import { PricingService } from "./pricing-service";
import { SqlitePriceQuoteRepository } from "./sqlite-price-quote-repository";
import {
  StaticPricingProvider,
  UnavailablePricingProvider,
  type StaticPriceRule,
} from "./static-pricing-provider";

/**
 * Development-only fixture used to prove the quote lifecycle. These are not
 * supplier-approved prices and are therefore always returned as estimates.
 */
const DEVELOPMENT_PRICE_RULES: StaticPriceRule[] = [
  {
    productVersionId: "tshirt@2",
    configurationId: "tshirt@2|",
    currency: "INR",
    pricingVersion: "static-development-inr-1",
    kind: "estimate",
    tiers: [
      { minimumQuantity: 1, unitAmountMinor: 59_900 },
      { minimumQuantity: 10, unitAmountMinor: 49_900 },
      { minimumQuantity: 25, unitAmountMinor: 44_900 },
      { minimumQuantity: 50, unitAmountMinor: 39_900 },
    ],
    validForSeconds: 15 * 60,
  },
];

let singleton: PricingService | null = null;

export function getPricingService() {
  if (singleton) return singleton;
  const developmentPricingEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.VORTEX_ENABLE_DEVELOPMENT_PRICING === "true";
  const provider = developmentPricingEnabled
    ? new StaticPricingProvider("static-development", DEVELOPMENT_PRICE_RULES)
    : new UnavailablePricingProvider();
  singleton = new PricingService(
    getProductCatalogService(),
    provider,
    new SqlitePriceQuoteRepository(getVortexDatabase()),
  );
  return singleton;
}
