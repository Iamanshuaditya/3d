import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import { assertSameOriginMutation, json, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { getProductionFontService } from "@/server/production/container";
import { MAX_PRODUCTION_FONT_BYTES } from "@/server/production/production-font-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return withAdminApi(async () => {
    await getOperatorAuthorizationService().require(request.headers, "products:read");
    return json({ fonts: await getProductionFontService().list() });
  });
}

export function POST(request: NextRequest) {
  return withAdminApi(async () => {
    assertSameOriginMutation(request);
    const operator = await getOperatorAuthorizationService().require(
      request.headers,
      "assets:upload",
    );
    const declaredBytes = Number(request.headers.get("content-length") ?? 0);
    if (declaredBytes > MAX_PRODUCTION_FONT_BYTES + 256 * 1024) {
      throw new ValidationError("REQUEST_TOO_LARGE", "Font registration is too large.");
    }
    const form = await request.formData();
    const allowed = new Set([
      "file", "family", "weight", "style", "licenseName", "licenseReference",
    ]);
    if ([...form.keys()].some((key) => !allowed.has(key))) {
      throw new ValidationError("INVALID_REQUEST", "Font registration has unknown fields.");
    }
    const file = form.get("file");
    const family = form.get("family");
    const weight = form.get("weight");
    const style = form.get("style");
    const licenseName = form.get("licenseName");
    const licenseReference = form.get("licenseReference");
    if (!(file instanceof File) || typeof family !== "string" ||
      typeof weight !== "string" || (style !== "normal" && style !== "italic") ||
      typeof licenseName !== "string" || typeof licenseReference !== "string") {
      throw new ValidationError("INVALID_REQUEST", "Complete font and licensing metadata is required.");
    }
    if (!file.size || file.size > MAX_PRODUCTION_FONT_BYTES) {
      throw new ValidationError("PRODUCTION_FONT_SIZE_INVALID", "Font file size is invalid.");
    }
    const font = await getProductionFontService().register({
      approvedBy: operator.id,
      family,
      weight: Number(weight),
      style,
      filename: file.name,
      licenseName,
      licenseReference,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return json({ font }, 201);
  });
}
