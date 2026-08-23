import type { DesignProjectDto } from "@/platform/projects/types";
import type {
  DesignTemplateDto,
  TemplateSummaryDto,
} from "@/platform/templates/types";
import type { PersonalizationData } from "@/types/configurator";
import { ProjectApiError } from "@/lib/projects/client";

type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ProjectApiError(
      body.error?.message || `Template request failed (${response.status}).`,
      response.status,
      body.error?.code || "REQUEST_FAILED",
      body.error?.details,
    );
  }
  return body;
}

export async function listTemplates(input: {
  productId: string;
  productVersionId: string;
  configurationId: string;
}) {
  const query = new URLSearchParams(input);
  const result = await requestJson<{ templates: TemplateSummaryDto[] }>(
    `/api/v1/templates?${query}`,
  );
  return result.templates;
}

export async function getTemplate(templateId: string, versionId?: string) {
  const query = versionId ? `?version=${encodeURIComponent(versionId)}` : "";
  const result = await requestJson<{ template: DesignTemplateDto }>(
    `/api/v1/templates/${encodeURIComponent(templateId)}${query}`,
  );
  return result.template;
}

export async function instantiateTemplate(input: {
  templateId: string;
  templateVersionId: string;
  productId: string;
  productVersionId?: string;
  optionSelection?: Record<string, string | number | boolean>;
  personalization: PersonalizationData;
  clientRequestId: string;
}) {
  const result = await requestJson<{ project: DesignProjectDto }>(
    `/api/v1/templates/${encodeURIComponent(input.templateId)}/instantiate`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return result.project;
}
