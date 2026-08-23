import type { NextRequest } from "next/server";
import { json, withOwner } from "@/server/http/api";
import { getPricingService } from "@/server/pricing/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ quoteId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    const { quoteId } = await context.params;
    return json({ quote: await getPricingService().get(owner, quoteId) });
  });
}
