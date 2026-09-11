import type { NextRequest } from "next/server";
import { json, withPublicApi } from "@/server/http/api";
import { authenticateMerchant } from "@/server/embed/editor-session-auth";
import { getEmbedClientRegistry } from "@/server/embed/embed-client-registry";
import { getEditorSessionService } from "@/server/embed/editor-session-container";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  return withPublicApi(async () => {
    const client = authenticateMerchant(request, getEmbedClientRegistry());
    return json(await getEditorSessionService().status(client.id, (await context.params).sessionId));
  });
}
