import { createHash } from "node:crypto";
import type { PriceQuoteRepository } from "@/platform/pricing/repository";
import {
  PRICE_QUOTE_MAX_QUANTITY,
  PRICE_QUOTE_REQUEST_KEY_MAX_LENGTH,
  type CreatePriceQuoteInput,
  type CreatePriceQuoteResult,
  type PriceQuote,
  type PriceQuoteDto,
  type PriceQuoteLineItem,
  type PricingProvider,
  type PricingProviderResult,
} from "@/platform/pricing/types";
import {
  NotFoundError,
  PlatformError,
  ValidationError,
} from "@/platform/projects/errors";
import { parseOptionSelection } from "@/platform/products/configuration-resolver";
import { ProductDomainError } from "@/platform/products/errors";
import type {
  ProductCatalogReader,
  ResolvedProductConfiguration,
} from "@/platform/products/types";
import { canonicalJson } from "@/server/persistence/canonical-json";

const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const VERSION_ID_PATTERN = /^[a-z0-9][a-z0-9._:@-]{0,159}$/i;
const REQUEST_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const LINE_ITEM_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;

function requestFingerprint(input: {
  productId: string;
  productVersionId: string | null;
  optionSelection: ReturnType<typeof parseOptionSelection>;
  quantity: number;
}) {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function toDto(quote: PriceQuote, now: string): PriceQuoteDto {
  return {
    id: quote.id,
    productId: quote.productId,
    productVersionId: quote.productVersionId,
    configurationId: quote.configurationId,
    optionSelection: structuredClone(quote.optionSelection),
    quantity: quote.quantity,
    kind: quote.kind,
    currency: quote.currency,
    lineItems: structuredClone(quote.lineItems),
    totalAmountMinor: quote.totalAmountMinor,
    taxIncluded: quote.taxIncluded,
    shippingIncluded: quote.shippingIncluded,
    pricingVersion: quote.pricingVersion,
    createdAt: quote.createdAt,
    expiresAt: quote.expiresAt,
    status: Date.parse(now) < Date.parse(quote.expiresAt) ? "active" : "expired",
    links: {
      self: `/api/v1/price-quotes/${encodeURIComponent(quote.id)}`,
      product: `/api/v1/products/${encodeURIComponent(quote.productId)}?version=${encodeURIComponent(quote.productVersionId)}`,
    },
  };
}

function assertMinorAmount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function validateProviderResult(result: PricingProviderResult): {
  result: PricingProviderResult;
  totalAmountMinor: number;
} {
  if (
    (result.kind !== "estimate" && result.kind !== "contract") ||
    !/^[A-Z]{3}$/.test(result.currency) ||
    !VERSION_ID_PATTERN.test(result.pricingVersion) ||
    typeof result.taxIncluded !== "boolean" ||
    typeof result.shippingIncluded !== "boolean" ||
    !Number.isInteger(result.validForSeconds) ||
    result.validForSeconds < 60 ||
    result.validForSeconds > 7 * 24 * 60 * 60 ||
    !Array.isArray(result.lineItems) ||
    result.lineItems.length < 1 ||
    result.lineItems.length > 32 ||
    (
      result.providerReference !== undefined &&
      result.providerReference !== null &&
      (
        typeof result.providerReference !== "string" ||
        result.providerReference.length > 512
      )
    )
  ) {
    throw new Error("Pricing provider returned an invalid quote contract.");
  }
  const codes = new Set<string>();
  const lineItems: PriceQuoteLineItem[] = result.lineItems.map((line) => {
    if (
      !LINE_ITEM_CODE_PATTERN.test(line.code) ||
      codes.has(line.code) ||
      typeof line.label !== "string" ||
      !line.label.trim() ||
      line.label.length > 160 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1
    ) {
      throw new Error("Pricing provider returned an invalid line item.");
    }
    codes.add(line.code);
    assertMinorAmount(line.unitAmountMinor, "Line-item unit amount");
    assertMinorAmount(line.amountMinor, "Line-item amount");
    if (
      !Number.isSafeInteger(line.quantity * line.unitAmountMinor) ||
      line.amountMinor !== line.quantity * line.unitAmountMinor
    ) {
      throw new Error("Pricing provider line-item arithmetic is inconsistent.");
    }
    return { ...line, label: line.label.trim() };
  });
  const totalAmountMinor = lineItems.reduce((total, line) => {
    const next = total + line.amountMinor;
    if (!Number.isSafeInteger(next)) throw new Error("Quote total exceeds the safe integer range.");
    return next;
  }, 0);
  return {
    result: {
      ...structuredClone(result),
      lineItems,
      providerReference: result.providerReference ?? null,
    },
    totalAmountMinor,
  };
}

export class PricingService {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly provider: PricingProvider,
    private readonly quotes: PriceQuoteRepository,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID(),
  ) {}

  private normalizeInput(input: CreatePriceQuoteInput) {
    if (!PRODUCT_ID_PATTERN.test(input.productId)) {
      throw new ValidationError("INVALID_PRODUCT", "Product id is invalid.");
    }
    if (
      input.productVersionId !== null &&
      !VERSION_ID_PATTERN.test(input.productVersionId)
    ) {
      throw new ValidationError(
        "INVALID_PRODUCT_VERSION",
        "productVersionId must be a bounded version id or null.",
      );
    }
    if (
      !Number.isInteger(input.quantity) ||
      input.quantity < 1 ||
      input.quantity > PRICE_QUOTE_MAX_QUANTITY
    ) {
      throw new ValidationError(
        "INVALID_QUANTITY",
        `Quantity must be an integer from 1 to ${PRICE_QUOTE_MAX_QUANTITY}.`,
      );
    }
    if (
      input.requestKey.length > PRICE_QUOTE_REQUEST_KEY_MAX_LENGTH ||
      !REQUEST_KEY_PATTERN.test(input.requestKey)
    ) {
      throw new ValidationError(
        "INVALID_REQUEST_KEY",
        "clientRequestId must be a bounded opaque identifier.",
      );
    }
    try {
      return {
        ...input,
        optionSelection: parseOptionSelection(input.optionSelection),
      };
    } catch (error) {
      if (error instanceof ProductDomainError) {
        throw new ValidationError(error.code, error.message, error.details);
      }
      throw error;
    }
  }

  async create(input: CreatePriceQuoteInput): Promise<CreatePriceQuoteResult> {
    const normalized = this.normalizeInput(input);
    const fingerprint = requestFingerprint({
      productId: normalized.productId,
      productVersionId: normalized.productVersionId,
      optionSelection: normalized.optionSelection,
      quantity: normalized.quantity,
    });
    const existing = await this.quotes.findByRequestKey(
      normalized.owner,
      normalized.requestKey,
    );
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new PlatformError(
          "QUOTE_IDEMPOTENCY_CONFLICT",
          "That clientRequestId was already used for a different quote request.",
          409,
        );
      }
      return { quote: toDto(existing, this.clock()), created: false };
    }

    let configuration: ResolvedProductConfiguration;
    try {
      const definition = await this.catalog.definition(normalized.productId);
      if (!definition.currentVersionId || definition.visibility !== "public") {
        throw new NotFoundError("The requested product was not found.");
      }
      configuration = await this.catalog.resolve(
        normalized.productId,
        normalized.productVersionId,
        normalized.optionSelection,
      );
    } catch (error) {
      if (error instanceof PlatformError) throw error;
      if (error instanceof ProductDomainError) {
        if (error.code === "PRODUCT_NOT_FOUND" || error.code === "PRODUCT_VERSION_NOT_FOUND") {
          throw new NotFoundError("The requested product was not found.");
        }
        throw new ValidationError(error.code, error.message, error.details);
      }
      throw error;
    }

    let providerResult;
    try {
      providerResult = await this.provider.quote({
        configuration,
        quantity: normalized.quantity,
      });
    } catch (error) {
      console.error(JSON.stringify({
        scope: "vortex-platform",
        event: "pricing.provider-failed",
        productId: configuration.productId,
        productVersionId: configuration.productVersionId,
        configurationId: configuration.configurationId,
        failureType: error instanceof Error ? "provider-error" : "non-error-throw",
      }));
      throw new PlatformError(
        "PRICING_PROVIDER_FAILED",
        "Pricing is temporarily unavailable for this configuration.",
        503,
      );
    }
    if (!providerResult) {
      throw new PlatformError(
        "PRICING_UNAVAILABLE",
        "Pricing is not configured for this product configuration.",
        422,
      );
    }

    let validated;
    try {
      validated = validateProviderResult(providerResult);
    } catch (error) {
      console.error(JSON.stringify({
        scope: "vortex-platform",
        event: "pricing.provider-contract-invalid",
        productId: configuration.productId,
        productVersionId: configuration.productVersionId,
        configurationId: configuration.configurationId,
        failureType: error instanceof Error ? "invalid-provider-contract" : "non-error-throw",
      }));
      throw new PlatformError(
        "PRICING_PROVIDER_FAILED",
        "Pricing is temporarily unavailable for this configuration.",
        503,
      );
    }

    const now = this.clock();
    const quote: PriceQuote = {
      id: this.idFactory(),
      owner: structuredClone(normalized.owner),
      requestKey: normalized.requestKey,
      requestFingerprint: fingerprint,
      productId: configuration.productId,
      productVersionId: configuration.productVersionId,
      configurationId: configuration.configurationId,
      optionSelection: structuredClone(configuration.selection),
      quantity: normalized.quantity,
      kind: validated.result.kind,
      currency: validated.result.currency,
      lineItems: structuredClone(validated.result.lineItems),
      totalAmountMinor: validated.totalAmountMinor,
      taxIncluded: validated.result.taxIncluded,
      shippingIncluded: validated.result.shippingIncluded,
      pricingVersion: validated.result.pricingVersion,
      providerId: this.provider.id,
      providerReference: validated.result.providerReference ?? null,
      createdAt: now,
      expiresAt: new Date(
        Date.parse(now) + validated.result.validForSeconds * 1_000,
      ).toISOString(),
    };
    const stored = await this.quotes.create(quote);
    if (stored.quote.requestFingerprint !== fingerprint) {
      throw new PlatformError(
        "QUOTE_IDEMPOTENCY_CONFLICT",
        "That clientRequestId was already used for a different quote request.",
        409,
      );
    }
    if (stored.created) {
      console.info(JSON.stringify({
        scope: "vortex-platform",
        event: "pricing.quote-created",
        quoteId: stored.quote.id,
        productId: stored.quote.productId,
        productVersionId: stored.quote.productVersionId,
        configurationId: stored.quote.configurationId,
        quantity: stored.quote.quantity,
        kind: stored.quote.kind,
      }));
    }
    return { quote: toDto(stored.quote, now), created: stored.created };
  }

  async get(owner: CreatePriceQuoteInput["owner"], quoteId: string) {
    if (!VERSION_ID_PATTERN.test(quoteId)) {
      throw new NotFoundError("The requested price quote was not found.");
    }
    const quote = await this.quotes.findById(quoteId, owner);
    if (!quote) throw new NotFoundError("The requested price quote was not found.");
    return toDto(quote, this.clock());
  }
}
