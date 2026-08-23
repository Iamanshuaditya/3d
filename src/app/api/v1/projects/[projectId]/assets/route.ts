import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { MAX_UPLOAD_BYTES } from "@/server/projects/image-upload";
import { getProjectService } from "@/server/projects/container";
import { assertSameOriginMutation, json, withOwner } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    assertRateLimit("asset-upload", owner, { limit: 20, windowMs: 60_000 });
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isSafeInteger(declared) || declared <= 0) {
      throw new ValidationError(
        "UPLOAD_LENGTH_REQUIRED",
        "Artwork uploads require a valid Content-Length header.",
      );
    }
    if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) {
      throw new ValidationError("UPLOAD_SIZE_INVALID", "Artwork upload is too large.");
    }
    const { projectId } = await context.params;
    const form = await request.formData();
    const value = form.get("file");
    if (!(value instanceof File)) {
      throw new ValidationError("UPLOAD_MISSING", "A file field is required.");
    }
    if (value.size > MAX_UPLOAD_BYTES) {
      throw new ValidationError("UPLOAD_SIZE_INVALID", "Artwork upload is too large.");
    }
    const bytes = new Uint8Array(await value.arrayBuffer());
    const asset = await getProjectService().uploadArtwork(owner, projectId, value.name, bytes);
    return json({ asset }, 201);
  });
}
