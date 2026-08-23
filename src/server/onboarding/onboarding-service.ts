import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NotFoundError, ValidationError } from "@/platform/projects/errors";
import type { ProductOperator } from "@/platform/products/drafts";
import type {
  OnboardingAsset,
  OnboardingJob,
  OnboardingJobRepository,
} from "@/platform/onboarding/types";
import type { ObjectStore } from "@/platform/storage/object-store";
import {
  onboardingAssetStorageKey,
  type OnboardingRunner,
} from "./onboarding-runner";

export const MAX_GLB_BYTES = 64 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 1024 * 1024;
const PRODUCT_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

function assertGlb(bytes: Uint8Array) {
  if (bytes.byteLength < 12 || bytes.byteLength > MAX_GLB_BYTES) {
    throw new ValidationError("GLB_SIZE_INVALID", "GLB size is outside the allowed range.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") !== "glTF" ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  ) {
    throw new ValidationError("GLB_INVALID", "Input must be a structurally framed GLB v2 file.");
  }
}

function normalizeManifest(bytes: Uint8Array, productId: string) {
  if (!bytes.byteLength || bytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new ValidationError("MANIFEST_SIZE_INVALID", "Manifest size is invalid.");
  }
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    parsed = value as Record<string, unknown>;
  } catch {
    throw new ValidationError("MANIFEST_INVALID", "Manifest must contain valid UTF-8 JSON.");
  }
  parsed.id = productId;
  parsed.source = "source.glb";
  const normalized = Buffer.from(JSON.stringify(parsed));
  if (normalized.byteLength > MAX_MANIFEST_BYTES) {
    throw new ValidationError("MANIFEST_SIZE_INVALID", "Normalized manifest is too large.");
  }
  return normalized;
}

function commandVersion(onboardingRoot: string) {
  return createHash("sha256")
    .update(readFileSync(join(onboardingRoot, "onboard.py")))
    .digest("hex");
}

export class OnboardingService {
  constructor(
    private readonly repository: OnboardingJobRepository,
    private readonly objectStore: ObjectStore,
    private readonly runner: OnboardingRunner,
    private readonly onboardingRoot: string,
    private readonly generateId: () => string = () => crypto.randomUUID(),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private async persistInput(
    jobId: string,
    role: "input_glb" | "input_manifest",
    filename: string,
    mimeType: string,
    bytes: Uint8Array,
    now: string,
  ) {
    const id = this.generateId();
    const storageKey = onboardingAssetStorageKey(jobId, id, role);
    const asset: OnboardingAsset = {
      id,
      jobId,
      role,
      filename,
      mimeType,
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      storageKey,
      createdAt: now,
    };
    await this.objectStore.put(storageKey, bytes, mimeType);
    return asset;
  }

  async create(
    operator: ProductOperator,
    input: {
      productId: string;
      draftId?: string | null;
      glb: Uint8Array;
      manifest?: Uint8Array | null;
    },
  ) {
    if (!PRODUCT_ID.test(input.productId)) {
      throw new ValidationError("PRODUCT_ID_INVALID", "Onboarding product id is invalid.");
    }
    if (input.draftId && !/^[a-zA-Z0-9._:@-]{1,180}$/.test(input.draftId)) {
      throw new ValidationError("DRAFT_ID_INVALID", "Onboarding draft id is invalid.");
    }
    assertGlb(input.glb);
    const manifest = input.manifest
      ? normalizeManifest(input.manifest, input.productId)
      : null;
    const jobId = this.generateId();
    const now = this.clock();
    const stored: OnboardingAsset[] = [];
    try {
      stored.push(await this.persistInput(
        jobId,
        "input_glb",
        "source.glb",
        "model/gltf-binary",
        input.glb,
        now,
      ));
      if (manifest) {
        stored.push(await this.persistInput(
          jobId,
          "input_manifest",
          "manifest.json",
          "application/json",
          manifest,
          now,
        ));
      }
      const job: OnboardingJob = {
        id: jobId,
        operatorId: operator.id,
        productId: input.productId,
        draftId: input.draftId ?? null,
        status: "queued",
        inputAssetId: stored[0].id,
        manifestAssetId: stored[1]?.id ?? null,
        commandVersion: commandVersion(this.onboardingRoot),
        startedAt: null,
        completedAt: null,
        reportAssetId: null,
        errorCode: null,
        stdout: "",
        stderr: "",
        createdAt: now,
      };
      await this.repository.create(job, stored);
      console.info(JSON.stringify({
        scope: "vortex-platform",
        event: "onboarding.job-created",
        onboardingJobId: job.id,
        operatorId: operator.id,
        productId: job.productId,
        hasManifest: Boolean(job.manifestAssetId),
      }));
      this.runner.schedule(job.id);
      return job;
    } catch (error) {
      await Promise.all(stored.map((asset) => this.objectStore.delete(asset.storageKey)));
      throw error;
    }
  }

  async get(jobId: string) {
    const job = await this.repository.find(jobId);
    if (!job) throw new NotFoundError("Onboarding job not found.");
    return { job, assets: await this.repository.listAssets(jobId) };
  }

  async readOutput(jobId: string, assetId: string) {
    const { assets } = await this.get(jobId);
    const asset = assets.find((candidate) => candidate.id === assetId);
    if (!asset || asset.role.startsWith("input_")) {
      throw new NotFoundError("Onboarding output not found.");
    }
    const object = await this.objectStore.get(asset.storageKey);
    if (!object) throw new NotFoundError("Onboarding output bytes are unavailable.");
    if (
      object.byteSize !== asset.byteSize ||
      object.contentType !== asset.mimeType ||
      createHash("sha256").update(object.bytes).digest("hex") !== asset.sha256
    ) {
      throw new ValidationError(
        "ONBOARDING_OUTPUT_INTEGRITY_FAILED",
        "Onboarding output does not match its immutable record.",
      );
    }
    return { asset, bytes: object.bytes };
  }
}
