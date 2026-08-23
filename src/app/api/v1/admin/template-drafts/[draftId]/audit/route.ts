import type { NextRequest } from "next/server";
import { json, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { getTemplateDraftService } from "@/server/templates/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ draftId: string }> };

export function GET(request: NextRequest, context: Context) {
  return withAdminApi(async () => {
    const operator = await getOperatorAuthorizationService().require(request.headers, "templates:read");
    const { draftId } = await context.params;
    return json({ events: await getTemplateDraftService().audit(operator, draftId) });
  });
}
