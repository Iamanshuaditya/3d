import { NextResponse, type NextRequest } from "next/server";
import { withPublicApi } from "@/server/http/api";
import { authenticateMerchant } from "@/server/embed/editor-session-auth";
import { getEmbedClientRegistry } from "@/server/embed/embed-client-registry";
import { getEditorSessionService } from "@/server/embed/editor-session-container";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  return withPublicApi(async () => {
    const client = authenticateMerchant(request, getEmbedClientRegistry());
    const { artifact, object } = await getEditorSessionService().artifact(client.id, (await context.params).sessionId);
    return new NextResponse(object.bytes.slice().buffer, { headers: {
      "Content-Type": artifact.mimeType, "Content-Length": String(object.byteSize),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Content-SHA256": artifact.sha256,
    } });
  });
}
