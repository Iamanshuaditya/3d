import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { assertSameOriginMutation, json, readJson, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { productDraftAdminDto } from "@/server/products/admin-dto";
import { getProductPublishingService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  context: { params: Promise<{ draftId: string }> },
) {
  return withAdminApi(async () => {
    assertSameOriginMutation(request);
    const operator = await getOperatorAuthorizationService().require(
      request.headers,
      "products:publish",
    );
    const body = await readJson(request);
    const values = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
    if (!values || Object.keys(values).some((key) => key !== "expectedRevision")) {
      throw new ValidationError("INVALID_REQUEST", "Publish request is invalid.");
    }
    const expectedRevision = values.expectedRevision;
    if (!Number.isInteger(expectedRevision) || Number(expectedRevision) < 1) {
      throw new ValidationError("INVALID_REVISION", "expectedRevision is required.");
    }
    const { draftId } = await context.params;
    const result = await getProductPublishingService().publish(
      operator,
      draftId,
      Number(expectedRevision),
    );
    return json({
      draft: productDraftAdminDto(result.draft),
      publishedVersion: {
        id: result.version.id,
        productId: result.version.productId,
        version: result.version.version,
        publishedAt: result.version.publishedAt,
      },
    });
  });
}
