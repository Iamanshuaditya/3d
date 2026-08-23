import { ProductDomainError } from "@/platform/products/errors";
import { parseOptionSelection } from "@/platform/products/configuration-resolver";
import type { ProductCatalogReader, ResolvedProductConfiguration } from "@/platform/products/types";
import { NotFoundError, ValidationError } from "@/platform/projects/errors";
import type { DesignProjectDto, ProjectOwner } from "@/platform/projects/types";
import { TemplateDomainError } from "@/platform/templates/errors";
import {
  applyPersonalization,
  mergePersonalizationData,
  parsePersonalizationData,
  validatePlaceholderValues,
} from "@/platform/templates/personalization";
import type {
  DesignTemplateDto,
  DesignTemplateVersion,
  TemplateCompatibility,
  TemplateListQuery,
  TemplateSummaryDto,
} from "@/platform/templates/types";
import type { ProjectService } from "@/server/projects/project-service";
import { renderDesignPreview } from "@/server/projects/project-preview";
import type { TemplateCatalogService } from "./template-catalog-service";

function previewUrl(template: DesignTemplateVersion) {
  return `/api/v1/templates/${encodeURIComponent(template.templateId)}/preview?version=${encodeURIComponent(template.id)}`;
}

function compatibilityMatches(
  compatibility: TemplateCompatibility,
  resolved: ResolvedProductConfiguration,
) {
  return compatibility.productId === resolved.productId &&
    compatibility.productVersionId === resolved.productVersionId &&
    compatibility.configurationId === resolved.configurationId;
}

export class TemplateService {
  constructor(
    private readonly templates: TemplateCatalogService,
    private readonly products: ProductCatalogReader,
    private readonly projects: ProjectService,
  ) {}

  private mapError(error: unknown): never {
    if (error instanceof TemplateDomainError) {
      if (error.code === "TEMPLATE_NOT_FOUND") throw new NotFoundError("Template not found.");
      throw new ValidationError(error.code, error.message, error.details);
    }
    if (error instanceof ProductDomainError) {
      throw new ValidationError(error.code, error.message, error.details);
    }
    throw error;
  }

  private summary(template: DesignTemplateVersion): TemplateSummaryDto {
    return {
      id: template.templateId,
      versionId: template.id,
      version: template.version,
      name: template.name,
      ...(template.description ? { description: template.description } : {}),
      taxonomy: structuredClone(template.taxonomy),
      compatibility: structuredClone(template.compatibility),
      placeholderDefinitions: structuredClone(template.placeholderDefinitions),
      defaultPersonalization: structuredClone(template.defaultPersonalization),
      previewUrl: previewUrl(template),
    };
  }

  async list(query: TemplateListQuery): Promise<TemplateSummaryDto[]> {
    try {
      return (await this.templates.list(query)).map((template) => this.summary(template));
    } catch (error) {
      return this.mapError(error);
    }
  }

  async get(templateId: string, versionId?: string): Promise<DesignTemplateDto> {
    try {
      const template = await this.templates.version(templateId, versionId);
      return {
        ...this.summary(template),
        designDocumentTemplate: structuredClone(template.designDocumentTemplate),
      };
    } catch (error) {
      return this.mapError(error);
    }
  }

  async instantiate(
    owner: ProjectOwner,
    templateId: string,
    request: {
      templateVersionId?: unknown;
      productId?: unknown;
      productVersionId?: unknown;
      optionSelection?: unknown;
      personalization?: unknown;
      title?: unknown;
      clientRequestId?: unknown;
    },
  ): Promise<DesignProjectDto> {
    try {
      if (typeof request.productId !== "string") {
        throw new TemplateDomainError("PRODUCT_REQUIRED", "productId is required.");
      }
      if (
        request.templateVersionId !== undefined &&
        typeof request.templateVersionId !== "string"
      ) {
        throw new TemplateDomainError(
          "TEMPLATE_VERSION_INVALID",
          "templateVersionId must be a string.",
        );
      }
      if (
        request.productVersionId !== undefined &&
        typeof request.productVersionId !== "string"
      ) {
        throw new TemplateDomainError(
          "PRODUCT_VERSION_INVALID",
          "productVersionId must be a string.",
        );
      }
      const template = await this.templates.version(
        templateId,
        request.templateVersionId as string | undefined,
      );
      const selection = parseOptionSelection(request.optionSelection);
      const resolved = await this.products.resolve(
        request.productId,
        (request.productVersionId as string | undefined) ?? null,
        selection,
      );
      if (!template.compatibility.some((candidate) => compatibilityMatches(candidate, resolved))) {
        throw new TemplateDomainError(
          "TEMPLATE_INCOMPATIBLE",
          "This template is not compatible with the selected product configuration.",
        );
      }
      if (template.assetIds.length) {
        throw new TemplateDomainError(
          "TEMPLATE_ASSET_CLONING_REQUIRED",
          "Artwork-backed templates are not enabled until template asset cloning is configured.",
        );
      }
      const personalization = mergePersonalizationData(
        parsePersonalizationData(template.defaultPersonalization),
        parsePersonalizationData(request.personalization),
      );
      validatePlaceholderValues(template.placeholderDefinitions, personalization);
      const design = applyPersonalization(template.designDocumentTemplate, personalization);
      return await this.projects.createFromTemplate({
        owner,
        productId: resolved.productId,
        productVersionId: resolved.productVersionId,
        configurationId: resolved.configurationId,
        optionSelection: resolved.selection,
        templateVersionId: template.id,
        design,
        title: request.title ?? template.name,
        creationKey: request.clientRequestId,
      });
    } catch (error) {
      return this.mapError(error);
    }
  }

  async preview(templateId: string, versionId?: string) {
    try {
      const template = await this.templates.version(templateId, versionId);
      if (template.assetIds.length) {
        throw new TemplateDomainError(
          "TEMPLATE_PREVIEW_ASSETS_UNAVAILABLE",
          "This template preview needs a template asset resolver.",
        );
      }
      const compatibility = template.compatibility[0];
      const resolved = await this.products.resolve(
        compatibility.productId,
        compatibility.productVersionId,
        compatibility.optionSelection,
      );
      if (!compatibilityMatches(compatibility, resolved)) {
        throw new TemplateDomainError(
          "TEMPLATE_CONFIGURATION_MISMATCH",
          "Template preview configuration is unavailable.",
        );
      }
      return await renderDesignPreview(template.designDocumentTemplate, resolved.productConfig);
    } catch (error) {
      return this.mapError(error);
    }
  }
}
