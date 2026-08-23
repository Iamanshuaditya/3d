import type { ProjectOwner } from "@/platform/projects/types";
import type {
  OptionSelection,
  ResolvedProductConfiguration,
} from "@/platform/products/types";

export type PriceQuoteKind = "estimate" | "contract";

export type PriceQuoteLineItem = {
  code: string;
  label: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
};

export type PricingProviderInput = {
  configuration: ResolvedProductConfiguration;
  quantity: number;
};

export type PricingProviderResult = {
  kind: PriceQuoteKind;
  currency: string;
  pricingVersion: string;
  lineItems: PriceQuoteLineItem[];
  taxIncluded: boolean;
  shippingIncluded: boolean;
  validForSeconds: number;
  /** Internal provider reference. Never expose it through a public DTO. */
  providerReference?: string | null;
};

export interface PricingProvider {
  readonly id: string;
  quote(input: PricingProviderInput): Promise<PricingProviderResult | null>;
}

/** Immutable, owner-scoped snapshot of one server-resolved commercial offer. */
export type PriceQuote = {
  id: string;
  owner: ProjectOwner;
  requestKey: string;
  requestFingerprint: string;
  productId: string;
  productVersionId: string;
  configurationId: string;
  optionSelection: OptionSelection;
  quantity: number;
  kind: PriceQuoteKind;
  currency: string;
  lineItems: PriceQuoteLineItem[];
  totalAmountMinor: number;
  taxIncluded: boolean;
  shippingIncluded: boolean;
  pricingVersion: string;
  /** Server-only provider identity and reference. */
  providerId: string;
  providerReference: string | null;
  createdAt: string;
  expiresAt: string;
};

export type PriceQuoteStatus = "active" | "expired";

export type PriceQuoteDto = Omit<
  PriceQuote,
  | "owner"
  | "requestKey"
  | "requestFingerprint"
  | "providerId"
  | "providerReference"
> & {
  status: PriceQuoteStatus;
  links: {
    self: string;
    product: string;
  };
};

export type CreatePriceQuoteInput = {
  owner: ProjectOwner;
  productId: string;
  productVersionId: string | null;
  optionSelection: unknown;
  quantity: number;
  requestKey: string;
};

export type CreatePriceQuoteResult = {
  quote: PriceQuoteDto;
  created: boolean;
};

export const PRICE_QUOTE_MAX_QUANTITY = 1_000_000;
export const PRICE_QUOTE_REQUEST_KEY_MAX_LENGTH = 160;
