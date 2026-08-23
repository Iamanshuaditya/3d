import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { json, readJson, assertSameOriginMutation, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { getTemplateDraftService } from "@/server/templates/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ draftId: string }> };

export function GET(request: NextRequest, context: Context) {
  return withAdminApi(async () => {
    const operator = await getOperatorAuthorizationService().require(request.headers, "templates:read");
    const { draftId } = await context.params;
    return json({ draft: await getTemplateDraftService().find(operator, draftId) });
  });
}

export function PATCH(request: NextRequest, context: Context) {
  return withAdminApi(async () => {
    assertSameOriginMutation(request);
    const operator = await getOperatorAuthorizationService().require(request.headers, "templates:edit");
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["expectedRevision", "document"].includes(key))) {
      throw new ValidationError("INVALID_REQUEST", "Template draft update is invalid.");
    }
    const { expectedRevision, document } = body as {
      expectedRevision?: unknown;
      document?: unknown;
    };
    if (!Number.isInteger(expectedRevision) || document === undefined) {
      throw new ValidationError("INVALID_REQUEST", "expectedRevision and document are required.");
    }
    const { draftId } = await context.params;
    const draft = await getTemplateDraftService().update(
      operator,
      draftId,
      expectedRevision as number,
      document,
    );
    return json({ draft });
  });
}
