import type { NextRequest } from "next/server";
import { json, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { productAuditAdminDto } from "@/server/products/admin-dto";
import { getProductPublishingService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  context: { params: Promise<{ draftId: string }> },
) {
  return withAdminApi(async () => {
    const operator = await getOperatorAuthorizationService().require(
      request.headers,
      "products:read",
    );
    const { draftId } = await context.params;
    const events = await getProductPublishingService().audit(operator, draftId);
    return json({ events: events.map(productAuditAdminDto) });
  });
}
