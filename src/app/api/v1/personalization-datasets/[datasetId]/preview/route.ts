import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { withOwner } from "@/server/http/api";
import { getPersonalizationService } from "@/server/personalization/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ datasetId: string }> };

export function GET(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    const { datasetId } = await context.params;
    const rawRow = request.nextUrl.searchParams.get("row") ?? "0";
    if (!/^[0-9]+$/.test(rawRow)) {
      throw new ValidationError("PERSONALIZATION_PREVIEW_ROW_INVALID", "Preview row is invalid.");
    }
    const preview = await getPersonalizationService().preview(owner, datasetId, Number(rawRow));
    return new NextResponse(Uint8Array.from(preview.bytes).buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
