import type { NextRequest } from "next/server";
import { assertSameOriginMutation, withOwner, json } from "@/server/http/api";
import { getPersonalizationService } from "@/server/personalization/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ jobId: string }> };

export function POST(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    const { jobId } = await context.params;
    return json({ job: await getPersonalizationService().retry(owner, jobId) }, 202);
  });
}
