import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withOwner } from "@/server/http/api";
import { getPersonalizationService } from "@/server/personalization/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ jobId: string }> };

export function GET(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    const { jobId } = await context.params;
    const { job, object } = await getPersonalizationService().readOutput(owner, jobId);
    return new NextResponse(Uint8Array.from(object.bytes).buffer, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="personalization-${job.id}.ndjson"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  });
}
