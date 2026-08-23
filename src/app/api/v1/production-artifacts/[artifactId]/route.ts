import type { NextRequest } from "next/server";
import { json, withOwner } from "@/server/http/api";
import { getProductionService } from "@/server/production/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ artifactId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    const { artifactId } = await context.params;
    return json({ artifact: await getProductionService().metadata(owner, artifactId) });
  });
}

