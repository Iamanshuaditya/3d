import type {
  ProductAuditEvent,
  ProductDraft,
  ProductDraftDocument,
  ProductDraftValidationReport,
} from "./drafts";
import type { ProductDefinition, ProductVersion } from "./types";

export type PublishProductDraftInput = {
  draftId: string;
  expectedRevision: number;
  definition: ProductDefinition;
  version: ProductVersion;
  versionSha256: string;
  actorId: string;
  auditEventId: string;
  now: string;
};

export interface ProductDraftRepository {
  create(draft: ProductDraft, auditEvent: ProductAuditEvent): Promise<ProductDraft>;
  find(draftId: string): Promise<ProductDraft | null>;
  list(): Promise<ProductDraft[]>;
  updateDocument(
    draftId: string,
    expectedRevision: number,
    document: ProductDraftDocument,
    actorId: string,
    auditEventId: string,
    now: string,
  ): Promise<ProductDraft>;
  recordValidation(
    draftId: string,
    expectedRevision: number,
    report: ProductDraftValidationReport,
    actorId: string,
    auditEventId: string,
    now: string,
  ): Promise<ProductDraft>;
  attachOnboarding(
    draftId: string,
    expectedRevision: number,
    provenance: NonNullable<ProductDraft["onboardingProvenance"]>,
    actorId: string,
    auditEventId: string,
    now: string,
  ): Promise<ProductDraft>;
  publishDraft(input: PublishProductDraftInput): Promise<ProductDraft>;
  listAudit(draftId: string): Promise<ProductAuditEvent[]>;
}
