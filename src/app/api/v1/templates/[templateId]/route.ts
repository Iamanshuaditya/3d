import type { NextRequest } from "next/server";
import { json, withPublicApi } from "@/server/http/api";
import { getTemplateService } from "@/server/templates/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ templateId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withPublicApi(async () => {
    const { templateId } = await context.params;
    const version = request.nextUrl.searchParams.get("version") ?? undefined;
    return json({ template: await getTemplateService().get(templateId, version) });
  });
}
