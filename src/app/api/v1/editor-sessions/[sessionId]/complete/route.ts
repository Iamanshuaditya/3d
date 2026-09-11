import type { NextRequest } from "next/server";
import { assertSameOriginMutation, json, readJson, withPublicApi } from "@/server/http/api";
import { PlatformError, ValidationError } from "@/platform/projects/errors";
import { assertRateLimit } from "@/server/http/rate-limit";
import { editorRequestSession } from "@/server/embed/editor-session-auth";
import { getEditorSessionService } from "@/server/embed/editor-session-container";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  return withPublicApi(async () => {
    assertSameOriginMutation(request);
    const session = editorRequestSession(request);
    if (!session || session.id !== (await context.params).sessionId) throw new PlatformError("INVALID_EDITOR_SESSION", "An authorized editor session is required.", 401);
    await assertRateLimit("editor-completion", { type: "guest", id: session.ownerId }, { limit: 10, windowMs: 60_000 });
    const body = await readJson(request);
    if (!body || typeof body !== "object") throw new ValidationError("INVALID_REQUEST", "revision is required.");
    return json(await getEditorSessionService().complete(session, (body as { revision?: unknown }).revision));
  });
}
