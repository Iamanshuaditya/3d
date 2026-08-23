import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { json, withPublicApi } from "@/server/http/api";
import { getProductApiService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ productId: string }> };

function versionId(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("version");
  if (value !== null && value.length > 160) {
    throw new ValidationError("INVALID_PRODUCT_VERSION", "Product version id is too long.");
  }
  return value ?? undefined;
}

export async function GET(request: NextRequest, context: Context) {
  return withPublicApi(async () => {
    const { productId } = await context.params;
    if (!productId || productId.length > 128) {
      throw new ValidationError("INVALID_PRODUCT", "Product id is invalid.");
    }
    return json({
      product: await getProductApiService().get(productId, versionId(request)),
    });
  });
}
