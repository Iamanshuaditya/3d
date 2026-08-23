import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withOwner } from "@/server/http/api";
import { getProductionService } from "@/server/production/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ artifactId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    const { artifactId } = await context.params;
    const { artifact, object } = await getProductionService().read(owner, artifactId);
    const bytes = object.bytes.slice();
    return new NextResponse(bytes.buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
        "Content-Length": String(object.byteSize),
        "Content-Type": artifact.mimeType,
        ETag: `"${artifact.sha256}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

