import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { getProjectService } from "@/server/projects/container";
import { assertSameOriginMutation, json, readJson, withOwner } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withOwner(request, async ({ owner }) =>
    json({ projects: await getProjectService().list(owner) }),
  );
}

export async function POST(request: NextRequest) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    assertRateLimit("project-mutation", owner, { limit: 120, windowMs: 60_000 });
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("INVALID_REQUEST", "Project request is invalid.");
    }
    const { productId, title, clientRequestId } = body as {
      productId?: unknown;
      title?: unknown;
      clientRequestId?: unknown;
    };
    if (typeof productId !== "string") {
      throw new ValidationError("INVALID_PRODUCT", "productId is required.");
    }
    return json(
      { project: await getProjectService().create(owner, productId, title, clientRequestId) },
      201,
    );
  });
}
