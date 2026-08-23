import type { NextRequest } from "next/server";
import { json, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { getProductOperationsService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return withAdminApi(async () => {
    await getOperatorAuthorizationService().require(request.headers, "products:read");
    return json({ products: await getProductOperationsService().list() });
  });
}
