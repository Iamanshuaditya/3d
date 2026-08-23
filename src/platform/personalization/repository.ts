import type { ProjectOwner } from "@/platform/projects/types";
import type {
  PersonalizationDatasetRecord,
  PersonalizationJobRecord,
  PersonalizationJobStatus,
} from "./types";

export interface PersonalizationRepository {
  createDataset(record: PersonalizationDatasetRecord): Promise<PersonalizationDatasetRecord>;
  findDataset(id: string, owner: ProjectOwner): Promise<PersonalizationDatasetRecord | null>;
  findDatasetInternal(id: string): Promise<PersonalizationDatasetRecord | null>;
  findDatasetByDomainId(
    domainDatasetId: string,
    owner: ProjectOwner,
  ): Promise<PersonalizationDatasetRecord | null>;
  listDatasets(owner: ProjectOwner): Promise<PersonalizationDatasetRecord[]>;
  createJob(record: PersonalizationJobRecord, idempotencyKey: string): Promise<PersonalizationJobRecord>;
  findJob(id: string, owner: ProjectOwner): Promise<PersonalizationJobRecord | null>;
  findJobInternal(id: string): Promise<PersonalizationJobRecord | null>;
  listJobs(owner: ProjectOwner): Promise<PersonalizationJobRecord[]>;
  recoverInterruptedJobs(now: string): Promise<PersonalizationJobRecord[]>;
  markRunning(id: string, now: string): Promise<PersonalizationJobRecord | null>;
  updateProgress(id: string, processed: number, failed: number, now: string): Promise<void>;
  finishJob(input: {
    id: string;
    status: Extract<PersonalizationJobStatus, "completed" | "failed" | "cancelled">;
    outputStorageKey?: string | null;
    outputSha256?: string | null;
    outputByteSize?: number | null;
    errorCode?: string | null;
    now: string;
  }): Promise<void>;
  cancelJob(id: string, owner: ProjectOwner, now: string): Promise<boolean>;
  retryJob(id: string, owner: ProjectOwner, now: string): Promise<PersonalizationJobRecord | null>;
  listExpired(before: string): Promise<Array<{
    dataset: PersonalizationDatasetRecord;
    outputStorageKeys: string[];
  }>>;
  deleteDataset(id: string): Promise<void>;
}
