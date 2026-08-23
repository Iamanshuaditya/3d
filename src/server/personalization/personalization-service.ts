import { createHash } from "node:crypto";
import type { PersonalizationRepository } from "@/platform/personalization/repository";
import type {
  PersonalizationDatasetDto,
  PersonalizationDatasetRecord,
  PersonalizationJobDto,
  PersonalizationJobRecord,
} from "@/platform/personalization/types";
import { NotFoundError, PlatformError, ValidationError } from "@/platform/projects/errors";
import { GuestIdentityAlreadyClaimedError } from "@/platform/projects/repository";
import type { ProjectOwner } from "@/platform/projects/types";
import type { ObjectStore, StoredObject } from "@/platform/storage/object-store";
import { parsePersonalizationData } from "@/platform/templates/personalization";
import type {
  DesignTemplateVersion,
  PersonalizationDataset,
} from "@/platform/templates/types";
import type { ProductCatalogReader } from "@/platform/products/types";
import { canonicalJson } from "@/server/persistence/canonical-json";
import { renderDesignPreview } from "@/server/projects/project-preview";
import type { TemplateAssetService } from "@/server/templates/template-asset-service";
import type { TemplateCatalogService } from "@/server/templates/template-catalog-service";
import {
  importPersonalizationCsv,
  personalizedTemplateVariant,
  type PersonalizationCsvMapping,
} from "@/server/templates/personalization-dataset";
import type { PersonalizationRunner } from "./personalization-runner";

export const MAX_PERSONALIZATION_CSV_BYTES = 5 * 1024 * 1024;
const RETENTION_DAYS = 30;
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,127}$/;

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function datasetDto(record: PersonalizationDatasetRecord): PersonalizationDatasetDto {
  return {
    id: record.id,
    templateVersionId: record.templateVersionId,
    sha256: record.sha256,
    rowCount: record.rowCount,
    columns: structuredClone(record.columns),
    report: structuredClone(record.report),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}

function jobDto(record: PersonalizationJobRecord): PersonalizationJobDto {
  return {
    id: record.id,
    datasetId: record.datasetId,
    templateVersionId: record.templateVersionId,
    status: record.status,
    processed: record.processed,
    total: record.total,
    failed: record.failed,
    attempt: record.attempt,
    maxAttempts: record.maxAttempts,
    outputSha256: record.outputSha256,
    outputByteSize: record.outputByteSize,
    errorCode: record.errorCode,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    updatedAt: record.updatedAt,
    downloadUrl: record.status === "completed"
      ? `/api/v1/personalization-jobs/${encodeURIComponent(record.id)}/output`
      : null,
  };
}

function expiresAt(now: string) {
  const expiry = new Date(now);
  expiry.setUTCDate(expiry.getUTCDate() + RETENTION_DAYS);
  return expiry.toISOString();
}

function validateMapping(value: PersonalizationCsvMapping | undefined) {
  if (!value) return;
  const entries = Object.entries(value);
  if (
    entries.length > 256 ||
    entries.some(([source, target]) =>
      !source || source.length > 128 ||
      (target !== null && (typeof target !== "string" || target.length > 256)))
  ) {
    throw new ValidationError("PERSONALIZATION_MAPPING_INVALID", "CSV mapping is invalid.");
  }
}

export class PersonalizationService {
  private runner: PersonalizationRunner | null = null;

  constructor(
    private readonly repository: PersonalizationRepository,
    private readonly objectStore: ObjectStore,
    private readonly templates: TemplateCatalogService,
    private readonly products: ProductCatalogReader,
    private readonly templateAssets: TemplateAssetService,
    private readonly generateId: () => string = () => crypto.randomUUID(),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  attachRunner(runner: PersonalizationRunner) {
    if (this.runner) throw new Error("Personalization runner is already attached.");
    this.runner = runner;
  }

  async recover() {
    await this.purgeExpired();
    const jobs = await this.repository.recoverInterruptedJobs(this.clock());
    jobs.forEach((job) => this.runner?.schedule(job.id));
  }

  async createDataset(
    owner: ProjectOwner,
    input: {
      templateId: string;
      templateVersionId: string;
      csv: Uint8Array;
      mapping?: PersonalizationCsvMapping;
    },
  ): Promise<{ dataset: PersonalizationDatasetDto; previewRows: number[] }> {
    await this.purgeExpired();
    if (input.csv.byteLength === 0 || input.csv.byteLength > MAX_PERSONALIZATION_CSV_BYTES) {
      throw new ValidationError("PERSONALIZATION_CSV_TOO_LARGE", "CSV upload size is invalid.");
    }
    validateMapping(input.mapping);
    let template: DesignTemplateVersion;
    try {
      template = await this.templates.version(input.templateId, input.templateVersionId);
    } catch {
      throw new NotFoundError("Template version not found.");
    }
    const imported = importPersonalizationCsv({
      template,
      source: input.csv,
      ...(input.mapping ? { mapping: input.mapping } : {}),
    });
    if (!imported.dataset) {
      throw new ValidationError(
        "PERSONALIZATION_DATASET_INVALID",
        "CSV validation failed.",
        { report: imported.report },
      );
    }
    const existing = await this.repository.findDatasetByDomainId(imported.dataset.id, owner);
    const now = this.clock();
    if (existing && existing.expiresAt > now) {
      return { dataset: datasetDto(existing), previewRows: [0, 1, 2].slice(0, existing.rowCount) };
    }
    const id = this.generateId();
    const payload = new TextEncoder().encode(canonicalJson(imported.dataset));
    const storageKey = `personalization/datasets/${id}.json`;
    const record: PersonalizationDatasetRecord = {
      id,
      domainDatasetId: imported.dataset.id,
      owner,
      templateVersionId: imported.dataset.templateVersionId,
      sha256: imported.dataset.sha256,
      payloadSha256: checksum(payload),
      storageKey,
      rowCount: imported.dataset.rows.length,
      columns: imported.dataset.columns,
      report: imported.report,
      createdAt: now,
      expiresAt: expiresAt(now),
    };
    await this.objectStore.put(storageKey, payload, "application/json");
    try {
      const stored = await this.repository.createDataset(record);
      if (stored.id !== id) await this.objectStore.delete(storageKey);
      console.info(JSON.stringify({
        scope: "vortex-platform",
        event: "personalization.dataset-created",
        personalizationDatasetId: stored.id,
        templateVersionId: stored.templateVersionId,
        rowCount: stored.rowCount,
      }));
      return { dataset: datasetDto(stored), previewRows: [0, 1, 2].slice(0, stored.rowCount) };
    } catch (error) {
      await this.objectStore.delete(storageKey);
      if (error instanceof GuestIdentityAlreadyClaimedError) {
        throw new PlatformError(
          "GUEST_IDENTITY_CLAIMED",
          "This guest session was already claimed. Refresh before uploading another dataset.",
          409,
        );
      }
      throw error;
    }
  }

  async listDatasets(owner: ProjectOwner) {
    await this.purgeExpired();
    const now = this.clock();
    return (await this.repository.listDatasets(owner))
      .filter((record) => record.expiresAt > now)
      .map(datasetDto);
  }

  async loadDataset(id: string): Promise<PersonalizationDataset> {
    const datasetRecord = await this.repository.findDatasetInternal(id);
    if (!datasetRecord) throw new Error("PERSONALIZATION_DATASET_NOT_FOUND");
    if (datasetRecord.expiresAt <= this.clock()) {
      throw new Error("PERSONALIZATION_DATASET_EXPIRED");
    }
    const object = await this.objectStore.get(datasetRecord.storageKey);
    if (!object || object.contentType !== "application/json" || checksum(object.bytes) !== datasetRecord.payloadSha256) {
      throw new Error("PERSONALIZATION_DATASET_INTEGRITY_FAILED");
    }
    const dataset = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes)) as PersonalizationDataset;
    if (
      dataset.id !== datasetRecord.domainDatasetId ||
      dataset.templateVersionId !== datasetRecord.templateVersionId ||
      dataset.sha256 !== datasetRecord.sha256 ||
      dataset.rows.length !== datasetRecord.rowCount
    ) throw new Error("PERSONALIZATION_DATASET_INTEGRITY_FAILED");
    dataset.rows.forEach((row, index) => {
      if (row.rowIndex !== index) throw new Error("PERSONALIZATION_DATASET_INTEGRITY_FAILED");
      parsePersonalizationData(row.personalization);
    });
    return dataset;
  }

  async preview(owner: ProjectOwner, datasetId: string, rowIndex: number) {
    const record = await this.repository.findDataset(datasetId, owner);
    if (!record || record.expiresAt <= this.clock()) throw new NotFoundError("Dataset not found.");
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= Math.min(3, record.rowCount)) {
      throw new ValidationError("PERSONALIZATION_PREVIEW_ROW_INVALID", "Only the first three rows can be previewed.");
    }
    const dataset = await this.loadDataset(record.id);
    const separator = record.templateVersionId.lastIndexOf("@");
    const template = await this.templates.version(
      record.templateVersionId.slice(0, separator),
      record.templateVersionId,
    );
    const compatibility = template.compatibility[0];
    const resolved = await this.products.resolve(
      compatibility.productId,
      compatibility.productVersionId,
      compatibility.optionSelection,
    );
    const variant = personalizedTemplateVariant(template, dataset, rowIndex);
    return renderDesignPreview(variant.design, resolved.productConfig, async (assetId) => {
      if (!template.assetIds.includes(assetId)) return null;
      const { asset, object } = await this.templateAssets.read(assetId);
      return { bytes: object.bytes, mimeType: asset.mimeType };
    });
  }

  async createJob(owner: ProjectOwner, datasetId: string, idempotencyKey: string) {
    await this.purgeExpired();
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new ValidationError("IDEMPOTENCY_KEY_INVALID", "A valid Idempotency-Key is required.");
    }
    const dataset = await this.repository.findDataset(datasetId, owner);
    if (!dataset || dataset.expiresAt <= this.clock()) throw new NotFoundError("Dataset not found.");
    const now = this.clock();
    const record: PersonalizationJobRecord = {
      id: this.generateId(),
      owner,
      datasetId: dataset.id,
      templateVersionId: dataset.templateVersionId,
      status: "queued",
      processed: 0,
      total: dataset.rowCount,
      failed: 0,
      attempt: 0,
      maxAttempts: 3,
      outputStorageKey: null,
      outputSha256: null,
      outputByteSize: null,
      errorCode: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    };
    let stored: PersonalizationJobRecord;
    try {
      stored = await this.repository.createJob(record, idempotencyKey);
    } catch {
      throw new PlatformError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency-Key was already used for another dataset.",
        409,
      );
    }
    if (stored.status === "queued") this.runner?.schedule(stored.id);
    console.info(JSON.stringify({
      scope: "vortex-platform",
      event: "personalization.job-created",
      personalizationJobId: stored.id,
      datasetId: stored.datasetId,
      total: stored.total,
    }));
    return jobDto(stored);
  }

  async listJobs(owner: ProjectOwner) {
    await this.purgeExpired();
    return (await this.repository.listJobs(owner)).map(jobDto);
  }

  async getJob(owner: ProjectOwner, id: string) {
    await this.purgeExpired();
    const job = await this.repository.findJob(id, owner);
    if (!job) throw new NotFoundError("Personalization job not found.");
    return jobDto(job);
  }

  async cancel(owner: ProjectOwner, id: string) {
    if (!(await this.repository.cancelJob(id, owner, this.clock()))) {
      const existing = await this.repository.findJob(id, owner);
      if (!existing) throw new NotFoundError("Personalization job not found.");
    }
    return this.getJob(owner, id);
  }

  async retry(owner: ProjectOwner, id: string) {
    const retried = await this.repository.retryJob(id, owner, this.clock());
    if (!retried) {
      const existing = await this.repository.findJob(id, owner);
      if (!existing) throw new NotFoundError("Personalization job not found.");
      throw new PlatformError("PERSONALIZATION_JOB_NOT_RETRYABLE", "Job cannot be retried.", 409);
    }
    this.runner?.schedule(retried.id);
    return jobDto(retried);
  }

  async readOutput(owner: ProjectOwner, id: string): Promise<{ job: PersonalizationJobDto; object: StoredObject }> {
    await this.purgeExpired();
    const record = await this.repository.findJob(id, owner);
    if (!record || record.status !== "completed" || !record.outputStorageKey ||
      !record.outputSha256 || !record.outputByteSize) {
      throw new NotFoundError("Personalization output not found.");
    }
    const object = await this.objectStore.get(record.outputStorageKey);
    if (!object || object.contentType !== "application/x-ndjson" ||
      object.byteSize !== record.outputByteSize || checksum(object.bytes) !== record.outputSha256) {
      throw new ValidationError("PERSONALIZATION_OUTPUT_INTEGRITY_FAILED", "Personalization output failed integrity verification.");
    }
    return { job: jobDto(record), object };
  }

  async purgeExpired() {
    const expired = await this.repository.listExpired(this.clock());
    for (const entry of expired) {
      await Promise.all([
        this.objectStore.delete(entry.dataset.storageKey),
        ...entry.outputStorageKeys.map((key) => this.objectStore.delete(key)),
      ]);
      await this.repository.deleteDataset(entry.dataset.id);
    }
    return expired.length;
  }
}
