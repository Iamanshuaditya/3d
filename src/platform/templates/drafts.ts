import type {
  DesignTemplateVersion,
  PlaceholderDefinition,
  TemplateCompatibility,
  TemplateTaxonomy,
} from "./types";
import type { DesignDocument, PersonalizationData } from "@/types/configurator";

export type TemplateDraftDocument = {
  name: string;
  description?: string;
  taxonomy: TemplateTaxonomy;
  compatibility: TemplateCompatibility[];
  designDocumentTemplate: DesignDocument;
  placeholderDefinitions: PlaceholderDefinition[];
  defaultPersonalization: PersonalizationData;
  assetIds: string[];
};

export type TemplateDraftValidation = {
  passed: boolean;
  issues: Array<{ code: string; message: string }>;
  validatedRevision: number;
  validatedAt: string;
};

export type TemplateDraft = {
  id: string;
  templateId: string;
  baseVersionId: string | null;
  status: "draft" | "validated" | "published";
  revision: number;
  document: TemplateDraftDocument;
  validation: TemplateDraftValidation | null;
  publishedVersionId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TemplateDraftEvent = {
  id: string;
  templateId: string;
  draftId: string;
  action: "draft_created" | "draft_updated" | "draft_validated" | "draft_validation_failed" | "version_published";
  actorId: string;
  draftRevision: number;
  templateVersionId: string | null;
  createdAt: string;
};

export interface TemplateDraftRepository {
  create(draft: TemplateDraft, event: TemplateDraftEvent): Promise<TemplateDraft>;
  find(id: string): Promise<TemplateDraft | null>;
  list(): Promise<TemplateDraft[]>;
  update(input: {
    id: string;
    expectedRevision: number;
    document: TemplateDraftDocument;
    actorId: string;
    now: string;
    eventId: string;
  }): Promise<TemplateDraft | null>;
  setValidation(input: {
    id: string;
    expectedRevision: number;
    validation: TemplateDraftValidation;
    actorId: string;
    eventId: string;
  }): Promise<TemplateDraft | null>;
  markPublished(input: {
    id: string;
    expectedRevision: number;
    version: DesignTemplateVersion;
    actorId: string;
    now: string;
    eventId: string;
  }): Promise<TemplateDraft | null>;
  audit(id: string): Promise<TemplateDraftEvent[]>;
}
