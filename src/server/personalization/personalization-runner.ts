import { createHash } from "node:crypto";
import type { PersonalizationRepository } from "@/platform/personalization/repository";
import type { ObjectStore } from "@/platform/storage/object-store";
import type { PersonalizationDataset } from "@/platform/templates/types";
import { canonicalJson } from "@/server/persistence/canonical-json";
import type { TemplateCatalogService } from "@/server/templates/template-catalog-service";
import { personalizedTemplateVariants } from "@/server/templates/personalization-dataset";

export const MAX_PERSONALIZATION_OUTPUT_BYTES = 64 * 1024 * 1024;
const PROGRESS_INTERVAL = 25;
const MAX_CONCURRENT_JOBS = 2;

function log(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "vortex-platform", event, ...details }));
}

export class PersonalizationRunner {
  private readonly pending = new Set<string>();
  private active = 0;

  constructor(
    private readonly repository: PersonalizationRepository,
    private readonly objectStore: ObjectStore,
    private readonly templates: TemplateCatalogService,
    private readonly loadDataset: (id: string) => Promise<PersonalizationDataset>,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  schedule(jobId: string): void {
    this.pending.add(jobId);
    queueMicrotask(() => void this.drain());
  }

  private async drain() {
    while (this.active < MAX_CONCURRENT_JOBS && this.pending.size) {
      const jobId = this.pending.values().next().value as string;
      this.pending.delete(jobId);
      this.active += 1;
      void this.run(jobId).finally(() => {
        this.active -= 1;
        void this.drain();
      });
    }
  }

  private async run(jobId: string) {
    const job = await this.repository.markRunning(jobId, this.clock());
    if (!job) return;
    const started = Date.now();
    const outputStorageKey = `personalization/jobs/${job.id}.ndjson`;
    log("personalization.job-started", {
      personalizationJobId: job.id,
      datasetId: job.datasetId,
      attempt: job.attempt,
    });

    try {
      const dataset = await this.loadDataset(job.datasetId);
      const separator = dataset.templateVersionId.lastIndexOf("@");
      if (separator < 1) throw new Error("PERSONALIZATION_TEMPLATE_ID_INVALID");
      const template = await this.templates.version(
        dataset.templateVersionId.slice(0, separator),
        dataset.templateVersionId,
      );
      const lines = [canonicalJson({
        kind: "vortex-personalization-manifest",
        version: 1,
        jobId: job.id,
        datasetId: job.datasetId,
        templateVersionId: template.id,
        total: dataset.rows.length,
      })];
      let byteSize = Buffer.byteLength(lines[0]) + 1;
      let processed = 0;
      for (const variant of personalizedTemplateVariants(template, dataset)) {
        const current = await this.repository.findJobInternal(job.id);
        if (!current || current.status === "cancelled") {
          await this.objectStore.delete(outputStorageKey);
          return;
        }
        const line = canonicalJson({
          kind: "variant",
          id: variant.id,
          rowIndex: variant.rowIndex,
          sourceRowNumber: variant.sourceRowNumber,
          personalization: variant.personalization,
          design: variant.design,
        });
        byteSize += Buffer.byteLength(line) + 1;
        if (byteSize > MAX_PERSONALIZATION_OUTPUT_BYTES) {
          throw new Error("PERSONALIZATION_OUTPUT_TOO_LARGE");
        }
        lines.push(line);
        processed += 1;
        if (processed % PROGRESS_INTERVAL === 0 || processed === job.total) {
          await this.repository.updateProgress(job.id, processed, 0, this.clock());
        }
      }
      const bytes = new TextEncoder().encode(`${lines.join("\n")}\n`);
      await this.objectStore.put(outputStorageKey, bytes, "application/x-ndjson");
      const current = await this.repository.findJobInternal(job.id);
      if (!current || current.status === "cancelled") {
        await this.objectStore.delete(outputStorageKey);
        return;
      }
      const checksum = createHash("sha256").update(bytes).digest("hex");
      await this.repository.finishJob({
        id: job.id,
        status: "completed",
        outputStorageKey,
        outputSha256: checksum,
        outputByteSize: bytes.byteLength,
        now: this.clock(),
      });
      log("personalization.job-completed", {
        personalizationJobId: job.id,
        processed,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      await this.objectStore.delete(outputStorageKey);
      const code = error instanceof Error && /^PERSONALIZATION_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "PERSONALIZATION_GENERATION_FAILED";
      await this.repository.finishJob({
        id: job.id,
        status: "failed",
        errorCode: code,
        now: this.clock(),
      });
      log("personalization.job-failed", {
        personalizationJobId: job.id,
        errorCode: code,
        durationMs: Date.now() - started,
      });
    }
  }
}
