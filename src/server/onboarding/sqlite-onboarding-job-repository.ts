import type {
  OnboardingAsset,
  OnboardingJob,
  OnboardingJobRepository,
} from "@/platform/onboarding/types";
import type { VortexDatabase } from "@/server/persistence/database";

type JobRow = {
  id: string;
  operator_id: string;
  product_id: string;
  draft_id: string | null;
  status: OnboardingJob["status"];
  input_asset_id: string;
  manifest_asset_id: string | null;
  command_version: string;
  started_at: string | null;
  completed_at: string | null;
  report_asset_id: string | null;
  error_code: string | null;
  stdout_text: string;
  stderr_text: string;
  created_at: string;
};

type AssetRow = {
  id: string;
  job_id: string;
  role: OnboardingAsset["role"];
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  storage_key: string;
  created_at: string;
};

function decodeJob(row: JobRow): OnboardingJob {
  return {
    id: row.id,
    operatorId: row.operator_id,
    productId: row.product_id,
    draftId: row.draft_id,
    status: row.status,
    inputAssetId: row.input_asset_id,
    manifestAssetId: row.manifest_asset_id,
    commandVersion: row.command_version,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    reportAssetId: row.report_asset_id,
    errorCode: row.error_code,
    stdout: row.stdout_text,
    stderr: row.stderr_text,
    createdAt: row.created_at,
  };
}

function decodeAsset(row: AssetRow): OnboardingAsset {
  return {
    id: row.id,
    jobId: row.job_id,
    role: row.role,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    storageKey: row.storage_key,
    createdAt: row.created_at,
  };
}

export class SqliteOnboardingJobRepository implements OnboardingJobRepository {
  constructor(private readonly database: VortexDatabase) {}

  async create(job: OnboardingJob, assets: OnboardingAsset[]) {
    return this.database.transaction(() => {
      for (const asset of assets) {
        this.database.prepare(`
          INSERT INTO onboarding_assets (
            id, job_id, role, filename, mime_type, byte_size, sha256, storage_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          asset.id,
          asset.jobId,
          asset.role,
          asset.filename,
          asset.mimeType,
          asset.byteSize,
          asset.sha256,
          asset.storageKey,
          asset.createdAt,
        );
      }
      this.database.prepare(`
        INSERT INTO onboarding_jobs (
          id, operator_id, product_id, draft_id, status, input_asset_id,
          manifest_asset_id, command_version, started_at, completed_at,
          report_asset_id, error_code, stdout_text, stderr_text, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '', '', ?)
      `).run(
        job.id,
        job.operatorId,
        job.productId,
        job.draftId,
        job.status,
        job.inputAssetId,
        job.manifestAssetId,
        job.commandVersion,
        job.createdAt,
      );
      return job;
    })();
  }

  async find(jobId: string) {
    const row = this.database.prepare(
      "SELECT * FROM onboarding_jobs WHERE id = ?",
    ).get(jobId) as JobRow | undefined;
    return row ? decodeJob(row) : null;
  }

  async listAssets(jobId: string) {
    return (this.database.prepare(`
      SELECT * FROM onboarding_assets WHERE job_id = ? ORDER BY created_at, id
    `).all(jobId) as AssetRow[]).map(decodeAsset);
  }

  async markRunning(jobId: string, startedAt: string) {
    return this.database.prepare(`
      UPDATE onboarding_jobs SET status = 'running', started_at = ?
      WHERE id = ? AND status = 'queued'
    `).run(startedAt, jobId).changes === 1;
  }

  async addOutput(jobId: string, asset: OnboardingAsset) {
    if (asset.jobId !== jobId) throw new Error("Onboarding output belongs to another job.");
    this.database.prepare(`
      INSERT INTO onboarding_assets (
        id, job_id, role, filename, mime_type, byte_size, sha256, storage_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asset.id,
      asset.jobId,
      asset.role,
      asset.filename,
      asset.mimeType,
      asset.byteSize,
      asset.sha256,
      asset.storageKey,
      asset.createdAt,
    );
  }

  async complete(input: Parameters<OnboardingJobRepository["complete"]>[0]) {
    const updated = this.database.prepare(`
      UPDATE onboarding_jobs
      SET status = ?, report_asset_id = ?, error_code = ?, stdout_text = ?,
          stderr_text = ?, completed_at = ?
      WHERE id = ? AND status = 'running'
    `).run(
      input.status,
      input.reportAssetId,
      input.errorCode,
      input.stdout,
      input.stderr,
      input.completedAt,
      input.jobId,
    );
    if (updated.changes !== 1) throw new Error("Onboarding job could not be completed.");
  }
}
