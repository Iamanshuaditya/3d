import type { NextRequest } from "next/server";
import { json, readJson, withPublicApi } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";
import { authenticateMerchant } from "@/server/embed/editor-session-auth";
import { getEmbedClientRegistry } from "@/server/embed/embed-client-registry";
import { getEditorSessionService } from "@/server/embed/editor-session-container";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withPublicApi(async () => {
    const client = authenticateMerchant(request, getEmbedClientRegistry());
    await assertRateLimit("editor-launch", { type: "user", id: client.id }, { limit: 60, windowMs: 60_000 });
    return json(await getEditorSessionService().create(client, await readJson(request),
      process.env.VORTEX_PUBLIC_URL || request.nextUrl.origin), 201);
  });
}
