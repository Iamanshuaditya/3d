import type { DesignDocument } from "@/types/configurator";

export type ProjectOwner =
  | { type: "guest"; id: string }
  | { type: "user"; id: string };

export type ProjectStatus =
  | "draft"
  | "ready_for_preflight"
  | "production_ready"
  | "archived";

export type ProjectSaveState =
  | "loading"
  | "saved"
  | "saving"
  | "unsaved"
  | "failed"
  | "offline";

export type DesignProject = {
  id: string;
  title: string;
  productId: string;
  productVersionId: string;
  owner: ProjectOwner;
  status: ProjectStatus;
  design: DesignDocument;
  revision: number;
  previewAssetId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAsset = {
  id: string;
  projectId: string;
  kind: "artwork" | "preview";
  filename: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  /** Server-only object-store key. Never serialize this in a public DTO. */
  storageKey: string;
  createdAt: string;
};

export type ProjectRevision = {
  projectId: string;
  revision: number;
  design: DesignDocument;
  createdAt: string;
};

export type ProjectSummaryDto = {
  id: string;
  title: string;
  productId: string;
  productVersionId: string;
  status: ProjectStatus;
  revision: number;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAssetDto = Omit<ProjectAsset, "storageKey"> & {
  readUrl: string;
};

export type DesignProjectDto = Omit<DesignProject, "owner" | "previewAssetId"> & {
  ownerType: ProjectOwner["type"];
  previewUrl: string | null;
  assets: ProjectAssetDto[];
};

export type CreateProjectInput = {
  id: string;
  title: string;
  productId: string;
  productVersionId: string;
  owner: ProjectOwner;
  design: DesignDocument;
  /** Owner-scoped key that makes create retries safe. */
  creationKey?: string;
  now: string;
};

export type UpdateProjectInput = {
  id: string;
  owner: ProjectOwner;
  expectedRevision: number;
  design: DesignDocument;
  title?: string;
  status?: Exclude<ProjectStatus, "archived">;
  now: string;
};

export type UpdateProjectResult =
  | { kind: "updated"; project: DesignProject }
  | { kind: "conflict"; currentRevision: number }
  | { kind: "not-found" };

export type CreateProjectAssetInput = ProjectAsset;

export const PROJECT_TITLE_MAX_LENGTH = 120;
export const PROJECT_MAX_SURFACES = 64;
export const PROJECT_MAX_ELEMENTS = 2_000;
