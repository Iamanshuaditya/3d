import type { ProjectOwner } from "@/platform/projects/types";
import type {
  CreateProductionArtifactInput,
  CreateProductionArtifactResult,
  ProductionArtifact,
  ProductionArtifactKind,
} from "./types";

export interface ProductionArtifactRepository {
  create(input: CreateProductionArtifactInput): Promise<CreateProductionArtifactResult>;
  findForRevision(
    projectId: string,
    projectRevision: number,
    kind: ProductionArtifactKind,
    owner: ProjectOwner,
  ): Promise<ProductionArtifact | null>;
  findById(id: string, owner: ProjectOwner): Promise<ProductionArtifact | null>;
  list(projectId: string, owner: ProjectOwner): Promise<ProductionArtifact[]>;
}

