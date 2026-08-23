import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { assertSameOriginMutation, json, readJson, withAdminApi } from "@/server/http/api";
import { getOnboardingService } from "@/server/onboarding/container";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { productDraftAdminDto } from "@/server/products/admin-dto";
import { getProductPublishingService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  return withAdminApi(async () => {
    assertSameOriginMutation(request);
    await getOperatorAuthorizationService().require(request.headers, "onboarding:run");
    const operator = await getOperatorAuthorizationService().require(
      request.headers,
      "products:edit",
    );
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("INVALID_REQUEST", "Onboarding attachment is invalid.");
    }
    const values = body as Record<string, unknown>;
    if (
      Object.keys(values).some((key) => key !== "draftId" && key !== "expectedRevision") ||
      typeof values.draftId !== "string" ||
      !Number.isInteger(values.expectedRevision) ||
      Number(values.expectedRevision) < 1
    ) {
      throw new ValidationError(
        "INVALID_REQUEST",
        "draftId and expectedRevision are required.",
      );
    }
    const { jobId } = await context.params;
    const { job } = await getOnboardingService().get(jobId);
    if (job.status !== "passed" || !job.reportAssetId) {
      throw new ValidationError(
        "ONBOARDING_JOB_NOT_PASSED",
        "Only a passed onboarding report can be attached.",
      );
    }
    const current = await getProductPublishingService().get(operator, values.draftId);
    if (current.productId !== job.productId) {
      throw new ValidationError(
        "ONBOARDING_PRODUCT_MISMATCH",
        "The onboarding job belongs to another product.",
      );
    }
    const report = await getOnboardingService().readOutput(job.id, job.reportAssetId);
    const draft = await getProductPublishingService().attachOnboarding(
      operator,
      current.id,
      Number(values.expectedRevision),
      {
        jobId: job.id,
        reportChecksum: report.asset.sha256,
        toolVersion: job.commandVersion,
      },
    );
    return json({ draft: productDraftAdminDto(draft) });
  });
}
