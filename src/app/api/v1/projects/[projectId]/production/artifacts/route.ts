import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import type { ProductionArtifactKind } from "@/platform/production/types";
import { assertSameOriginMutation, json, readJson, withOwner } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";
import { getProductionService } from "@/server/production/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    const { projectId } = await context.params;
    return json({ artifacts: await getProductionService().list(owner, projectId) });
  });
}

export async function POST(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    await assertRateLimit("production-generation", owner, { limit: 10, windowMs: 60_000 });
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("INVALID_REQUEST", "Production generation request is invalid.");
    }
    const values = body as { revision?: unknown; kind?: unknown };
    const kind: ProductionArtifactKind =
      values.kind === undefined || values.kind === "pdf" || values.kind === "svg"
      ? (values.kind ?? "pdf")
      : (() => {
          throw new ValidationError(
            "PRODUCTION_FORMAT_UNSUPPORTED",
            "Only PDF and manufacturing SVG artifacts are currently available.",
          );
        })();
    const { projectId } = await context.params;
    return json(
      {
        artifact: await getProductionService().generate(
          owner,
          projectId,
          kind,
          values.revision === undefined ? undefined : Number(values.revision),
        ),
      },
      201,
    );
  });
}
