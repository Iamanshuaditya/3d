import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { json, readJson, assertSameOriginMutation, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { getTemplateDraftService } from "@/server/templates/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ draftId: string }> };

export function POST(request: NextRequest, context: Context) {
  return withAdminApi(async () => {
    assertSameOriginMutation(request);
    const operator = await getOperatorAuthorizationService().require(request.headers, "templates:publish");
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "expectedRevision") ||
      !Number.isInteger((body as { expectedRevision?: unknown }).expectedRevision)) {
      throw new ValidationError("INVALID_REQUEST", "expectedRevision is required.");
    }
    const { draftId } = await context.params;
    return json(await getTemplateDraftService().publish(
      operator,
      draftId,
      (body as { expectedRevision: number }).expectedRevision,
    ), 201);
  });
}
