import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAdminApi } from "@/server/http/api";
import { getOnboardingService } from "@/server/onboarding/container";
import { getOperatorAuthorizationService } from "@/server/operators/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string; assetId: string }> },
) {
  return withAdminApi(async () => {
    await getOperatorAuthorizationService().require(request.headers, "onboarding:run");
    const { jobId, assetId } = await context.params;
    const output = await getOnboardingService().readOutput(jobId, assetId);
    return new NextResponse(Buffer.from(output.bytes), {
      headers: {
        "Content-Type": output.asset.mimeType,
        "Content-Length": String(output.asset.byteSize),
        "Content-Disposition": `attachment; filename="${output.asset.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
