export type OnboardingJobStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "cancelled";

export type OnboardingAssetRole =
  | "input_glb"
  | "input_manifest"
  | "inspection"
  | "validation_report"
  | "product_glb"
  | "product_config"
  | "regions"
  | "diagnostic"
  | "uv_template";

export type OnboardingAsset = {
  id: string;
  jobId: string;
  role: OnboardingAssetRole;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  createdAt: string;
};

export type OnboardingJob = {
  id: string;
  operatorId: string;
  productId: string;
  draftId: string | null;
  status: OnboardingJobStatus;
  inputAssetId: string;
  manifestAssetId: string | null;
  commandVersion: string;
  startedAt: string | null;
  completedAt: string | null;
  reportAssetId: string | null;
  errorCode: string | null;
  stdout: string;
  stderr: string;
  createdAt: string;
};

export interface OnboardingJobRepository {
  create(job: OnboardingJob, assets: OnboardingAsset[]): Promise<OnboardingJob>;
  find(jobId: string): Promise<OnboardingJob | null>;
  listAssets(jobId: string): Promise<OnboardingAsset[]>;
  markRunning(jobId: string, startedAt: string): Promise<boolean>;
  addOutput(jobId: string, asset: OnboardingAsset): Promise<void>;
  complete(input: {
    jobId: string;
    status: "passed" | "failed";
    reportAssetId: string | null;
    errorCode: string | null;
    stdout: string;
    stderr: string;
    completedAt: string;
  }): Promise<void>;
}
