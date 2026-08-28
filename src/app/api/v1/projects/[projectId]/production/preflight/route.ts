import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { getProductionService } from "@/server/production/container";
import { assertSameOriginMutation, json, readJson, withOwner } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    await assertRateLimit("production-preflight", owner, { limit: 30, windowMs: 60_000 });
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("INVALID_REQUEST", "Production preflight request is invalid.");
    }
    const revision = (body as { revision?: unknown }).revision;
    const { projectId } = await context.params;
    return json({
      preflight: await getProductionService().preflight(
        owner,
        projectId,
        revision === undefined ? undefined : Number(revision),
      ),
    });
  });
}

