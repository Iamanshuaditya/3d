import { parseOptionSelection } from "@/platform/products/configuration-resolver";
import type { ProjectOwner } from "@/platform/projects/types";
import type {
  PriceQuote,
  PriceQuoteKind,
  PriceQuoteLineItem,
} from "@/platform/pricing/types";
import type {
  PriceQuoteRepository,
  StorePriceQuoteResult,
} from "@/platform/pricing/repository";
import type { VortexDatabase } from "@/server/persistence/database";

type PriceQuoteRow = {
  id: string;
  owner_type: ProjectOwner["type"];
  owner_id: string;
  request_key: string;
  request_fingerprint: string;
  product_id: string;
  product_version_id: string;
  configuration_id: string;
  option_selection_json: string;
  quantity: number;
  quote_kind: PriceQuoteKind;
  currency: string;
  line_items_json: string;
  total_amount_minor: number;
  tax_included: number;
  shipping_included: number;
  pricing_version: string;
  provider_id: string;
  provider_reference: string | null;
  created_at: string;
  expires_at: string;
};

function decodeQuote(row: PriceQuoteRow): PriceQuote {
  return {
    id: row.id,
    owner: { type: row.owner_type, id: row.owner_id } as ProjectOwner,
    requestKey: row.request_key,
    requestFingerprint: row.request_fingerprint,
    productId: row.product_id,
    productVersionId: row.product_version_id,
    configurationId: row.configuration_id,
    optionSelection: parseOptionSelection(JSON.parse(row.option_selection_json)),
    quantity: row.quantity,
    kind: row.quote_kind,
    currency: row.currency,
    lineItems: JSON.parse(row.line_items_json) as PriceQuoteLineItem[],
    totalAmountMinor: row.total_amount_minor,
    taxIncluded: row.tax_included === 1,
    shippingIncluded: row.shipping_included === 1,
    pricingVersion: row.pricing_version,
    providerId: row.provider_id,
    providerReference: row.provider_reference,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

const OWNER_SQL = "owner_type = ? AND owner_id = ?";

export class SqlitePriceQuoteRepository implements PriceQuoteRepository {
  constructor(private readonly database: VortexDatabase) {}

  async create(quote: PriceQuote): Promise<StorePriceQuoteResult> {
    return this.database.transaction(() => {
      const inserted = this.database.prepare(`
        INSERT INTO price_quotes (
          id, owner_type, owner_id, request_key, request_fingerprint,
          product_id, product_version_id, configuration_id, option_selection_json,
          quantity, quote_kind, currency, line_items_json, total_amount_minor,
          tax_included, shipping_included, pricing_version, provider_id,
          provider_reference, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_type, owner_id, request_key) DO NOTHING
      `).run(
        quote.id,
        quote.owner.type,
        quote.owner.id,
        quote.requestKey,
        quote.requestFingerprint,
        quote.productId,
        quote.productVersionId,
        quote.configurationId,
        JSON.stringify(quote.optionSelection),
        quote.quantity,
        quote.kind,
        quote.currency,
        JSON.stringify(quote.lineItems),
        quote.totalAmountMinor,
        quote.taxIncluded ? 1 : 0,
        quote.shippingIncluded ? 1 : 0,
        quote.pricingVersion,
        quote.providerId,
        quote.providerReference,
        quote.createdAt,
        quote.expiresAt,
      );
      if (inserted.changes === 1) {
        return { quote: structuredClone(quote), created: true };
      }
      const existing = this.database.prepare(`
        SELECT * FROM price_quotes WHERE ${OWNER_SQL} AND request_key = ?
      `).get(quote.owner.type, quote.owner.id, quote.requestKey) as PriceQuoteRow | undefined;
      if (!existing) throw new Error("Price quote could not be created idempotently.");
      return { quote: decodeQuote(existing), created: false };
    })();
  }

  async findById(id: string, owner: ProjectOwner): Promise<PriceQuote | null> {
    const row = this.database.prepare(`
      SELECT * FROM price_quotes WHERE id = ? AND ${OWNER_SQL}
    `).get(id, owner.type, owner.id) as PriceQuoteRow | undefined;
    return row ? decodeQuote(row) : null;
  }

  async findByRequestKey(
    owner: ProjectOwner,
    requestKey: string,
  ): Promise<PriceQuote | null> {
    const row = this.database.prepare(`
      SELECT * FROM price_quotes WHERE ${OWNER_SQL} AND request_key = ?
    `).get(owner.type, owner.id, requestKey) as PriceQuoteRow | undefined;
    return row ? decodeQuote(row) : null;
  }
}
