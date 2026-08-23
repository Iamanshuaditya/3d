import type {
  CreateProjectAssetInput,
  CreateProjectInput,
  DesignProject,
  ProjectAsset,
  ProjectOwner,
  ProjectRevision,
  UpdateProjectInput,
  UpdateProjectResult,
} from "./types";

export class GuestIdentityAlreadyClaimedError extends Error {
  constructor() {
    super("The guest identity has already been claimed.");
    this.name = "GuestIdentityAlreadyClaimedError";
  }
}

export type GuestProjectClaimResult =
  | { kind: "claimed"; count: number }
  | { kind: "claimed-by-another-user" };

export interface ProjectRepository {
  create(input: CreateProjectInput): Promise<DesignProject>;
  findById(id: string, owner: ProjectOwner): Promise<DesignProject | null>;
  list(owner: ProjectOwner): Promise<DesignProject[]>;
  update(input: UpdateProjectInput): Promise<UpdateProjectResult>;
  archive(id: string, owner: ProjectOwner, now: string): Promise<boolean>;
  setPreviewAsset(
    id: string,
    owner: ProjectOwner,
    assetId: string | null,
  ): Promise<boolean>;
  setStatusForRevision(
    id: string,
    owner: ProjectOwner,
    expectedRevision: number,
    status: DesignProject["status"],
  ): Promise<boolean>;
  createAsset(input: CreateProjectAssetInput): Promise<ProjectAsset>;
  findAsset(id: string, projectId: string, owner: ProjectOwner): Promise<ProjectAsset | null>;
  listAssets(projectId: string, owner: ProjectOwner): Promise<ProjectAsset[]>;
  deleteAsset(id: string, projectId: string, owner: ProjectOwner): Promise<ProjectAsset | null>;
  findRevision(
    projectId: string,
    revision: number,
    owner: ProjectOwner,
  ): Promise<ProjectRevision | null>;
  claimAll(
    from: Extract<ProjectOwner, { type: "guest" }>,
    to: Extract<ProjectOwner, { type: "user" }>,
    now: string,
  ): Promise<GuestProjectClaimResult>;
}
