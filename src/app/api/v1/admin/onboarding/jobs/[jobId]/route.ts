import type { NextRequest } from "next/server";
import { json, withAdminApi } from "@/server/http/api";
import { onboardingJobAdminDto } from "@/server/onboarding/admin-dto";
import { getOnboardingService } from "@/server/onboarding/container";
import { getOperatorAuthorizationService } from "@/server/operators/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  return withAdminApi(async () => {
    await getOperatorAuthorizationService().require(request.headers, "onboarding:run");
    const { jobId } = await context.params;
    const { job, assets } = await getOnboardingService().get(jobId);
    return json({ job: onboardingJobAdminDto(job, assets) });
  });
}
