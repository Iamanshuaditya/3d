import type {
  PriceQuoteKind,
  PricingProvider,
  PricingProviderInput,
  PricingProviderResult,
} from "@/platform/pricing/types";

export type StaticPriceTier = {
  minimumQuantity: number;
  unitAmountMinor: number;
};

export type StaticPriceRule = {
  productVersionId: string;
  configurationId: string;
  currency: string;
  pricingVersion: string;
  kind?: PriceQuoteKind;
  setupAmountMinor?: number;
  tiers: StaticPriceTier[];
  validForSeconds?: number;
};

const SAFE_ID = /^[a-z0-9][a-z0-9._:@|-]{0,199}$/i;

function assertMinorAmount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function normalizeRule(rule: StaticPriceRule): StaticPriceRule {
  if (
    !SAFE_ID.test(rule.productVersionId) ||
    !rule.configurationId.startsWith(`${rule.productVersionId}|`) ||
    !/^[A-Z]{3}$/.test(rule.currency) ||
    !SAFE_ID.test(rule.pricingVersion) ||
    !rule.tiers.length
  ) {
    throw new Error("Static price rule identity is invalid.");
  }
  assertMinorAmount(rule.setupAmountMinor ?? 0, "Setup amount");
  const tiers = [...rule.tiers]
    .sort((left, right) => left.minimumQuantity - right.minimumQuantity)
    .map((tier) => {
      if (!Number.isSafeInteger(tier.minimumQuantity) || tier.minimumQuantity < 1) {
        throw new Error("Static price tier quantity must be a positive integer.");
      }
      assertMinorAmount(tier.unitAmountMinor, "Unit amount");
      return { ...tier };
    });
  if (tiers[0].minimumQuantity !== 1) {
    throw new Error("Static price rules must start at quantity 1.");
  }
  if (new Set(tiers.map((tier) => tier.minimumQuantity)).size !== tiers.length) {
    throw new Error("Static price tier quantities must be unique.");
  }
  const validForSeconds = rule.validForSeconds ?? 15 * 60;
  if (
    !Number.isInteger(validForSeconds) ||
    validForSeconds < 60 ||
    validForSeconds > 7 * 24 * 60 * 60
  ) {
    throw new Error("Static quote validity must be between one minute and seven days.");
  }
  return {
    ...structuredClone(rule),
    kind: rule.kind ?? "estimate",
    setupAmountMinor: rule.setupAmountMinor ?? 0,
    validForSeconds,
    tiers,
  };
}

export class StaticPricingProvider implements PricingProvider {
  readonly id: string;
  private readonly rules: Map<string, StaticPriceRule>;

  constructor(id: string, rules: StaticPriceRule[]) {
    if (!SAFE_ID.test(id)) throw new Error("Pricing provider id is invalid.");
    this.id = id;
    this.rules = new Map();
    for (const input of rules) {
      const rule = normalizeRule(input);
      if (this.rules.has(rule.configurationId)) {
        throw new Error(`Static price rule ${rule.configurationId} is duplicated.`);
      }
      this.rules.set(rule.configurationId, rule);
    }
  }

  async quote(input: PricingProviderInput): Promise<PricingProviderResult | null> {
    const rule = this.rules.get(input.configuration.configurationId);
    if (!rule || rule.productVersionId !== input.configuration.productVersionId) return null;
    const tier = rule.tiers
      .filter((candidate) => candidate.minimumQuantity <= input.quantity)
      .at(-1);
    if (!tier) return null;
    const merchandiseAmount = tier.unitAmountMinor * input.quantity;
    if (!Number.isSafeInteger(merchandiseAmount)) {
      throw new Error("Static price calculation exceeds the safe integer range.");
    }
    const lineItems = [
      {
        code: "configured-product",
        label: input.configuration.productConfig.name,
        quantity: input.quantity,
        unitAmountMinor: tier.unitAmountMinor,
        amountMinor: merchandiseAmount,
      },
    ];
    if (rule.setupAmountMinor) {
      lineItems.push({
        code: "setup",
        label: "Production setup",
        quantity: 1,
        unitAmountMinor: rule.setupAmountMinor,
        amountMinor: rule.setupAmountMinor,
      });
    }
    return {
      kind: rule.kind ?? "estimate",
      currency: rule.currency,
      pricingVersion: rule.pricingVersion,
      lineItems,
      taxIncluded: false,
      shippingIncluded: false,
      validForSeconds: rule.validForSeconds ?? 15 * 60,
      providerReference: null,
    };
  }
}

export class UnavailablePricingProvider implements PricingProvider {
  readonly id = "unavailable";

  async quote() {
    return null;
  }
}
