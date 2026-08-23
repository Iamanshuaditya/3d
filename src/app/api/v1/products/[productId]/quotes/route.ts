import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import {
  assertSameOriginMutation,
  json,
  readJson,
  withOwner,
} from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";
import { getPricingService } from "@/server/pricing/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ productId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    assertRateLimit("price-quote", owner, { limit: 60, windowMs: 60_000 });
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("INVALID_REQUEST", "Price quote request is invalid.");
    }
    const fields = body as Record<string, unknown>;
    const unknown = Object.keys(fields).filter(
      (key) => ![
        "productVersionId",
        "optionSelection",
        "quantity",
        "clientRequestId",
      ].includes(key),
    );
    if (unknown.length) {
      throw new ValidationError(
        "INVALID_REQUEST",
        `Unknown price quote field ${unknown[0]}.`,
      );
    }
    if (typeof fields.quantity !== "number") {
      throw new ValidationError("INVALID_QUANTITY", "quantity is required.");
    }
    if (typeof fields.clientRequestId !== "string") {
      throw new ValidationError(
        "INVALID_REQUEST_KEY",
        "clientRequestId is required.",
      );
    }
    const version = fields.productVersionId;
    if (version !== undefined && version !== null && typeof version !== "string") {
      throw new ValidationError(
        "INVALID_PRODUCT_VERSION",
        "productVersionId must be a string or null.",
      );
    }
    const { productId } = await context.params;
    const result = await getPricingService().create({
      owner,
      productId,
      productVersionId: typeof version === "string" ? version : null,
      optionSelection: fields.optionSelection ?? {},
      quantity: fields.quantity,
      requestKey: fields.clientRequestId,
    });
    return json(result, result.created ? 201 : 200);
  });
}
