import type { NextRequest } from "next/server";
import { productDraftAdminDto } from "@/server/products/admin-dto";
import { assertSameOriginMutation, json, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { getProductPublishingService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  return withAdminApi(async () => {
    assertSameOriginMutation(request);
    const operator = await getOperatorAuthorizationService().require(
      request.headers,
      "products:edit",
    );
    const { productId } = await context.params;
    const draft = await getProductPublishingService().createFromCurrent(operator, productId);
    return json({ draft: productDraftAdminDto(draft) }, 201);
  });
}
