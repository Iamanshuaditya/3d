import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withPublicApi } from "@/server/http/api";
import { getTemplateService } from "@/server/templates/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ templateId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withPublicApi(async () => {
    const { templateId } = await context.params;
    const version = request.nextUrl.searchParams.get("version") ?? undefined;
    const preview = await getTemplateService().preview(templateId, version);
    return new NextResponse(Buffer.from(preview.bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(preview.bytes.byteLength),
        "Cache-Control": version
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  });
}
