import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { assertSameOriginMutation, json, withAdminApi } from "@/server/http/api";
import { getOnboardingService } from "@/server/onboarding/container";
import { onboardingJobAdminDto } from "@/server/onboarding/admin-dto";
import { MAX_GLB_BYTES, MAX_MANIFEST_BYTES } from "@/server/onboarding/onboarding-service";
import { getOperatorAuthorizationService } from "@/server/operators/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return withAdminApi(async () => {
    assertSameOriginMutation(request);
    const operator = await getOperatorAuthorizationService().require(
      request.headers,
      "onboarding:run",
    );
    const declaredBytes = Number(request.headers.get("content-length") ?? 0);
    if (declaredBytes > MAX_GLB_BYTES + MAX_MANIFEST_BYTES + 2_000_000) {
      throw new ValidationError("REQUEST_TOO_LARGE", "Onboarding upload is too large.");
    }
    const form = await request.formData();
    const allowed = new Set(["productId", "draftId", "glb", "manifest"]);
    if ([...form.keys()].some((key) => !allowed.has(key))) {
      throw new ValidationError("INVALID_REQUEST", "Onboarding request has unknown fields.");
    }
    const productId = form.get("productId");
    const draftId = form.get("draftId");
    const glb = form.get("glb");
    const manifest = form.get("manifest");
    if (typeof productId !== "string" || !(glb instanceof File)) {
      throw new ValidationError("INVALID_REQUEST", "productId and GLB are required.");
    }
    if (draftId !== null && typeof draftId !== "string") {
      throw new ValidationError("INVALID_REQUEST", "draftId must be text.");
    }
    if (manifest !== null && !(manifest instanceof File)) {
      throw new ValidationError("INVALID_REQUEST", "manifest must be a JSON file.");
    }
    if (glb.size > MAX_GLB_BYTES || (manifest?.size ?? 0) > MAX_MANIFEST_BYTES) {
      throw new ValidationError("REQUEST_TOO_LARGE", "Onboarding input exceeds its limit.");
    }
    const job = await getOnboardingService().create(operator, {
      productId,
      draftId: draftId || null,
      glb: new Uint8Array(await glb.arrayBuffer()),
      manifest: manifest ? new Uint8Array(await manifest.arrayBuffer()) : null,
    });
    return json({ job: onboardingJobAdminDto(job, []) }, 202);
  });
}
