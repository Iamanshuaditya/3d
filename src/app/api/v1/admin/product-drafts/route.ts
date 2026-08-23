import type { NextRequest } from "next/server";
import { json, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { productDraftAdminDto } from "@/server/products/admin-dto";
import { getProductPublishingService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return withAdminApi(async () => {
    const operator = await getOperatorAuthorizationService().require(
      request.headers,
      "products:read",
    );
    const drafts = await getProductPublishingService().list(operator);
    return json({ drafts: drafts.map(productDraftAdminDto) });
  });
}
