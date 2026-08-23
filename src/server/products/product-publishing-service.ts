import type {
  ProductAuditEvent,
  ProductDraft,
  ProductDraftDocument,
  ProductDraftValidationReport,
  ProductOperator,
  ProductOperatorPermission,
} from "@/platform/products/drafts";
import type { ProductDraftRepository } from "@/platform/products/draft-repository";
import { ProductDomainError } from "@/platform/products/errors";
import type {
  ProductDefinition,
  ProductVersion,
  ResolvedProductConfiguration,
} from "@/platform/products/types";
import { canonicalJson } from "@/server/persistence/canonical-json";
import {
  productVersionChecksum,
  ProductCatalogService,
} from "./product-catalog-service";
import { validateResolvedProductContract } from "./product-contract-validator";
import { operatorHasPermission } from "@/server/operators/operator-authorization-service";

const MAX_DRAFT_BYTES = 10 * 1024 * 1024;
const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const OPERATOR_ID_PATTERN = /^[a-z0-9][a-z0-9._:@-]{0,159}$/i;

type Evaluation = {
  report: ProductDraftValidationReport;
  version: ProductVersion;
  resolved: ResolvedProductConfiguration | null;
};

export type ProductPublishResult = {
  draft: ProductDraft;
  version: ProductVersion;
};

function hasPermission(
  operator: ProductOperator,
  permission: ProductOperatorPermission,
) {
  return operatorHasPermission(operator.permissions, permission);
}

function assertExpectedRevision(expectedRevision: number) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new ProductDomainError(
      "PRODUCT_DRAFT_REVISION_INVALID",
      "Expected draft revision must be a positive integer.",
    );
  }
}

function authorize(operator: ProductOperator, permission: ProductOperatorPermission) {
  if (!OPERATOR_ID_PATTERN.test(operator.id) || !hasPermission(operator, permission)) {
    throw new ProductDomainError(
      "OPERATOR_FORBIDDEN",
      "The authenticated operator is not authorized for this product action.",
    );
  }
}

function cloneAndValidateDocument(document: ProductDraftDocument): ProductDraftDocument {
  let clone: ProductDraftDocument;
  let serialized: string;
  try {
    clone = structuredClone(document);
    serialized = JSON.stringify(clone);
  } catch {
    throw new ProductDomainError(
      "PRODUCT_DRAFT_INVALID",
      "Product draft data must be serializable.",
    );
  }
  if (!serialized || Buffer.byteLength(serialized) > MAX_DRAFT_BYTES) {
    throw new ProductDomainError(
      "PRODUCT_DRAFT_INVALID",
      `Product drafts cannot exceed ${MAX_DRAFT_BYTES} bytes.`,
    );
  }
  if (!PRODUCT_ID_PATTERN.test(clone.productId)) {
    throw new ProductDomainError("PRODUCT_DRAFT_INVALID", "Product id is invalid.");
  }
  if (clone.visibility !== "public" && clone.visibility !== "unlisted") {
    throw new ProductDomainError("PRODUCT_DRAFT_INVALID", "Product visibility is invalid.");
  }
  const definition = clone.definition;
  if (
    !definition ||
    typeof definition.name !== "string" ||
    !definition.name.trim() ||
    definition.name.length > 200 ||
    (definition.description !== undefined &&
      (typeof definition.description !== "string" || definition.description.length > 4_000)) ||
    !Array.isArray(definition.options) ||
    definition.options.length > 64 ||
    !Array.isArray(definition.templateCompatibility) ||
    definition.templateCompatibility.length > 64 ||
    definition.templateCompatibility.some(
      (value) => typeof value !== "string" || value.length > 160,
    ) ||
    !definition.presentation ||
    !["2d-first", "2d-3d-split", "packaging", "garment"].includes(
      definition.presentation.mode,
    ) ||
    !definition.capabilities ||
    [
      definition.capabilities.multiSurface,
      definition.capabilities.embroideryPreview,
      definition.capabilities.unfolding,
      definition.capabilities.parameterizedDimensions,
      definition.capabilities.templates,
    ].some((value) => typeof value !== "boolean")
  ) {
    throw new ProductDomainError(
      "PRODUCT_DRAFT_INVALID",
      "Product definition metadata is invalid.",
    );
  }
  if (!clone.resolution || !["static", "provider"].includes(clone.resolution.kind)) {
    throw new ProductDomainError("PRODUCT_DRAFT_INVALID", "Product resolution is invalid.");
  }
  if (
    clone.resolution.kind === "static" &&
    (!clone.resolution.productConfig || clone.resolution.productConfig.id !== clone.productId)
  ) {
    throw new ProductDomainError(
      "PRODUCT_DRAFT_INVALID",
      "Static product configuration must belong to the draft product.",
    );
  }
  if (
    clone.resolution.kind === "provider" &&
    !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(clone.resolution.providerId)
  ) {
    throw new ProductDomainError("PRODUCT_DRAFT_INVALID", "Product provider id is invalid.");
  }
  return clone;
}

function auditEvent(
  id: string,
  draft: ProductDraft,
  actorId: string,
  createdAt: string,
): ProductAuditEvent {
  return {
    id,
    productId: draft.productId,
    draftId: draft.id,
    action: "draft_created",
    actorId,
    draftRevision: draft.revision,
    productVersionId: null,
    createdAt,
  };
}

function comparableReport(report: ProductDraftValidationReport) {
  return {
    draftId: report.draftId,
    draftRevision: report.draftRevision,
    scope: report.scope,
    passed: report.passed,
    issues: report.issues,
    configurationId: report.configurationId,
  };
}

export class ProductPublishingService {
  constructor(
    private readonly catalog: ProductCatalogService,
    private readonly drafts: ProductDraftRepository,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID(),
  ) {}

  private async currentVersionOrNull(productId: string) {
    try {
      return await this.catalog.currentVersion(productId);
    } catch (error) {
      if (error instanceof ProductDomainError && error.code === "PRODUCT_NOT_FOUND") {
        return null;
      }
      throw error;
    }
  }

  private async requireDraft(draftId: string) {
    const draft = await this.drafts.find(draftId);
    if (!draft) {
      throw new ProductDomainError("PRODUCT_DRAFT_NOT_FOUND", "Product draft was not found.");
    }
    return draft;
  }

  private async candidateVersion(draft: ProductDraft, publishedAt: string) {
    const versions = await this.catalog.listVersions(draft.productId);
    const versionNumber = versions.reduce(
      (maximum, version) => Math.max(maximum, version.version),
      0,
    ) + 1;
    return {
      id: `${draft.productId}@${versionNumber}`,
      productId: draft.productId,
      version: versionNumber,
      status: "published",
      definition: structuredClone(draft.document.definition),
      resolution: structuredClone(draft.document.resolution),
      publishedAt,
    } satisfies ProductVersion;
  }

  private async evaluate(draft: ProductDraft, validatedAt: string): Promise<Evaluation> {
    const issues: ProductDraftValidationReport["issues"] = [];
    const current = await this.currentVersionOrNull(draft.productId);
    if ((current?.id ?? null) !== draft.baseVersionId) {
      issues.push({
        code: "PRODUCT_DRAFT_BASE_STALE",
        severity: "error",
        message: "The published product changed after this draft was created.",
      });
    }

    const version = await this.candidateVersion(draft, validatedAt);
    let resolved: ResolvedProductConfiguration | null = null;
    if (!issues.length) {
      try {
        resolved = await this.catalog.resolveCandidate(version, {});
        issues.push(...validateResolvedProductContract(
          resolved.productConfig,
          version.definition.presentation.mode,
        ));
      } catch (error) {
        issues.push({
          code: error instanceof ProductDomainError
            ? error.code
            : "PRODUCT_DRAFT_RESOLUTION_FAILED",
          severity: "error",
          message: error instanceof ProductDomainError
            ? error.message
            : "The draft could not be resolved safely.",
        });
      }
    }
    const passed = !issues.some((issue) => issue.severity === "error");
    return {
      version,
      resolved,
      report: {
        draftId: draft.id,
        draftRevision: draft.revision,
        scope: "default_configuration",
        passed,
        issues,
        configurationId: passed && resolved ? resolved.configurationId : null,
        validatedAt,
      },
    };
  }

  private async create(
    operator: ProductOperator,
    document: ProductDraftDocument,
    baseVersionId: string | null,
  ) {
    const now = this.clock();
    const safeDocument = cloneAndValidateDocument(document);
    const draft: ProductDraft = {
      id: this.idFactory(),
      productId: safeDocument.productId,
      baseVersionId,
      status: "draft",
      revision: 1,
      document: safeDocument,
      validation: null,
      publishedVersionId: null,
      onboardingProvenance: null,
      createdBy: operator.id,
      updatedBy: operator.id,
      createdAt: now,
      updatedAt: now,
    };
    const stored = await this.drafts.create(
      draft,
      auditEvent(this.idFactory(), draft, operator.id, now),
    );
    console.info(JSON.stringify({
      scope: "vortex-platform",
      event: "product.draft-created",
      productId: stored.productId,
      draftId: stored.id,
      baseVersionId: stored.baseVersionId,
    }));
    return stored;
  }

  async createFromCurrent(operator: ProductOperator, productId: string) {
    authorize(operator, "products:edit");
    if (!PRODUCT_ID_PATTERN.test(productId)) {
      throw new ProductDomainError("PRODUCT_DRAFT_INVALID", "Product id is invalid.");
    }
    const [definition, version] = await Promise.all([
      this.catalog.definition(productId),
      this.catalog.currentVersion(productId),
    ]);
    return this.create(operator, {
      productId,
      visibility: definition.visibility,
      definition: structuredClone(version.definition),
      resolution: structuredClone(version.resolution),
    }, version.id);
  }

  async createNew(operator: ProductOperator, document: ProductDraftDocument) {
    authorize(operator, "products:edit");
    const safeDocument = cloneAndValidateDocument(document);
    if (await this.currentVersionOrNull(safeDocument.productId)) {
      throw new ProductDomainError(
        "PRODUCT_ALREADY_PUBLISHED",
        "Create a draft from the current product version instead.",
      );
    }
    return this.create(operator, safeDocument, null);
  }

  async get(operator: ProductOperator, draftId: string) {
    authorize(operator, "products:read");
    return this.requireDraft(draftId);
  }

  async list(operator: ProductOperator) {
    authorize(operator, "products:read");
    return this.drafts.list();
  }

  async update(
    operator: ProductOperator,
    draftId: string,
    expectedRevision: number,
    document: ProductDraftDocument,
  ) {
    authorize(operator, "products:edit");
    assertExpectedRevision(expectedRevision);
    const safeDocument = cloneAndValidateDocument(document);
    const updated = await this.drafts.updateDocument(
      draftId,
      expectedRevision,
      safeDocument,
      operator.id,
      this.idFactory(),
      this.clock(),
    );
    console.info(JSON.stringify({
      scope: "vortex-platform",
      event: "product.draft-updated",
      productId: updated.productId,
      draftId: updated.id,
      revision: updated.revision,
    }));
    return updated;
  }

  async validate(
    operator: ProductOperator,
    draftId: string,
    expectedRevision: number,
  ) {
    authorize(operator, "products:validate");
    assertExpectedRevision(expectedRevision);
    const draft = await this.requireDraft(draftId);
    if (draft.revision !== expectedRevision) {
      throw new ProductDomainError(
        "PRODUCT_DRAFT_REVISION_CONFLICT",
        "This product draft changed. Reload it before validation.",
        { currentRevision: draft.revision },
      );
    }
    const now = this.clock();
    const evaluation = await this.evaluate(draft, now);
    const validated = await this.drafts.recordValidation(
      draft.id,
      expectedRevision,
      evaluation.report,
      operator.id,
      this.idFactory(),
      now,
    );
    console.info(JSON.stringify({
      scope: "vortex-platform",
      event: evaluation.report.passed
        ? "product.draft-validated"
        : "product.draft-validation-failed",
      productId: draft.productId,
      draftId: draft.id,
      revision: draft.revision,
      errorCount: evaluation.report.issues.filter((issue) => issue.severity === "error").length,
    }));
    return validated;
  }

  async attachOnboarding(
    operator: ProductOperator,
    draftId: string,
    expectedRevision: number,
    provenance: NonNullable<ProductDraft["onboardingProvenance"]>,
  ) {
    authorize(operator, "products:edit");
    assertExpectedRevision(expectedRevision);
    if (
      !/^[0-9a-f-]{36}$/i.test(provenance.jobId) ||
      !/^[a-f0-9]{64}$/.test(provenance.reportChecksum) ||
      !/^[a-f0-9]{64}$/.test(provenance.toolVersion)
    ) {
      throw new ProductDomainError(
        "ONBOARDING_PROVENANCE_INVALID",
        "Onboarding provenance is invalid.",
      );
    }
    return this.drafts.attachOnboarding(
      draftId,
      expectedRevision,
      structuredClone(provenance),
      operator.id,
      this.idFactory(),
      this.clock(),
    );
  }

  async publish(
    operator: ProductOperator,
    draftId: string,
    expectedRevision: number,
  ): Promise<ProductPublishResult> {
    authorize(operator, "products:publish");
    assertExpectedRevision(expectedRevision);
    const draft = await this.requireDraft(draftId);
    if (draft.revision !== expectedRevision) {
      throw new ProductDomainError(
        "PRODUCT_DRAFT_REVISION_CONFLICT",
        "This product draft changed. Reload it before publishing.",
        { currentRevision: draft.revision },
      );
    }
    if (draft.status === "published" && draft.publishedVersionId) {
      return {
        draft,
        version: await this.catalog.version(draft.productId, draft.publishedVersionId),
      };
    }
    if (
      draft.status !== "validated" ||
      !draft.validation?.passed ||
      draft.validation.draftRevision !== expectedRevision
    ) {
      throw new ProductDomainError(
        "PRODUCT_DRAFT_NOT_VALIDATED",
        "The current product draft revision must pass validation before publishing.",
        { currentRevision: draft.revision },
      );
    }

    const now = this.clock();
    const evaluation = await this.evaluate(draft, now);
    if (!evaluation.report.passed) {
      await this.drafts.recordValidation(
        draft.id,
        expectedRevision,
        evaluation.report,
        operator.id,
        this.idFactory(),
        now,
      );
      throw new ProductDomainError(
        "PRODUCT_DRAFT_VALIDATION_FAILED",
        "The product draft no longer passes validation.",
        { issues: evaluation.report.issues },
      );
    }
    if (
      canonicalJson(comparableReport(evaluation.report)) !==
      canonicalJson(comparableReport(draft.validation))
    ) {
      await this.drafts.recordValidation(
        draft.id,
        expectedRevision,
        evaluation.report,
        operator.id,
        this.idFactory(),
        now,
      );
      throw new ProductDomainError(
        "PRODUCT_DRAFT_REVALIDATION_REQUIRED",
        "Validation output changed. Review the new report before publishing.",
      );
    }

    let existingDefinition: ProductDefinition | null = null;
    try {
      existingDefinition = await this.catalog.definition(draft.productId);
    } catch (error) {
      if (!(error instanceof ProductDomainError) || error.code !== "PRODUCT_NOT_FOUND") throw error;
    }
    const version = evaluation.version;
    const definition: ProductDefinition = {
      id: draft.productId,
      status: "published",
      visibility: draft.document.visibility,
      currentVersionId: version.id,
      createdAt: existingDefinition?.createdAt ?? draft.createdAt,
      updatedAt: now,
      ...structuredClone(draft.document.definition),
    };
    const publishedDraft = await this.drafts.publishDraft({
      draftId: draft.id,
      expectedRevision,
      definition,
      version,
      versionSha256: productVersionChecksum(version),
      actorId: operator.id,
      auditEventId: this.idFactory(),
      now,
    });
    console.info(JSON.stringify({
      scope: "vortex-platform",
      event: "product.version-published",
      productId: version.productId,
      productVersionId: version.id,
      version: version.version,
      draftId: draft.id,
    }));
    return { draft: publishedDraft, version };
  }

  async audit(operator: ProductOperator, draftId: string) {
    authorize(operator, "products:read");
    return this.drafts.listAudit(draftId);
  }
}
