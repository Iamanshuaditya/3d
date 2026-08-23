import type { NextRequest } from "next/server";
import { ValidationError } from "@/platform/projects/errors";
import type { PersonalizationCsvMapping } from "@/server/templates/personalization-dataset";
import { assertSameOriginMutation, json, withOwner } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";
import {
  MAX_PERSONALIZATION_CSV_BYTES,
} from "@/server/personalization/personalization-service";
import { getPersonalizationService } from "@/server/personalization/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMapping(raw: FormDataEntryValue | null): PersonalizationCsvMapping | undefined {
  if (raw === null) return undefined;
  if (typeof raw !== "string" || raw.length > 64 * 1024) {
    throw new ValidationError("PERSONALIZATION_MAPPING_INVALID", "CSV mapping is invalid.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ValidationError("PERSONALIZATION_MAPPING_INVALID", "CSV mapping must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.values(value).some((entry) => entry !== null && typeof entry !== "string")) {
    throw new ValidationError("PERSONALIZATION_MAPPING_INVALID", "CSV mapping is invalid.");
  }
  return value as PersonalizationCsvMapping;
}

export function GET(request: NextRequest) {
  return withOwner(request, async ({ owner }) =>
    json({ datasets: await getPersonalizationService().listDatasets(owner) }));
}

export function POST(request: NextRequest) {
  return withOwner(request, async ({ owner }) => {
    assertSameOriginMutation(request);
    assertRateLimit("personalization-dataset", owner, { limit: 20, windowMs: 60_000 });
    const declaredBytes = Number(request.headers.get("content-length") ?? 0);
    if (declaredBytes > MAX_PERSONALIZATION_CSV_BYTES + 256 * 1024) {
      throw new ValidationError("REQUEST_TOO_LARGE", "CSV upload is too large.");
    }
    const form = await request.formData();
    const allowed = new Set(["templateId", "templateVersionId", "mapping", "file"]);
    if ([...form.keys()].some((key) => !allowed.has(key))) {
      throw new ValidationError("INVALID_REQUEST", "CSV upload has unknown fields.");
    }
    const templateId = form.get("templateId");
    const templateVersionId = form.get("templateVersionId");
    const file = form.get("file");
    if (typeof templateId !== "string" || typeof templateVersionId !== "string" ||
      !(file instanceof File)) {
      throw new ValidationError("INVALID_REQUEST", "Template version and CSV file are required.");
    }
    if (!file.size || file.size > MAX_PERSONALIZATION_CSV_BYTES) {
      throw new ValidationError("PERSONALIZATION_CSV_TOO_LARGE", "CSV upload size is invalid.");
    }
    const result = await getPersonalizationService().createDataset(owner, {
      templateId,
      templateVersionId,
      csv: new Uint8Array(await file.arrayBuffer()),
      mapping: parseMapping(form.get("mapping")),
    });
    return json(result, 201);
  });
}
