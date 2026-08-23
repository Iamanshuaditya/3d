import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { json, readJson, assertSameOriginMutation, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { getTemplateDraftService } from "@/server/templates/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return withAdminApi(async () => {
    const operator = await getOperatorAuthorizationService().require(request.headers, "templates:read");
    return json({ drafts: await getTemplateDraftService().list(operator) });
  });
}

export function POST(request: NextRequest) {
  return withAdminApi(async () => {
    assertSameOriginMutation(request);
    const operator = await getOperatorAuthorizationService().require(request.headers, "templates:edit");
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["templateId", "document"].includes(key))) {
      throw new ValidationError("INVALID_REQUEST", "Template draft request is invalid.");
    }
    const { templateId, document } = body as { templateId?: unknown; document?: unknown };
    if (typeof templateId !== "string") {
      throw new ValidationError("INVALID_REQUEST", "templateId is required.");
    }
    const draft = await getTemplateDraftService().create(operator, {
      templateId,
      ...(document !== undefined ? { document } : {}),
    });
    return json({ draft }, 201);
  });
}
