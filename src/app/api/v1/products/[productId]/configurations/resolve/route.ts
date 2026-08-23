import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { json, readJson, withPublicApi } from "@/server/http/api";
import { getProductApiService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ productId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withPublicApi(async () => {
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("INVALID_REQUEST", "Configuration request is invalid.");
    }
    const fields = body as Record<string, unknown>;
    const unknown = Object.keys(fields).filter(
      (key) => key !== "productVersionId" && key !== "optionSelection",
    );
    if (unknown.length) {
      throw new ValidationError(
        "INVALID_REQUEST",
        `Unknown configuration field ${unknown[0]}.`,
      );
    }
    const version = fields.productVersionId;
    if (
      version !== undefined &&
      version !== null &&
      (typeof version !== "string" || version.length > 160)
    ) {
      throw new ValidationError(
        "INVALID_PRODUCT_VERSION",
        "productVersionId must be a bounded string or null.",
      );
    }
    const { productId } = await context.params;
    if (!productId || productId.length > 128) {
      throw new ValidationError("INVALID_PRODUCT", "Product id is invalid.");
    }
    return json({
      configuration: await getProductApiService().resolve(
        productId,
        typeof version === "string" ? version : null,
        fields.optionSelection,
      ),
    });
  });
}
