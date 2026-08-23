import type { NextRequest } from "next/server";
import { withOwner, json } from "@/server/http/api";
import { getPersonalizationService } from "@/server/personalization/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ jobId: string }> };

export function GET(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    const { jobId } = await context.params;
    return json({ job: await getPersonalizationService().getJob(owner, jobId) });
  });
}
