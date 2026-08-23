import type {
  DesignTemplateDefinition,
  DesignTemplateVersion,
} from "./types";

export interface TemplateCatalogRepository {
  publish(
    definition: DesignTemplateDefinition,
    version: DesignTemplateVersion,
    sha256: string,
    now: string,
  ): Promise<DesignTemplateVersion>;
  findDefinition(templateId: string): Promise<DesignTemplateDefinition | null>;
  findVersion(templateId: string, versionId: string): Promise<DesignTemplateVersion | null>;
  findCurrentVersion(templateId: string): Promise<DesignTemplateVersion | null>;
  listCurrentVersions(): Promise<DesignTemplateVersion[]>;
}
