import type {
  DesignProjectDto,
  ProjectAssetDto,
  ProjectSummaryDto,
} from "@/platform/projects/types";
import type { DesignDocument } from "@/types/configurator";
import { embedRequestHeaders } from "@/lib/embed/embed-request-context";

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

export class ProjectApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProjectApiError";
  }
}

let ownerBootstrap: Promise<void> | null = null;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...embedRequestHeaders(),
      ...init?.headers,
    },
    credentials: "same-origin",
  });
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ProjectApiError(
      body.error?.message || `Project request failed (${response.status}).`,
      response.status,
      body.error?.code || "REQUEST_FAILED",
      body.error?.details,
    );
  }
  return body;
}

/**
 * A fresh browser has no signed guest cookie. Establish it with one shared
 * read before React Strict Mode can race two project mutations under two
 * independently issued guest identities.
 */
async function ensureOwnerContext() {
  ownerBootstrap ??= requestJson<{ owner: { type: "guest" | "user" } }>(
    "/api/v1/session",
  ).then(() => undefined).catch((error) => {
    ownerBootstrap = null;
    throw error;
  });
  await ownerBootstrap;
}

export async function createProject(
  productId: string,
  clientRequestId: string,
  optionSelection: Record<string, string | number | boolean> = {},
) {
  await ensureOwnerContext();
  const result = await requestJson<{ project: DesignProjectDto }>("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify({ productId, clientRequestId, optionSelection }),
  });
  return result.project;
}

export async function getProject(projectId: string) {
  const result = await requestJson<{ project: DesignProjectDto }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}`,
  );
  return result.project;
}

export async function listProjects() {
  const result = await requestJson<{ projects: ProjectSummaryDto[] }>("/api/v1/projects");
  return result.projects;
}

export async function updateProject(
  projectId: string,
  input: { expectedRevision: number; design: DesignDocument },
) {
  const result = await requestJson<{ project: DesignProjectDto }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return result.project;
}

export async function uploadProjectAsset(projectId: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  const result = await requestJson<{ asset: ProjectAssetDto }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/assets`,
    { method: "POST", body },
  );
  return result.asset;
}

export async function generateProjectPreview(projectId: string) {
  const result = await requestJson<{ project: ProjectSummaryDto }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/preview`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return result.project;
}

export async function duplicateProject(projectId: string) {
  const result = await requestJson<{ project: DesignProjectDto }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/duplicate`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return result.project;
}

export async function archiveProject(projectId: string) {
  await requestJson<{ archived: true }>(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
}
