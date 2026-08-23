import type { ProjectOwner } from "@/platform/projects/types";
import type { PriceQuote } from "./types";

export type StorePriceQuoteResult = {
  quote: PriceQuote;
  created: boolean;
};

export interface PriceQuoteRepository {
  create(quote: PriceQuote): Promise<StorePriceQuoteResult>;
  findById(id: string, owner: ProjectOwner): Promise<PriceQuote | null>;
  findByRequestKey(
    owner: ProjectOwner,
    requestKey: string,
  ): Promise<PriceQuote | null>;
}
