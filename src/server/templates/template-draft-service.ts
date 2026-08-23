import { PlatformError, ValidationError } from "@/platform/projects/errors";
import type { ProductOperator, ProductOperatorPermission } from "@/platform/products/drafts";
import { TemplateDomainError } from "@/platform/templates/errors";
import type {
  TemplateDraft,
  TemplateDraftDocument,
  TemplateDraftRepository,
} from "@/platform/templates/drafts";
import type {
  DesignTemplateDefinition,
  DesignTemplateVersion,
} from "@/platform/templates/types";
import type { TemplateCatalogRepository } from "@/platform/templates/repository";
import type { TemplateCatalogService } from "./template-catalog-service";
import { operatorHasPermission } from "@/server/operators/operator-authorization-service";

const TEMPLATE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
const DOCUMENT_KEYS = new Set([
  "name", "description", "taxonomy", "compatibility", "designDocumentTemplate",
  "placeholderDefinitions", "defaultPersonalization", "assetIds",
]);

function requirePermission(operator: ProductOperator, permission: ProductOperatorPermission) {
  if (!operatorHasPermission(operator.permissions, permission)) {
    throw new PlatformError("OPERATOR_FORBIDDEN", `Missing ${permission} permission.`, 403);
  }
}

export function parseTemplateDraftDocument(value: unknown): TemplateDraftDocument {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some((key) => !DOCUMENT_KEYS.has(key))) {
    throw new ValidationError("TEMPLATE_DRAFT_INVALID", "Template draft document is invalid.");
  }
  const document = value as Partial<TemplateDraftDocument>;
  if (typeof document.name !== "string" || !document.name.trim() ||
    !document.taxonomy || !Array.isArray(document.compatibility) ||
    !document.designDocumentTemplate || !Array.isArray(document.placeholderDefinitions) ||
    !document.defaultPersonalization || !Array.isArray(document.assetIds)) {
    throw new ValidationError("TEMPLATE_DRAFT_INVALID", "Template draft document is incomplete.");
  }
  if (Buffer.byteLength(JSON.stringify(document)) > MAX_DRAFT_BYTES) {
    throw new ValidationError("TEMPLATE_DRAFT_TOO_LARGE", "Template draft exceeds its size limit.");
  }
  return structuredClone(document as TemplateDraftDocument);
}

function documentFromVersion(version: DesignTemplateVersion): TemplateDraftDocument {
  return {
    name: version.name,
    ...(version.description ? { description: version.description } : {}),
    taxonomy: structuredClone(version.taxonomy),
    compatibility: structuredClone(version.compatibility),
    designDocumentTemplate: structuredClone(version.designDocumentTemplate),
    placeholderDefinitions: structuredClone(version.placeholderDefinitions),
    defaultPersonalization: structuredClone(version.defaultPersonalization),
    assetIds: [...version.assetIds],
  };
}

export class TemplateDraftService {
  constructor(
    private readonly drafts: TemplateDraftRepository,
    private readonly catalogueRepository: TemplateCatalogRepository,
    private readonly catalogue: TemplateCatalogService,
    private readonly generateId: () => string = () => crypto.randomUUID(),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async create(
    operator: ProductOperator,
    input: { templateId: string; document?: unknown },
  ) {
    requirePermission(operator, "templates:edit");
    if (!TEMPLATE_ID.test(input.templateId)) {
      throw new ValidationError("TEMPLATE_ID_INVALID", "Template identity is invalid.");
    }
    await this.catalogue.list({});
    const current = await this.catalogueRepository.findCurrentVersion(input.templateId);
    const document = input.document === undefined
      ? current ? documentFromVersion(current) : null
      : parseTemplateDraftDocument(input.document);
    if (!document) {
      throw new ValidationError(
        "TEMPLATE_DRAFT_DOCUMENT_REQUIRED",
        "A new template requires a complete draft document.",
      );
    }
    const now = this.clock();
    const draft: TemplateDraft = {
      id: this.generateId(),
      templateId: input.templateId,
      baseVersionId: current?.id ?? null,
      status: "draft",
      revision: 1,
      document,
      validation: null,
      publishedVersionId: null,
      createdBy: operator.id,
      updatedBy: operator.id,
      createdAt: now,
      updatedAt: now,
    };
    return this.drafts.create(draft, {
      id: this.generateId(),
      templateId: draft.templateId,
      draftId: draft.id,
      action: "draft_created",
      actorId: operator.id,
      draftRevision: 1,
      templateVersionId: null,
      createdAt: now,
    });
  }

  async list(operator: ProductOperator) {
    requirePermission(operator, "templates:read");
    return this.drafts.list();
  }

  async find(operator: ProductOperator, id: string) {
    requirePermission(operator, "templates:read");
    const draft = await this.drafts.find(id);
    if (!draft) throw new PlatformError("TEMPLATE_DRAFT_NOT_FOUND", "Template draft not found.", 404);
    return draft;
  }

  async update(
    operator: ProductOperator,
    id: string,
    expectedRevision: number,
    value: unknown,
  ) {
    requirePermission(operator, "templates:edit");
    const document = parseTemplateDraftDocument(value);
    const updated = await this.drafts.update({
      id,
      expectedRevision,
      document,
      actorId: operator.id,
      now: this.clock(),
      eventId: this.generateId(),
    });
    if (!updated) throw new PlatformError("TEMPLATE_DRAFT_STALE", "Template draft is stale or immutable.", 409);
    return updated;
  }

  private async candidate(draft: TemplateDraft) {
    const current = await this.catalogueRepository.findCurrentVersion(draft.templateId);
    if ((current?.id ?? null) !== draft.baseVersionId) {
      throw new PlatformError(
        "TEMPLATE_DRAFT_STALE",
        "Published template changed after this draft was created.",
        409,
      );
    }
    const now = this.clock();
    const versionNumber = (current?.version ?? 0) + 1;
    const versionId = `${draft.templateId}@${versionNumber}`;
    const version: DesignTemplateVersion = {
      id: versionId,
      templateId: draft.templateId,
      version: versionNumber,
      status: "published",
      ...structuredClone(draft.document),
      publishedAt: now,
    };
    const existingDefinition = await this.catalogueRepository.findDefinition(draft.templateId);
    const definition: DesignTemplateDefinition = {
      id: draft.templateId,
      status: "published",
      currentVersionId: versionId,
      name: version.name,
      ...(version.description ? { description: version.description } : {}),
      taxonomy: structuredClone(version.taxonomy),
      createdAt: existingDefinition?.createdAt ?? now,
      updatedAt: now,
    };
    return { definition, version };
  }

  async validate(operator: ProductOperator, id: string, expectedRevision: number) {
    requirePermission(operator, "templates:edit");
    const draft = await this.drafts.find(id);
    if (!draft) throw new PlatformError("TEMPLATE_DRAFT_NOT_FOUND", "Template draft not found.", 404);
    if (draft.revision !== expectedRevision || draft.status === "published") {
      throw new PlatformError("TEMPLATE_DRAFT_STALE", "Template draft is stale or immutable.", 409);
    }
    const issues: Array<{ code: string; message: string }> = [];
    try {
      const candidate = await this.candidate(draft);
      await this.catalogue.validateCandidate(candidate.definition, candidate.version);
    } catch (error) {
      if (error instanceof TemplateDomainError || error instanceof ValidationError) {
        issues.push({ code: error.code, message: error.message });
      } else {
        throw error;
      }
    }
    const validation = {
      passed: issues.length === 0,
      issues,
      validatedRevision: draft.revision,
      validatedAt: this.clock(),
    };
    const updated = await this.drafts.setValidation({
      id,
      expectedRevision,
      validation,
      actorId: operator.id,
      eventId: this.generateId(),
    });
    if (!updated) throw new PlatformError("TEMPLATE_DRAFT_STALE", "Template draft is stale.", 409);
    return updated;
  }

  async publish(operator: ProductOperator, id: string, expectedRevision: number) {
    requirePermission(operator, "templates:publish");
    const draft = await this.drafts.find(id);
    if (!draft) throw new PlatformError("TEMPLATE_DRAFT_NOT_FOUND", "Template draft not found.", 404);
    if (draft.revision !== expectedRevision || draft.status !== "validated" ||
      !draft.validation?.passed || draft.validation.validatedRevision !== draft.revision) {
      throw new PlatformError("TEMPLATE_DRAFT_NOT_VALIDATED", "Validate the current draft before publishing.", 409);
    }
    const candidate = await this.candidate(draft);
    await this.catalogue.validateCandidate(candidate.definition, candidate.version);
    const version = await this.catalogue.publish(candidate.definition, candidate.version);
    const published = await this.drafts.markPublished({
      id,
      expectedRevision,
      version,
      actorId: operator.id,
      now: this.clock(),
      eventId: this.generateId(),
    });
    if (!published) throw new PlatformError("TEMPLATE_DRAFT_STALE", "Template draft publication did not converge.", 409);
    return { draft: published, version };
  }

  async audit(operator: ProductOperator, id: string) {
    await this.find(operator, id);
    return this.drafts.audit(id);
  }
}
