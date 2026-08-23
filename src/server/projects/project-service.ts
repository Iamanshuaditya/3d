import { createHash } from "node:crypto";
import { createEmptyDocument } from "@/lib/configurator/design-state";
import { getProduct } from "@/lib/configurator/product-config";
import { legacyProductVersion } from "@/lib/configurator/product-definitions";
import type { DesignDocument, ProductConfig } from "@/types/configurator";
import {
  parseOptionSelection,
  resolveProductConfiguration,
} from "@/platform/products/configuration-resolver";
import { ProductDomainError } from "@/platform/products/errors";
import type {
  OptionSelection,
  ProductCatalogReader,
  ResolvedProductConfiguration,
} from "@/platform/products/types";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/projects/errors";
import {
  collectAssetIds,
  hydrateImageSources,
  normalizeProjectTitle,
  parseDesignDocument,
  replaceAssetIds,
  stripRuntimeImageSources,
} from "@/platform/projects/design-document";
import type { ProjectRepository } from "@/platform/projects/repository";
import type {
  DesignProject,
  DesignProjectDto,
  ProjectAsset,
  ProjectAssetDto,
  ProjectOwner,
  ProjectSummaryDto,
} from "@/platform/projects/types";
import type { ObjectStore, StoredObject } from "@/platform/storage/object-store";
import { projectAssetStorageKey } from "@/server/storage/filesystem-object-store";
import { validateImageUpload } from "./image-upload";
import { renderProjectPreview } from "./project-preview";

type Clock = () => string;
type IdGenerator = () => string;

export type UpdateProjectRequest = {
  expectedRevision: number;
  design: unknown;
  title?: unknown;
  status?: "draft" | "ready_for_preflight";
};

function assetReadUrl(projectId: string, assetId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/content`;
}

function previewReadUrl(projectId: string, previewAssetId: string | null) {
  return previewAssetId ? assetReadUrl(projectId, previewAssetId) : null;
}

function logEvent(event: string, values: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "vortex-platform", event, ...values }));
}

function validateSurfaceContract(design: DesignDocument, product: ProductConfig) {
  const expected = new Set(product.editableSurfaces.map((surface) => surface.id));
  const actual = Object.keys(design.surfaces);
  if (
    actual.length !== expected.size ||
    actual.some((surfaceId) => !expected.has(surfaceId))
  ) {
    throw new ValidationError(
      "SURFACE_CONTRACT_MISMATCH",
      "The design surfaces do not match this product version.",
    );
  }
}

function canonicalizeArtworkMetadata(
  design: DesignDocument,
  assetsById: ReadonlyMap<string, ProjectAsset>,
): DesignDocument {
  return {
    ...design,
    surfaces: Object.fromEntries(
      Object.entries(design.surfaces).map(([surfaceId, surface]) => [
        surfaceId,
        {
          ...surface,
          elements: surface.elements.map((element) => {
            if (element.type !== "image") return element;
            if (!element.assetId) {
              throw new ValidationError(
                "ASSET_NOT_PERSISTED",
                `Image element ${element.id} has not been uploaded to this project.`,
              );
            }
            const asset = assetsById.get(element.assetId);
            if (!asset || asset.kind !== "artwork") {
              throw new ValidationError(
                "ASSET_NOT_OWNED",
                `Image element ${element.id} references unavailable artwork.`,
              );
            }
            return {
              ...element,
              sourcePixelWidth: asset.width,
              sourcePixelHeight: asset.height,
              sourceName: asset.filename,
              sourceMimeType: asset.mimeType,
            };
          }),
        },
      ]),
    ),
  };
}

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly objectStore: ObjectStore,
    private readonly clock: Clock = () => new Date().toISOString(),
    private readonly generateId: IdGenerator = () => crypto.randomUUID(),
    private readonly productCatalog?: ProductCatalogReader,
  ) {}

  private productError(error: unknown): never {
    if (error instanceof ProductDomainError) {
      throw new ValidationError(error.code, error.message, error.details);
    }
    throw error;
  }

  private async resolveConfiguration(
    productId: string,
    versionId: string | null,
    input: unknown,
  ): Promise<ResolvedProductConfiguration> {
    let selection: OptionSelection;
    try {
      selection = parseOptionSelection(input);
      if (this.productCatalog) return await this.productCatalog.resolve(productId, versionId, selection);
      const product = getProduct(productId);
      if (!product) {
        throw new ProductDomainError("UNKNOWN_PRODUCT", "That product is not registered.");
      }
      if (Object.keys(selection).length) {
        throw new ProductDomainError(
          "UNKNOWN_OPTION",
          "The compatibility product does not define configurable options.",
        );
      }
      const legacyId = versionId ?? `${product.id}@legacy-v1`;
      const version = {
        ...legacyProductVersion(product, 1),
        id: legacyId,
        resolution: {
          kind: "static" as const,
          productConfig: { ...structuredClone(product), productVersionId: legacyId },
        },
      };
      return resolveProductConfiguration(version);
    } catch (error) {
      return this.productError(error);
    }
  }

  private async configurationForProject(project: DesignProject) {
    const resolved = await this.resolveConfiguration(
      project.productId,
      project.productVersionId,
      project.optionSelection,
    );
    if (resolved.configurationId !== project.configurationId) {
      throw new ValidationError(
        "PROJECT_CONFIGURATION_MISMATCH",
        "The project configuration does not match its immutable product version.",
      );
    }
    return resolved;
  }

  private summaryDto(project: DesignProject): ProjectSummaryDto {
    return {
      id: project.id,
      title: project.title,
      productId: project.productId,
      productVersionId: project.productVersionId,
      configurationId: project.configurationId,
      optionSelection: { ...project.optionSelection },
      status: project.status,
      revision: project.revision,
      previewUrl: previewReadUrl(project.id, project.previewAssetId),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private assetDto(asset: ProjectAsset): ProjectAssetDto {
    const publicAsset: Omit<ProjectAsset, "storageKey"> = {
      id: asset.id,
      projectId: asset.projectId,
      kind: asset.kind,
      filename: asset.filename,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      createdAt: asset.createdAt,
    };
    return { ...publicAsset, readUrl: assetReadUrl(asset.projectId, asset.id) };
  }

  private async projectDto(project: DesignProject): Promise<DesignProjectDto> {
    const assets = await this.repository.listAssets(project.id, project.owner);
    const hydrated = hydrateImageSources(project.design, (assetId) =>
      assetReadUrl(project.id, assetId),
    );
    const { owner, previewAssetId, ...publicProject } = project;
    return {
      ...publicProject,
      design: hydrated,
      ownerType: owner.type,
      previewUrl: previewReadUrl(project.id, previewAssetId),
      assets: assets.filter((asset) => asset.kind === "artwork").map((asset) => this.assetDto(asset)),
    };
  }

  async create(
    owner: ProjectOwner,
    productId: string,
    title?: unknown,
    creationKey?: unknown,
    optionSelection?: unknown,
  ): Promise<DesignProjectDto> {
    const resolved = await this.resolveConfiguration(productId, null, optionSelection);
    const product = resolved.productConfig;
    if (
      creationKey !== undefined &&
      (typeof creationKey !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          creationKey,
        ))
    ) {
      throw new ValidationError(
        "INVALID_CREATION_KEY",
        "clientRequestId must be a UUID when supplied.",
      );
    }
    const now = this.clock();
    const project = await this.repository.create({
      id: this.generateId(),
      title: normalizeProjectTitle(title, product.name),
      productId: product.id,
      productVersionId: resolved.productVersionId,
      configurationId: resolved.configurationId,
      optionSelection: resolved.selection,
      owner,
      design: createEmptyDocument(product),
      creationKey: creationKey as string | undefined,
      now,
    });
    if (
      project.productId !== product.id ||
      project.configurationId !== resolved.configurationId
    ) {
      throw new ValidationError(
        "CREATION_KEY_REUSED",
        "That clientRequestId was already used for another product.",
      );
    }
    logEvent("project.create-resolved", { projectId: project.id, productId: product.id });
    return this.projectDto(project);
  }

  async open(owner: ProjectOwner, id: string): Promise<DesignProjectDto> {
    const project = await this.repository.findById(id, owner);
    if (!project) throw new NotFoundError("Project not found.");
    return this.projectDto(project);
  }

  async list(owner: ProjectOwner): Promise<ProjectSummaryDto[]> {
    const projects = await this.repository.list(owner);
    return projects.map((project) => this.summaryDto(project));
  }

  async update(
    owner: ProjectOwner,
    id: string,
    request: UpdateProjectRequest,
  ): Promise<DesignProjectDto> {
    if (!Number.isInteger(request.expectedRevision) || request.expectedRevision < 1) {
      throw new ValidationError("INVALID_REVISION", "expectedRevision must be a positive integer.");
    }
    const existing = await this.repository.findById(id, owner);
    if (!existing) throw new NotFoundError("Project not found.");
    if (existing.status === "archived") {
      throw new ValidationError("PROJECT_ARCHIVED", "An archived project cannot be edited.");
    }
    const product = (await this.configurationForProject(existing)).productConfig;
    const parsed = parseDesignDocument(request.design);
    if (parsed.productId !== existing.productId) {
      throw new ValidationError("PRODUCT_MISMATCH", "The design belongs to a different product.");
    }
    validateSurfaceContract(parsed, product);

    const assets = await this.repository.listAssets(id, owner);
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const canonical = canonicalizeArtworkMetadata(parsed, assetsById);
    const persistent = stripRuntimeImageSources(canonical);
    const referencedIds = collectAssetIds(persistent);
    if (referencedIds.some((assetId) => !assetsById.has(assetId))) {
      throw new ValidationError("ASSET_NOT_OWNED", "The design references unavailable artwork.");
    }

    const result = await this.repository.update({
      id,
      owner,
      expectedRevision: request.expectedRevision,
      design: persistent,
      title: request.title === undefined
        ? undefined
        : normalizeProjectTitle(request.title, existing.title),
      status: request.status,
      now: this.clock(),
    });
    if (result.kind === "not-found") throw new NotFoundError("Project not found.");
    if (result.kind === "conflict") throw new ConflictError(result.currentRevision);
    logEvent("project.saved", { projectId: id, revision: result.project.revision });
    return this.projectDto(result.project);
  }

  async archive(owner: ProjectOwner, id: string): Promise<void> {
    if (!(await this.repository.archive(id, owner, this.clock()))) {
      throw new NotFoundError("Project not found.");
    }
    logEvent("project.archived", { projectId: id });
  }

  async uploadArtwork(
    owner: ProjectOwner,
    projectId: string,
    filename: string,
    bytes: Uint8Array,
  ): Promise<ProjectAssetDto> {
    const project = await this.repository.findById(projectId, owner);
    if (!project) throw new NotFoundError("Project not found.");
    if (project.status === "archived") {
      throw new ValidationError("PROJECT_ARCHIVED", "Artwork cannot be added to an archived project.");
    }
    const upload = await validateImageUpload(bytes, filename);
    const id = this.generateId();
    const storageKey = projectAssetStorageKey(projectId, id, upload.extension);
    await this.objectStore.put(storageKey, upload.bytes, upload.mimeType);
    try {
      const asset = await this.repository.createAsset({
        id,
        projectId,
        kind: "artwork",
        filename: upload.filename,
        mimeType: upload.mimeType,
        byteSize: upload.byteSize,
        width: upload.width,
        height: upload.height,
        sha256: upload.sha256,
        storageKey,
        createdAt: this.clock(),
      });
      logEvent("asset.uploaded", {
        projectId,
        assetId: id,
        byteSize: asset.byteSize,
        mimeType: asset.mimeType,
      });
      return this.assetDto(asset);
    } catch (error) {
      await this.objectStore.delete(storageKey);
      throw error;
    }
  }

  async readAsset(
    owner: ProjectOwner,
    projectId: string,
    assetId: string,
  ): Promise<{ asset: ProjectAsset; object: StoredObject }> {
    const asset = await this.repository.findAsset(assetId, projectId, owner);
    if (!asset) throw new NotFoundError("Artwork not found.");
    const object = await this.objectStore.get(asset.storageKey);
    if (!object) throw new NotFoundError("Artwork bytes are unavailable.");
    return { asset, object };
  }

  async duplicate(owner: ProjectOwner, sourceId: string): Promise<DesignProjectDto> {
    const source = await this.repository.findById(sourceId, owner);
    if (!source) throw new NotFoundError("Project not found.");
    const product = (await this.configurationForProject(source)).productConfig;

    const destinationId = this.generateId();
    const sourceAssets = (await this.repository.listAssets(sourceId, owner)).filter(
      (asset) => asset.kind === "artwork",
    );
    const replacements = new Map<string, string>();
    const copied: { source: ProjectAsset; id: string; storageKey: string }[] = [];
    for (const asset of sourceAssets) {
      const id = this.generateId();
      const extension = asset.mimeType === "image/jpeg"
        ? "jpg"
        : asset.mimeType === "image/webp"
          ? "webp"
          : "png";
      const storageKey = projectAssetStorageKey(destinationId, id, extension);
      await this.objectStore.copy(asset.storageKey, storageKey);
      replacements.set(asset.id, id);
      copied.push({ source: asset, id, storageKey });
    }

    const design = stripRuntimeImageSources(replaceAssetIds(source.design, replacements));
    let destination: DesignProject | null = null;
    try {
      destination = await this.repository.create({
        id: destinationId,
        title: normalizeProjectTitle(`${source.title.slice(0, 115)} copy`, product.name),
        productId: source.productId,
        productVersionId: source.productVersionId,
        configurationId: source.configurationId,
        optionSelection: source.optionSelection,
        owner,
        design,
        now: this.clock(),
      });
      for (const entry of copied) {
        await this.repository.createAsset({
          ...entry.source,
          id: entry.id,
          projectId: destinationId,
          storageKey: entry.storageKey,
          createdAt: this.clock(),
        });
      }
    } catch (error) {
      if (destination) await this.repository.archive(destination.id, owner, this.clock());
      await Promise.all(copied.map((entry) => this.objectStore.delete(entry.storageKey)));
      throw error;
    }
    logEvent("project.duplicated", { projectId: destinationId, sourceProjectId: sourceId });
    return this.projectDto(destination);
  }

  async generatePreview(owner: ProjectOwner, id: string): Promise<ProjectSummaryDto> {
    const project = await this.repository.findById(id, owner);
    if (!project) throw new NotFoundError("Project not found.");
    const product = (await this.configurationForProject(project)).productConfig;
    const assets = await this.repository.listAssets(id, owner);
    const rendered = await renderProjectPreview(project, product, assets, this.objectStore);
    const assetId = this.generateId();
    const storageKey = projectAssetStorageKey(id, assetId, "png");
    const now = this.clock();
    const sha256 = createHash("sha256").update(rendered.bytes).digest("hex");
    await this.objectStore.put(storageKey, rendered.bytes, "image/png");
    try {
      await this.repository.createAsset({
        id: assetId,
        projectId: id,
        kind: "preview",
        filename: `preview-r${project.revision}.png`,
        mimeType: "image/png",
        byteSize: rendered.bytes.byteLength,
        width: rendered.width,
        height: rendered.height,
        sha256,
        storageKey,
        createdAt: now,
      });
      if (!(await this.repository.setPreviewAsset(id, owner, assetId))) {
        throw new NotFoundError("Project not found.");
      }
    } catch (error) {
      await this.objectStore.delete(storageKey);
      throw error;
    }

    if (project.previewAssetId && project.previewAssetId !== assetId) {
      const old = await this.repository.deleteAsset(project.previewAssetId, id, owner);
      if (old) await this.objectStore.delete(old.storageKey);
    }
    const updated = await this.repository.findById(id, owner);
    if (!updated) throw new NotFoundError("Project not found.");
    logEvent("project.preview-generated", { projectId: id, revision: project.revision });
    return this.summaryDto(updated);
  }

  /** Called by a future authenticated session adapter after successful login. */
  async claimGuestProjects(
    guestOwner: Extract<ProjectOwner, { type: "guest" }>,
    userOwner: Extract<ProjectOwner, { type: "user" }>,
  ) {
    const count = await this.repository.claimAll(guestOwner, userOwner, this.clock());
    logEvent("projects.claimed", { count });
    return count;
  }
}
