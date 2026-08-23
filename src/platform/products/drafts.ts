import type { ProductValidationIssueDto } from "./operations-types";
import type { ProductDefinitionSnapshot, ProductResolutionSpec } from "./types";

export type ProductOperatorPermission =
  | "products:read"
  | "products:edit"
  | "products:validate"
  | "products:publish"
  | "templates:read"
  | "templates:edit"
  | "templates:publish"
  | "assets:upload"
  | "onboarding:run";

/** Must be created by a trusted authentication adapter, never from request JSON. */
export type ProductOperator = {
  id: string;
  permissions: ProductOperatorPermission[];
};

export type ProductDraftDocument = {
  productId: string;
  visibility: "public" | "unlisted";
  definition: ProductDefinitionSnapshot;
  resolution: ProductResolutionSpec;
};

export type ProductDraftValidationReport = {
  draftId: string;
  draftRevision: number;
  scope: "default_configuration";
  passed: boolean;
  issues: ProductValidationIssueDto[];
  configurationId: string | null;
  validatedAt: string;
};

export type ProductDraft = {
  id: string;
  productId: string;
  baseVersionId: string | null;
  status: "draft" | "validated" | "published";
  revision: number;
  document: ProductDraftDocument;
  validation: ProductDraftValidationReport | null;
  publishedVersionId: string | null;
  onboardingProvenance: {
    jobId: string;
    reportChecksum: string;
    toolVersion: string;
  } | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductAuditAction =
  | "draft_created"
  | "draft_updated"
  | "draft_validated"
  | "draft_validation_failed"
  | "onboarding_attached"
  | "version_published";

export type ProductAuditEvent = {
  id: string;
  productId: string;
  draftId: string;
  action: ProductAuditAction;
  actorId: string;
  draftRevision: number;
  productVersionId: string | null;
  createdAt: string;
};
