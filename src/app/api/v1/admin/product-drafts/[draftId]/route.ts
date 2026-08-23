import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import {
  assertSameOriginMutation,
  json,
  readJson,
  withAdminApi,
} from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { productDraftAdminDto } from "@/server/products/admin-dto";
import { getProductPublishingService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ draftId: string }> };

export function GET(request: NextRequest, context: Context) {
  return withAdminApi(async () => {
    const operator = await getOperatorAuthorizationService().require(
      request.headers,
      "products:read",
    );
    const { draftId } = await context.params;
    return json({
      draft: productDraftAdminDto(
        await getProductPublishingService().get(operator, draftId),
      ),
    });
  });
}

export function PATCH(request: NextRequest, context: Context) {
  return withAdminApi(async () => {
    assertSameOriginMutation(request);
    const operator = await getOperatorAuthorizationService().require(
      request.headers,
      "products:edit",
    );
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("INVALID_REQUEST", "Product draft patch is invalid.");
    }
    const values = body as Record<string, unknown>;
    const allowed = new Set(["expectedRevision", "name", "description", "visibility"]);
    if (Object.keys(values).some((key) => !allowed.has(key))) {
      throw new ValidationError("INVALID_REQUEST", "Product draft patch has unknown fields.");
    }
    if (!Number.isInteger(values.expectedRevision) || Number(values.expectedRevision) < 1) {
      throw new ValidationError("INVALID_REVISION", "expectedRevision is required.");
    }
    if (values.name !== undefined && typeof values.name !== "string") {
      throw new ValidationError("INVALID_REQUEST", "name must be a string.");
    }
    if (
      values.description !== undefined &&
      values.description !== null &&
      typeof values.description !== "string"
    ) {
      throw new ValidationError("INVALID_REQUEST", "description must be a string or null.");
    }
    if (
      values.visibility !== undefined &&
      values.visibility !== "public" &&
      values.visibility !== "unlisted"
    ) {
      throw new ValidationError("INVALID_REQUEST", "visibility is invalid.");
    }
    const { draftId } = await context.params;
    const current = await getProductPublishingService().get(operator, draftId);
    const document = structuredClone(current.document);
    if (values.name !== undefined) document.definition.name = values.name as string;
    if (values.description === null) delete document.definition.description;
    else if (values.description !== undefined) {
      document.definition.description = values.description as string;
    }
    if (values.visibility !== undefined) {
      document.visibility = values.visibility as "public" | "unlisted";
    }
    const updated = await getProductPublishingService().update(
      operator,
      draftId,
      Number(values.expectedRevision),
      document,
    );
    return json({ draft: productDraftAdminDto(updated) });
  });
}
