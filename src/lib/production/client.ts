import { ProjectApiError } from "@/lib/projects/client";
import type {
  ProductionArtifactDto,
  ProductionPreflightDto,
} from "@/platform/production/types";

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
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
      body.error?.message || `Production request failed (${response.status}).`,
      response.status,
      body.error?.code || "REQUEST_FAILED",
      body.error?.details,
    );
  }
  return body;
}

export async function preflightProject(projectId: string, revision?: number) {
  const result = await requestJson<{ preflight: ProductionPreflightDto }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/production/preflight`,
    { method: "POST", body: JSON.stringify({ ...(revision ? { revision } : {}) }) },
  );
  return result.preflight;
}

export async function generateProductionArtifact(projectId: string, revision?: number) {
  const result = await requestJson<{ artifact: ProductionArtifactDto }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/production/artifacts`,
    {
      method: "POST",
      body: JSON.stringify({ kind: "pdf", ...(revision ? { revision } : {}) }),
    },
  );
  return result.artifact;
}

export async function listProductionArtifacts(projectId: string) {
  const result = await requestJson<{ artifacts: ProductionArtifactDto[] }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/production/artifacts`,
  );
  return result.artifacts;
}

