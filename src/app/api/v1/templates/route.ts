import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { json, withPublicApi } from "@/server/http/api";
import { getTemplateService } from "@/server/templates/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bounded(value: string | null, name: string) {
  if (value !== null && value.length > 160) {
    throw new ValidationError("INVALID_QUERY", `${name} is too long.`);
  }
  return value ?? undefined;
}

export async function GET(request: NextRequest) {
  return withPublicApi(async () => {
    const query = request.nextUrl.searchParams;
    const templates = await getTemplateService().list({
      productId: bounded(query.get("productId"), "productId"),
      productVersionId: bounded(query.get("productVersionId"), "productVersionId"),
      configurationId: bounded(query.get("configurationId"), "configurationId"),
      category: bounded(query.get("category"), "category"),
      search: bounded(query.get("search"), "search"),
    });
    return json({ templates });
  });
}
