import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { getProjectService } from "@/server/projects/container";
import { assertSameOriginMutation, json, readJson, withOwner } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    const { projectId } = await context.params;
    return json({ project: await getProjectService().open(owner, projectId) });
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    assertRateLimit("project-mutation", owner, { limit: 120, windowMs: 60_000 });
    const { projectId } = await context.params;
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("INVALID_REQUEST", "Project update is invalid.");
    }
    const requestBody = body as {
      expectedRevision?: unknown;
      design?: unknown;
      title?: unknown;
      status?: unknown;
    };
    if (
      requestBody.status !== undefined &&
      requestBody.status !== "draft" &&
      requestBody.status !== "ready_for_preflight"
    ) {
      throw new ValidationError(
        "INVALID_STATUS",
        "Only draft and ready_for_preflight may be requested by the Studio.",
      );
    }
    return json({
      project: await getProjectService().update(owner, projectId, {
        expectedRevision: Number(requestBody.expectedRevision),
        design: requestBody.design,
        title: requestBody.title,
        status: requestBody.status,
      }),
    });
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    assertRateLimit("project-mutation", owner, { limit: 120, windowMs: 60_000 });
    const { projectId } = await context.params;
    await getProjectService().archive(owner, projectId);
    return json({ archived: true });
  });
}

