import type { ProjectOwner } from "@/platform/projects/types";
import type {
  PersonalizationDatasetColumn,
  PersonalizationDatasetReport,
} from "@/platform/templates/types";

export type PersonalizationDatasetRecord = {
  id: string;
  domainDatasetId: string;
  owner: ProjectOwner;
  templateVersionId: string;
  sha256: string;
  payloadSha256: string;
  storageKey: string;
  rowCount: number;
  columns: PersonalizationDatasetColumn[];
  report: PersonalizationDatasetReport;
  createdAt: string;
  expiresAt: string;
};

export type PersonalizationJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type PersonalizationJobRecord = {
  id: string;
  owner: ProjectOwner;
  datasetId: string;
  templateVersionId: string;
  status: PersonalizationJobStatus;
  processed: number;
  total: number;
  failed: number;
  attempt: number;
  maxAttempts: number;
  outputStorageKey: string | null;
  outputSha256: string | null;
  outputByteSize: number | null;
  errorCode: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type PersonalizationDatasetDto = Omit<
  PersonalizationDatasetRecord,
  "owner" | "storageKey" | "payloadSha256" | "domainDatasetId"
>;

export type PersonalizationJobDto = Omit<
  PersonalizationJobRecord,
  "owner" | "outputStorageKey"
> & { downloadUrl: string | null };
