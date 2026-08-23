import type { NextRequest } from "next/server";
import { getProjectService } from "@/server/projects/container";
import { assertSameOriginMutation, json, withOwner } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    assertRateLimit("preview-generation", owner, { limit: 30, windowMs: 60_000 });
    const { projectId } = await context.params;
    return json({ project: await getProjectService().generatePreview(owner, projectId) });
  });
}

