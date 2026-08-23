import { createHash } from "node:crypto";
import { normalizePrintJob } from "@/lib/print/normalize-job";
import { preflightPrintJob } from "@/lib/print/preflight";
import type { PreflightIssue, PreflightReport } from "@/lib/print/types";
import { collectAssetIds, parseDesignDocument } from "@/platform/projects/design-document";
import {
  NotFoundError,
  PlatformError,
  ValidationError,
} from "@/platform/projects/errors";
import type { ProjectRepository } from "@/platform/projects/repository";
import type {
  DesignProject,
  ProjectAsset,
  ProjectOwner,
} from "@/platform/projects/types";
import { ProductDomainError } from "@/platform/products/errors";
import type { ProductCatalogReader } from "@/platform/products/types";
import { ProductionPreflightError } from "@/platform/production/errors";
import type { ProductionExporter, ProductionAssetBytes } from "@/platform/production/exporter";
import type { ProductionArtifactRepository } from "@/platform/production/repository";
import type {
  ProductionArtifact,
  ProductionArtifactDto,
  ProductionArtifactKind,
  ProductionPreflightDto,
} from "@/platform/production/types";
import type { ObjectStore, StoredObject } from "@/platform/storage/object-store";
import { productionArtifactStorageKey } from "@/server/storage/filesystem-object-store";

type Clock = () => string;
type IdGenerator = () => string;

type VerifiedAsset = {
  asset: ProjectAsset;
  object: StoredObject;
};

type ProductionSnapshot = {
  project: DesignProject;
  projectRevision: number;
  job: ReturnType<typeof normalizePrintJob>;
  report: PreflightReport;
  assets: Map<string, VerifiedAsset>;
};

function logEvent(event: string, values: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "vortex-platform", event, ...values }));
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function downloadUrl(artifactId: string) {
  return `/api/v1/production-artifacts/${encodeURIComponent(artifactId)}/content`;
}

function validateRevision(value: number | undefined, current: number) {
  const revision = value ?? current;
  if (!Number.isInteger(revision) || revision < 1) {
    throw new ValidationError(
      "INVALID_PRODUCTION_REVISION",
      "Production revision must be a positive integer.",
    );
  }
  return revision;
}

function withAssetChecks(
  report: PreflightReport,
  issues: PreflightIssue[],
  referencedCount: number,
): PreflightReport {
  const passed = issues.length === 0;
  return {
    ...report,
    passed: report.passed && passed,
    issues: [...report.issues, ...issues],
    checks: [
      ...report.checks,
      {
        name: "Persistent artwork integrity",
        passed,
        detail: passed
          ? `${referencedCount} referenced artwork asset${referencedCount === 1 ? "" : "s"} verified by ownership, byte length, MIME metadata, and SHA-256.`
          : "One or more referenced artwork assets is missing, unauthorized, or corrupt.",
      },
    ],
  };
}

function withServerFontCheck(report: PreflightReport, families: string[]): PreflightReport {
  if (!families.length) {
    return {
      ...report,
      checks: [
        ...report.checks,
        {
          name: "Server font reproducibility",
          passed: true,
          detail: "This revision has no editable text elements.",
        },
      ],
    };
  }
  return {
    ...report,
    issues: [
      ...report.issues,
      {
        code: "SERVER_FONT_APPROVAL_REQUIRED",
        severity: "warning",
        message: `Server output uses host font resolution for ${families.join(", ")}. Bundle and approve exact font files before unattended production.`,
      },
    ],
    checks: [
      ...report.checks,
      {
        name: "Server font reproducibility",
        passed: false,
        detail: "Text rendered successfully, but exact licensed font files are not yet pinned in a production font registry.",
      },
    ],
  };
}

export class ProductionService {
  private readonly exporters: ReadonlyMap<ProductionArtifactKind, ProductionExporter>;

  constructor(
    private readonly projects: ProjectRepository,
    private readonly artifacts: ProductionArtifactRepository,
    private readonly objectStore: ObjectStore,
    private readonly productCatalog: ProductCatalogReader,
    exporters: ProductionExporter[],
    private readonly clock: Clock = () => new Date().toISOString(),
    private readonly generateId: IdGenerator = () => crypto.randomUUID(),
  ) {
    this.exporters = new Map(exporters.map((exporter) => [exporter.kind, exporter]));
  }

  private dto(artifact: ProductionArtifact): ProductionArtifactDto {
    const { storageKey, ...publicArtifact } = artifact;
    void storageKey;
    return { ...publicArtifact, downloadUrl: downloadUrl(artifact.id) };
  }

  private async resolveConfiguration(project: DesignProject) {
    try {
      const resolved = await this.productCatalog.resolve(
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
    } catch (error) {
      if (error instanceof ProductDomainError) {
        throw new ValidationError(error.code, error.message, error.details);
      }
      throw error;
    }
  }

  private async snapshot(
    owner: ProjectOwner,
    projectId: string,
    requestedRevision?: number,
  ): Promise<ProductionSnapshot> {
    const project = await this.projects.findById(projectId, owner);
    if (!project) throw new NotFoundError("Project not found.");
    const projectRevision = validateRevision(requestedRevision, project.revision);
    const revision = await this.projects.findRevision(projectId, projectRevision, owner);
    if (!revision) throw new NotFoundError("Project revision not found.");
    const resolved = await this.resolveConfiguration(project);
    const product = resolved.productConfig;
    const parsed = parseDesignDocument(revision.design);
    if (parsed.productId !== project.productId) {
      throw new ValidationError(
        "PRODUCT_MISMATCH",
        "The frozen project revision belongs to a different product.",
      );
    }
    const expectedSurfaces = new Set(product.editableSurfaces.map((surface) => surface.id));
    if (
      Object.keys(parsed.surfaces).length !== expectedSurfaces.size ||
      Object.keys(parsed.surfaces).some((surfaceId) => !expectedSurfaces.has(surfaceId))
    ) {
      throw new ValidationError(
        "SURFACE_CONTRACT_MISMATCH",
        "The frozen project revision does not match its product surfaces.",
      );
    }

    const allAssets = await this.projects.listAssets(projectId, owner);
    const artworkById = new Map(
      allAssets.filter((asset) => asset.kind === "artwork").map((asset) => [asset.id, asset]),
    );
    const referencedIds = collectAssetIds(parsed);
    const verified = new Map<string, VerifiedAsset>();
    const issues: PreflightIssue[] = [];

    for (const assetId of referencedIds) {
      const asset = artworkById.get(assetId);
      if (!asset) {
        issues.push({
          code: "PRODUCTION_ASSET_NOT_OWNED",
          severity: "error",
          message: "A referenced artwork asset is unavailable to this project.",
        });
        continue;
      }
      const object = await this.objectStore.get(asset.storageKey);
      if (!object) {
        issues.push({
          code: "PRODUCTION_ASSET_BYTES_MISSING",
          severity: "error",
          message: `${asset.filename} is missing from persistent storage.`,
        });
        continue;
      }
      if (
        object.byteSize !== asset.byteSize ||
        object.contentType !== asset.mimeType ||
        sha256(object.bytes) !== asset.sha256
      ) {
        issues.push({
          code: "PRODUCTION_ASSET_INTEGRITY_FAILED",
          severity: "error",
          message: `${asset.filename} failed persistent-storage integrity verification.`,
        });
        continue;
      }
      verified.set(assetId, { asset, object });
    }

    const canonicalDesign = {
      ...parsed,
      surfaces: Object.fromEntries(
        Object.entries(parsed.surfaces).map(([surfaceId, surface]) => [
          surfaceId,
          {
            ...surface,
            elements: surface.elements.map((element) => {
              if (element.type !== "image") return element;
              if (!element.assetId) {
                issues.push({
                  code: "PRODUCTION_ASSET_ID_REQUIRED",
                  severity: "error",
                  surfaceId,
                  elementId: element.id,
                  message: `${element.sourceName ?? element.id} has no persistent artwork identity.`,
                });
                return element;
              }
              const asset = artworkById.get(element.assetId);
              return asset
                ? {
                    ...element,
                    src: undefined,
                    sourcePixelWidth: asset.width,
                    sourcePixelHeight: asset.height,
                    sourceName: asset.filename,
                    sourceMimeType: asset.mimeType,
                  }
                : element;
            }),
          },
        ]),
      ),
    };
    const job = normalizePrintJob(product, canonicalDesign);
    const fontFamilies = [...new Set(
      Object.values(canonicalDesign.surfaces).flatMap((surface) =>
        surface.elements.flatMap((element) => element.type === "text" ? [element.fontFamily] : []),
      ),
    )].sort();
    const report = withServerFontCheck(
      withAssetChecks(
        preflightPrintJob(job, this.clock()),
        issues,
        referencedIds.length,
      ),
      fontFamilies,
    );
    return { project, projectRevision, job, report, assets: verified };
  }

  async preflight(
    owner: ProjectOwner,
    projectId: string,
    revision?: number,
  ): Promise<ProductionPreflightDto> {
    const snapshot = await this.snapshot(owner, projectId, revision);
    if (snapshot.report.passed) {
      await this.projects.setStatusForRevision(
        projectId,
        owner,
        snapshot.projectRevision,
        "ready_for_preflight",
      );
    } else {
      logEvent("production.preflight-failed", {
        projectId,
        projectRevision: snapshot.projectRevision,
        errorCount: snapshot.report.issues.filter((issue) => issue.severity === "error").length,
      });
    }
    return {
      projectId,
      projectRevision: snapshot.projectRevision,
      productVersionId: snapshot.project.productVersionId,
      configurationId: snapshot.project.configurationId,
      report: snapshot.report,
    };
  }

  private async verifiedArtifactObject(artifact: ProductionArtifact) {
    const object = await this.objectStore.get(artifact.storageKey);
    if (
      !object ||
      object.contentType !== artifact.mimeType ||
      object.byteSize !== artifact.byteSize ||
      sha256(object.bytes) !== artifact.sha256
    ) {
      throw new PlatformError(
        "PRODUCTION_ARTIFACT_INTEGRITY_FAILED",
        "The immutable production artifact is unavailable or corrupt.",
        500,
      );
    }
    return object;
  }

  async generate(
    owner: ProjectOwner,
    projectId: string,
    kind: ProductionArtifactKind = "pdf",
    revision?: number,
  ): Promise<ProductionArtifactDto> {
    const project = await this.projects.findById(projectId, owner);
    if (!project) throw new NotFoundError("Project not found.");
    const projectRevision = validateRevision(revision, project.revision);
    const existing = await this.artifacts.findForRevision(
      projectId,
      projectRevision,
      kind,
      owner,
    );
    if (existing) {
      await this.verifiedArtifactObject(existing);
      return this.dto(existing);
    }

    const exporter = this.exporters.get(kind);
    if (!exporter) {
      throw new ValidationError(
        "PRODUCTION_FORMAT_UNSUPPORTED",
        `Production format ${kind} is not available.`,
      );
    }
    const snapshot = await this.snapshot(owner, projectId, projectRevision);
    if (!exporter.supports(snapshot.job)) {
      throw new ValidationError(
        "PRODUCTION_FORMAT_UNSUPPORTED",
        `Production format ${kind} is not valid for this resolved product structure.`,
      );
    }
    if (!snapshot.report.passed) {
      logEvent("production.preflight-failed", {
        projectId,
        projectRevision,
        errorCount: snapshot.report.issues.filter((issue) => issue.severity === "error").length,
      });
      throw new ProductionPreflightError(snapshot.report);
    }

    const resolveAsset = async (assetId: string): Promise<ProductionAssetBytes | null> => {
      const verified = snapshot.assets.get(assetId);
      return verified
        ? { bytes: verified.object.bytes, mimeType: verified.asset.mimeType }
        : null;
    };
    let exported;
    try {
      exported = await exporter.export({
        job: snapshot.job,
        report: snapshot.report,
        resolveAsset,
      });
    } catch (error) {
      console.error(JSON.stringify({
        scope: "vortex-platform",
        event: "production.generation-failed",
        projectId,
        projectRevision,
        kind,
        message: error instanceof Error ? error.message : "Unknown export error",
      }));
      throw error;
    }
    if (!exported.bytes.byteLength) {
      throw new Error("Production exporter returned an empty artifact.");
    }

    const artifactId = this.generateId();
    const storageKey = productionArtifactStorageKey(projectId, artifactId, kind);
    const createdAt = snapshot.report.createdAt;
    const artifact: ProductionArtifact = {
      id: artifactId,
      projectId,
      projectRevision,
      productVersionId: snapshot.project.productVersionId,
      configurationId: snapshot.project.configurationId,
      kind,
      mimeType: exporter.mimeType,
      filename: kind === "pdf"
        ? `${snapshot.job.product.id}-r${projectRevision}-${snapshot.job.profile.id}.pdf`
        : `${snapshot.job.product.id}-r${projectRevision}-dieline.svg`,
      byteSize: exported.bytes.byteLength,
      sha256: sha256(exported.bytes),
      storageKey,
      preflightReport: snapshot.report,
      createdAt,
    };
    await this.objectStore.put(storageKey, exported.bytes, artifact.mimeType);
    let created;
    try {
      created = await this.artifacts.create(artifact);
    } catch (error) {
      await this.objectStore.delete(storageKey);
      throw error;
    }
    if (!created.created) {
      await this.objectStore.delete(storageKey);
      await this.verifiedArtifactObject(created.artifact);
      return this.dto(created.artifact);
    }
    await this.projects.setStatusForRevision(
      projectId,
      owner,
      projectRevision,
      "production_ready",
    );
    logEvent("production.artifact-generated", {
      projectId,
      projectRevision,
      artifactId,
      kind,
      byteSize: artifact.byteSize,
      sha256: artifact.sha256,
    });
    return this.dto(artifact);
  }

  async list(owner: ProjectOwner, projectId: string): Promise<ProductionArtifactDto[]> {
    if (!(await this.projects.findById(projectId, owner))) {
      throw new NotFoundError("Project not found.");
    }
    return (await this.artifacts.list(projectId, owner)).map((artifact) => this.dto(artifact));
  }

  async metadata(owner: ProjectOwner, artifactId: string): Promise<ProductionArtifactDto> {
    const artifact = await this.artifacts.findById(artifactId, owner);
    if (!artifact) throw new NotFoundError("Production artifact not found.");
    return this.dto(artifact);
  }

  async read(owner: ProjectOwner, artifactId: string) {
    const artifact = await this.artifacts.findById(artifactId, owner);
    if (!artifact) throw new NotFoundError("Production artifact not found.");
    return { artifact, object: await this.verifiedArtifactObject(artifact) };
  }
}
