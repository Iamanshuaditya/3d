import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getProjectService } from "@/server/projects/container";
import { withOwner } from "@/server/http/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string; assetId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    const { projectId, assetId } = await context.params;
    const { asset, object } = await getProjectService().readAsset(owner, projectId, assetId);
    return new NextResponse(object.bytes.slice().buffer, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(object.byteSize),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
        "Cache-Control": "private, max-age=3600, immutable",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
