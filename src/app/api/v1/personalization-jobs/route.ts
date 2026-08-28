import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { assertSameOriginMutation, json, readJson, withOwner } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";
import { getPersonalizationService } from "@/server/personalization/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return withOwner(request, async ({ owner }) =>
    json({ jobs: await getPersonalizationService().listJobs(owner) }));
}

export function POST(request: NextRequest) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    await assertRateLimit("personalization-job", owner, { limit: 20, windowMs: 60_000 });
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "datasetId")) {
      throw new ValidationError("INVALID_REQUEST", "Personalization job request is invalid.");
    }
    const datasetId = (body as { datasetId?: unknown }).datasetId;
    if (typeof datasetId !== "string") {
      throw new ValidationError("INVALID_REQUEST", "datasetId is required.");
    }
    const job = await getPersonalizationService().createJob(
      owner,
      datasetId,
      request.headers.get("idempotency-key") ?? "",
    );
    return json({ job }, 202);
  });
}
