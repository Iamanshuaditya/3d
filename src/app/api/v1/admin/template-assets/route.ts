import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import type { TemplateAsset } from "@/platform/templates/assets";
import { assertSameOriginMutation, json, withAdminApi } from "@/server/http/api";
import { getOperatorAuthorizationService } from "@/server/operators/container";
import { MAX_UPLOAD_BYTES } from "@/server/projects/image-upload";
import { getTemplateAssetService } from "@/server/templates/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dto(asset: TemplateAsset) {
  return {
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    sha256: asset.sha256,
    createdBy: asset.createdBy,
    createdAt: asset.createdAt,
  };
}

export function GET(request: NextRequest) {
  return withAdminApi(async () => {
    await getOperatorAuthorizationService().require(request.headers, "templates:read");
    return json({ assets: (await getTemplateAssetService().list()).map(dto) });
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
    if (declaredBytes > MAX_UPLOAD_BYTES + 1_000_000) {
      throw new ValidationError("REQUEST_TOO_LARGE", "Template asset upload is too large.");
    }
    const form = await request.formData();
    if ([...form.keys()].some((key) => key !== "file")) {
      throw new ValidationError("INVALID_REQUEST", "Template asset upload has unknown fields.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("INVALID_REQUEST", "A template artwork file is required.");
    }
    if (!file.size || file.size > MAX_UPLOAD_BYTES) {
      throw new ValidationError("UPLOAD_SIZE_INVALID", "Template artwork size is invalid.");
    }
    const asset = await getTemplateAssetService().upload(
      operator.id,
      file.name,
      new Uint8Array(await file.arrayBuffer()),
    );
    return json({ asset: dto(asset) }, 201);
  });
}
