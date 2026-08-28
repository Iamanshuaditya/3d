import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { assertRateLimit } from "@/server/http/rate-limit";
import {
  assertSameOriginMutation,
  json,
  readJson,
  withOwner,
} from "@/server/http/api";
import { getTemplateService } from "@/server/templates/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ templateId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    await assertRateLimit("project-mutation", owner, { limit: 120, windowMs: 60_000 });
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("INVALID_REQUEST", "Template request is invalid.");
    }
    const { templateId } = await context.params;
    return json(
      {
        project: await getTemplateService().instantiate(
          owner,
          templateId,
          body as Parameters<ReturnType<typeof getTemplateService>["instantiate"]>[2],
        ),
      },
      201,
    );
  });
}
