import type { ProductAuditEvent, ProductDraft } from "@/platform/products/drafts";

/** Safe operator projection: resolver configs and provider/storage internals stay server-side. */
export function productDraftAdminDto(draft: ProductDraft) {
  return {
    id: draft.id,
    productId: draft.productId,
    baseVersionId: draft.baseVersionId,
    status: draft.status,
    revision: draft.revision,
    visibility: draft.document.visibility,
    metadata: {
      name: draft.document.definition.name,
      description: draft.document.definition.description ?? null,
      presentationMode: draft.document.definition.presentation.mode,
      capabilities: structuredClone(draft.document.definition.capabilities),
      optionCount: draft.document.definition.options.length,
      templateCompatibility: [...draft.document.definition.templateCompatibility],
      resolutionKind: draft.document.resolution.kind,
    },
    validation: draft.validation ? structuredClone(draft.validation) : null,
    publishedVersionId: draft.publishedVersionId,
    onboardingProvenance: draft.onboardingProvenance
      ? structuredClone(draft.onboardingProvenance)
      : null,
    createdBy: draft.createdBy,
    updatedBy: draft.updatedBy,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

export function productAuditAdminDto(event: ProductAuditEvent) {
  return structuredClone(event);
}
