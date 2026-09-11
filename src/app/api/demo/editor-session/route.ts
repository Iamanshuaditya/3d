import type { NextRequest } from "next/server";
import { assertSameOriginMutation, json, readJson, withPublicApi } from "@/server/http/api";
import { PlatformError } from "@/platform/projects/errors";
import { assertRateLimit } from "@/server/http/rate-limit";
import { getEmbedClientRegistry } from "@/server/embed/embed-client-registry";
import { getEditorSessionService } from "@/server/embed/editor-session-container";
import { verifyEditorToken } from "@/server/embed/editor-session-auth";
import { EditorSessionRepository } from "@/server/embed/editor-session-repository";
import { getVortexDatabase } from "@/server/persistence/database";

export const runtime = "nodejs";

function assertLocalDemo(request: NextRequest) {
  if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)) {
    throw new PlatformError("NOT_FOUND", "Not found.", 404);
  }
}

/** Local demonstration only. Published integrations use their own authenticated backend. */
export async function POST(request: NextRequest) {
  return withPublicApi(async () => {
    assertLocalDemo(request);
    assertSameOriginMutation(request);
    const client = getEmbedClientRegistry().find("local-demo");
    if (!client) throw new PlatformError("NOT_FOUND", "Demo unavailable.", 404);
    await assertRateLimit("editor-local-demo", { type: "user", id: "local-demo" }, { limit: 30, windowMs: 60_000 });
    // Opening the demo at 127.0.0.1 exercises a real cross-origin iframe, while
    // both applications remain local. Published sessions use VORTEX_PUBLIC_URL.
    const editorOrigin = new URL(request.nextUrl.origin);
    editorOrigin.hostname = "localhost";
    return json(await getEditorSessionService().create(client, await readJson(request), editorOrigin.origin), 201);
  });
}

/** Read the current result after full-page navigation, using only this demo's scoped token. */
export async function GET(request: NextRequest) {
  return withPublicApi(async () => {
    assertLocalDemo(request);
    const session = verifyEditorToken(request.headers.get("x-vortex-session") ?? "",
      new EditorSessionRepository(getVortexDatabase()), getEmbedClientRegistry());
    if (session.clientId !== "local-demo" || session.id !== request.nextUrl.searchParams.get("sessionId")) {
      throw new PlatformError("EDITOR_SCOPE_FORBIDDEN", "This session cannot access that demo result.", 403);
    }
    return json(await getEditorSessionService().status(session.clientId, session.id));
  });
}
