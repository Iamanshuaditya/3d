import type { ProjectOwner } from "@/platform/projects/types";
import type { PersonalizationRepository } from "@/platform/personalization/repository";
import { GuestIdentityAlreadyClaimedError } from "@/platform/projects/repository";
import type {
  PersonalizationDatasetRecord,
  PersonalizationJobRecord,
  PersonalizationJobStatus,
} from "@/platform/personalization/types";
import type { VortexDatabase } from "@/server/persistence/database";

type DatasetRow = {
  id: string;
  domain_dataset_id: string;
  owner_type: ProjectOwner["type"];
  owner_id: string;
  template_version_id: string;
  sha256: string;
  payload_sha256: string;
  storage_key: string;
  row_count: number;
  columns_json: string;
  report_json: string;
  created_at: string;
  expires_at: string;
};

type JobRow = {
  id: string;
  owner_type: ProjectOwner["type"];
  owner_id: string;
  dataset_id: string;
  template_version_id: string;
  status: PersonalizationJobStatus;
  processed: number;
  total: number;
  failed: number;
  attempt: number;
  max_attempts: number;
  output_storage_key: string | null;
  output_sha256: string | null;
  output_byte_size: number | null;
  error_code: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

function decodeDataset(row: DatasetRow): PersonalizationDatasetRecord {
  return {
    id: row.id,
    domainDatasetId: row.domain_dataset_id,
    owner: { type: row.owner_type, id: row.owner_id },
    templateVersionId: row.template_version_id,
    sha256: row.sha256,
    payloadSha256: row.payload_sha256,
    storageKey: row.storage_key,
    rowCount: row.row_count,
    columns: JSON.parse(row.columns_json) as PersonalizationDatasetRecord["columns"],
    report: JSON.parse(row.report_json) as PersonalizationDatasetRecord["report"],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function decodeJob(row: JobRow): PersonalizationJobRecord {
  return {
    id: row.id,
    owner: { type: row.owner_type, id: row.owner_id },
    datasetId: row.dataset_id,
    templateVersionId: row.template_version_id,
    status: row.status,
    processed: row.processed,
    total: row.total,
    failed: row.failed,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    outputStorageKey: row.output_storage_key,
    outputSha256: row.output_sha256,
    outputByteSize: row.output_byte_size,
    errorCode: row.error_code,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

const DATASET_COLUMNS = `
  id, domain_dataset_id, owner_type, owner_id, template_version_id, sha256,
  payload_sha256, storage_key, row_count, columns_json, report_json, created_at, expires_at
`;
const JOB_COLUMNS = `
  id, owner_type, owner_id, dataset_id, template_version_id, status, processed,
  total, failed, attempt, max_attempts, output_storage_key, output_sha256,
  output_byte_size, error_code, created_at, started_at, completed_at, updated_at
`;

export class SqlitePersonalizationRepository implements PersonalizationRepository {
  constructor(private readonly database: VortexDatabase) {}

  async createDataset(record: PersonalizationDatasetRecord) {
    return this.database.transaction(() => {
      if (record.owner.type === "guest" && this.database.prepare(
        "SELECT 1 FROM project_owner_claims WHERE guest_id = ?",
      ).get(record.owner.id)) {
        throw new GuestIdentityAlreadyClaimedError();
      }
      const existing = this.database.prepare(`
        SELECT ${DATASET_COLUMNS} FROM personalization_datasets
        WHERE owner_type = ? AND owner_id = ? AND domain_dataset_id = ?
        ORDER BY created_at LIMIT 1
      `).get(record.owner.type, record.owner.id, record.domainDatasetId) as DatasetRow | undefined;
      if (existing) return decodeDataset(existing);
      this.database.prepare(`
        INSERT INTO personalization_datasets (
          id, domain_dataset_id, owner_type, owner_id, template_version_id, sha256,
          payload_sha256, storage_key, row_count, columns_json, report_json, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id, record.domainDatasetId, record.owner.type, record.owner.id,
        record.templateVersionId, record.sha256, record.payloadSha256, record.storageKey,
        record.rowCount, JSON.stringify(record.columns), JSON.stringify(record.report),
        record.createdAt, record.expiresAt,
      );
      return record;
    })();
  }

  async findDataset(id: string, owner: ProjectOwner) {
    const row = this.database.prepare(`
      SELECT ${DATASET_COLUMNS} FROM personalization_datasets
      WHERE id = ? AND owner_type = ? AND owner_id = ?
    `).get(id, owner.type, owner.id) as DatasetRow | undefined;
    return row ? decodeDataset(row) : null;
  }

  async findDatasetInternal(id: string) {
    const row = this.database.prepare(`
      SELECT ${DATASET_COLUMNS} FROM personalization_datasets WHERE id = ?
    `).get(id) as DatasetRow | undefined;
    return row ? decodeDataset(row) : null;
  }

  async findDatasetByDomainId(domainDatasetId: string, owner: ProjectOwner) {
    const row = this.database.prepare(`
      SELECT ${DATASET_COLUMNS} FROM personalization_datasets
      WHERE domain_dataset_id = ? AND owner_type = ? AND owner_id = ?
      ORDER BY created_at LIMIT 1
    `).get(domainDatasetId, owner.type, owner.id) as DatasetRow | undefined;
    return row ? decodeDataset(row) : null;
  }

  async listDatasets(owner: ProjectOwner) {
    return (this.database.prepare(`
      SELECT ${DATASET_COLUMNS} FROM personalization_datasets
      WHERE owner_type = ? AND owner_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(owner.type, owner.id) as DatasetRow[]).map(decodeDataset);
  }

  async createJob(record: PersonalizationJobRecord, idempotencyKey: string) {
    return this.database.transaction(() => {
      const existing = this.database.prepare(`
        SELECT ${JOB_COLUMNS} FROM personalization_jobs
        WHERE owner_type = ? AND owner_id = ? AND idempotency_key = ?
        ORDER BY created_at LIMIT 1
      `).get(record.owner.type, record.owner.id, idempotencyKey) as JobRow | undefined;
      if (existing) {
        if (existing.dataset_id !== record.datasetId) {
          throw new Error("Personalization job idempotency key was reused.");
        }
        return decodeJob(existing);
      }
      this.database.prepare(`
        INSERT INTO personalization_jobs (
          id, owner_type, owner_id, dataset_id, template_version_id, status,
          processed, total, failed, attempt, max_attempts, idempotency_key,
          output_storage_key, output_sha256, output_byte_size, error_code,
          created_at, started_at, completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?)
      `).run(
        record.id, record.owner.type, record.owner.id, record.datasetId,
        record.templateVersionId, record.status, record.processed, record.total,
        record.failed, record.attempt, record.maxAttempts, idempotencyKey,
        record.createdAt, record.updatedAt,
      );
      return record;
    })();
  }

  async findJob(id: string, owner: ProjectOwner) {
    const row = this.database.prepare(`
      SELECT ${JOB_COLUMNS} FROM personalization_jobs
      WHERE id = ? AND owner_type = ? AND owner_id = ?
    `).get(id, owner.type, owner.id) as JobRow | undefined;
    return row ? decodeJob(row) : null;
  }

  async findJobInternal(id: string) {
    const row = this.database.prepare(`SELECT ${JOB_COLUMNS} FROM personalization_jobs WHERE id = ?`)
      .get(id) as JobRow | undefined;
    return row ? decodeJob(row) : null;
  }

  async listJobs(owner: ProjectOwner) {
    return (this.database.prepare(`
      SELECT ${JOB_COLUMNS} FROM personalization_jobs
      WHERE owner_type = ? AND owner_id = ? ORDER BY created_at DESC, id DESC
    `).all(owner.type, owner.id) as JobRow[]).map(decodeJob);
  }

  async recoverInterruptedJobs(now: string) {
    return this.database.transaction(() => {
      this.database.prepare(`
        UPDATE personalization_jobs
        SET status = CASE WHEN attempt >= max_attempts THEN 'failed' ELSE 'queued' END,
            processed = CASE WHEN attempt >= max_attempts THEN processed ELSE 0 END,
            failed = CASE WHEN attempt >= max_attempts THEN failed ELSE 0 END,
            error_code = 'PERSONALIZATION_WORKER_INTERRUPTED',
            completed_at = CASE WHEN attempt >= max_attempts THEN ? ELSE NULL END,
            updated_at = ?
        WHERE status = 'running'
      `).run(now, now);
      return (this.database.prepare(`
        SELECT ${JOB_COLUMNS} FROM personalization_jobs
        WHERE status = 'queued' ORDER BY created_at, id
      `).all() as JobRow[]).map(decodeJob);
    })();
  }

  async markRunning(id: string, now: string) {
    const changed = this.database.prepare(`
      UPDATE personalization_jobs
      SET status = 'running', attempt = attempt + 1, started_at = ?, completed_at = NULL,
          error_code = NULL, processed = 0, failed = 0, updated_at = ?
      WHERE id = ? AND status = 'queued' AND attempt < max_attempts
    `).run(now, now, id);
    return changed.changes === 1 ? this.findJobInternal(id) : null;
  }

  async updateProgress(id: string, processed: number, failed: number, now: string) {
    this.database.prepare(`
      UPDATE personalization_jobs SET processed = ?, failed = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(processed, failed, now, id);
  }

  async finishJob(input: {
    id: string;
    status: "completed" | "failed" | "cancelled";
    outputStorageKey?: string | null;
    outputSha256?: string | null;
    outputByteSize?: number | null;
    errorCode?: string | null;
    now: string;
  }) {
    this.database.prepare(`
      UPDATE personalization_jobs
      SET status = ?, output_storage_key = ?, output_sha256 = ?, output_byte_size = ?,
          error_code = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(
      input.status, input.outputStorageKey ?? null, input.outputSha256 ?? null,
      input.outputByteSize ?? null, input.errorCode ?? null, input.now, input.now, input.id,
    );
  }

  async cancelJob(id: string, owner: ProjectOwner, now: string) {
    const result = this.database.prepare(`
      UPDATE personalization_jobs
      SET status = 'cancelled', error_code = NULL, completed_at = ?, updated_at = ?
      WHERE id = ? AND owner_type = ? AND owner_id = ? AND status IN ('queued', 'running')
    `).run(now, now, id, owner.type, owner.id);
    return result.changes === 1;
  }

  async retryJob(id: string, owner: ProjectOwner, now: string) {
    const result = this.database.prepare(`
      UPDATE personalization_jobs
      SET status = 'queued', processed = 0, failed = 0, output_storage_key = NULL,
          output_sha256 = NULL, output_byte_size = NULL, error_code = NULL,
          started_at = NULL, completed_at = NULL, updated_at = ?
      WHERE id = ? AND owner_type = ? AND owner_id = ?
        AND status = 'failed' AND attempt < max_attempts
    `).run(now, id, owner.type, owner.id);
    return result.changes === 1 ? this.findJob(id, owner) : null;
  }

  async listExpired(before: string) {
    const datasets = (this.database.prepare(`
      SELECT ${DATASET_COLUMNS} FROM personalization_datasets
      WHERE expires_at <= ? ORDER BY expires_at, id
    `).all(before) as DatasetRow[]).map(decodeDataset);
    return datasets.map((dataset) => ({
      dataset,
      outputStorageKeys: (this.database.prepare(`
        SELECT output_storage_key FROM personalization_jobs
        WHERE dataset_id = ? AND output_storage_key IS NOT NULL
      `).all(dataset.id) as Array<{ output_storage_key: string }>).map((row) => row.output_storage_key),
    }));
  }

  async deleteDataset(id: string) {
    this.database.prepare("DELETE FROM personalization_datasets WHERE id = ?").run(id);
  }
}
