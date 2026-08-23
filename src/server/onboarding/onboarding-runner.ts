import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  OnboardingAsset,
  OnboardingAssetRole,
  OnboardingJobRepository,
} from "@/platform/onboarding/types";
import type { ObjectStore } from "@/platform/storage/object-store";

const MAX_PROCESS_OUTPUT_BYTES = 256 * 1024;
const MAX_OUTPUT_ASSET_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_OUTPUT_BYTES = 160 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60_000;

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export interface OnboardingCommandExecutor {
  run(executable: string, args: string[], cwd: string, timeoutMs: number): Promise<CommandResult>;
}

function appendBounded(current: Buffer[], chunk: Buffer) {
  const currentBytes = current.reduce((total, value) => total + value.byteLength, 0);
  if (currentBytes >= MAX_PROCESS_OUTPUT_BYTES) return;
  current.push(chunk.subarray(0, MAX_PROCESS_OUTPUT_BYTES - currentBytes));
}

export class SpawnCommandExecutor implements OnboardingCommandExecutor {
  run(executable: string, args: string[], cwd: string, timeoutMs: number) {
    return new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH,
          NODE_ENV: process.env.NODE_ENV || "production",
          PYTHONHASHSEED: "0",
          PYTHONDONTWRITEBYTECODE: "1",
        },
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => appendBounded(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => appendBounded(stderr, chunk));
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: timedOut ? 124 : (code ?? 1),
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          timedOut,
        });
      });
    });
  }
}

function safeLog(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(
    0,
    MAX_PROCESS_OUTPUT_BYTES,
  );
}

function outputDescriptor(filename: string): {
  role: OnboardingAssetRole;
  mimeType: string;
} | null {
  if (filename === "inspection.json") return { role: "inspection", mimeType: "application/json" };
  if (filename === "product-customizable.glb") return { role: "product_glb", mimeType: "model/gltf-binary" };
  if (filename === "product.json") return { role: "product_config", mimeType: "application/json" };
  if (filename === "regions.json") return { role: "regions", mimeType: "application/json" };
  if (/^diagnostic-[a-zA-Z0-9._-]+\.png$/.test(filename)) {
    return { role: "diagnostic", mimeType: "image/png" };
  }
  if (/^uv-template-[a-zA-Z0-9._-]+\.png$/.test(filename)) {
    return { role: "uv_template", mimeType: "image/png" };
  }
  if (/^uv-template-[a-zA-Z0-9._-]+\.svg$/.test(filename)) {
    return { role: "uv_template", mimeType: "image/svg+xml" };
  }
  return null;
}

export function onboardingAssetStorageKey(
  jobId: string,
  assetId: string,
  role: OnboardingAssetRole,
) {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(jobId) || !uuid.test(assetId) || !/^[a-z_]+$/.test(role)) {
    throw new Error("Invalid onboarding object identity.");
  }
  return `onboarding/${jobId}/${assetId}-${role}`;
}

export class OnboardingRunner {
  private active = 0;
  private readonly pending: string[] = [];

  constructor(
    private readonly repository: OnboardingJobRepository,
    private readonly objectStore: ObjectStore,
    private readonly workRoot: string,
    private readonly onboardingRoot: string,
    private readonly executor: OnboardingCommandExecutor = new SpawnCommandExecutor(),
    private readonly pythonExecutable = process.env.VORTEX_ONBOARDING_PYTHON ||
      join(onboardingRoot, ".venv", "bin", "python"),
    private readonly timeoutMs = Math.min(
      15 * 60_000,
      Math.max(10_000, Number(process.env.VORTEX_ONBOARDING_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
    ),
    private readonly maxConcurrent = 2,
    private readonly generateId: () => string = () => crypto.randomUUID(),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  schedule(jobId: string) {
    this.pending.push(jobId);
    this.drain();
  }

  private drain() {
    while (this.active < this.maxConcurrent && this.pending.length) {
      const jobId = this.pending.shift()!;
      this.active += 1;
      void this.run(jobId).finally(() => {
        this.active -= 1;
        this.drain();
      });
    }
  }

  private async storeOutput(
    jobId: string,
    role: OnboardingAssetRole,
    filename: string,
    bytes: Uint8Array,
    mimeType: string,
  ) {
    if (!bytes.byteLength || bytes.byteLength > MAX_OUTPUT_ASSET_BYTES) {
      throw new Error("ONBOARDING_OUTPUT_SIZE_INVALID");
    }
    const id = this.generateId();
    const storageKey = onboardingAssetStorageKey(jobId, id, role);
    const asset: OnboardingAsset = {
      id,
      jobId,
      role,
      filename: basename(filename).slice(0, 180),
      mimeType,
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      storageKey,
      createdAt: this.clock(),
    };
    await this.objectStore.put(storageKey, bytes, mimeType);
    try {
      await this.repository.addOutput(jobId, asset);
      return asset;
    } catch (error) {
      await this.objectStore.delete(storageKey);
      throw error;
    }
  }

  async run(jobId: string) {
    const startedAt = this.clock();
    if (!(await this.repository.markRunning(jobId, startedAt))) return;
    const started = Date.now();
    console.info(JSON.stringify({
      scope: "vortex-platform",
      event: "onboarding.job-started",
      onboardingJobId: jobId,
    }));
    const workDir = join(this.workRoot, jobId);
    let stdout = "";
    let stderr = "";
    let reportAssetId: string | null = null;
    let errorCode: string | null = null;
    let passed = false;
    try {
      const [job, assets] = await Promise.all([
        this.repository.find(jobId),
        this.repository.listAssets(jobId),
      ]);
      if (!job) throw new Error("ONBOARDING_JOB_NOT_FOUND");
      const input = assets.find((asset) => asset.id === job.inputAssetId);
      const manifest = job.manifestAssetId
        ? assets.find((asset) => asset.id === job.manifestAssetId)
        : null;
      if (!input) throw new Error("ONBOARDING_INPUT_MISSING");
      const inputObject = await this.objectStore.get(input.storageKey);
      if (!inputObject || createHash("sha256").update(inputObject.bytes).digest("hex") !== input.sha256) {
        throw new Error("ONBOARDING_INPUT_INTEGRITY_FAILED");
      }
      await mkdir(this.workRoot, { recursive: true, mode: 0o700 });
      await mkdir(workDir, { recursive: false, mode: 0o700 });
      await writeFile(join(workDir, "source.glb"), inputObject.bytes, { mode: 0o600 });
      if (manifest) {
        const manifestObject = await this.objectStore.get(manifest.storageKey);
        if (!manifestObject || createHash("sha256").update(manifestObject.bytes).digest("hex") !== manifest.sha256) {
          throw new Error("ONBOARDING_MANIFEST_INTEGRITY_FAILED");
        }
        await writeFile(join(workDir, "manifest.json"), manifestObject.bytes, { mode: 0o600 });
      }

      const script = join(this.onboardingRoot, "onboard.py");
      const inspect = await this.executor.run(
        this.pythonExecutable,
        [script, "inspect", workDir],
        this.onboardingRoot,
        this.timeoutMs,
      );
      stdout += inspect.stdout;
      stderr += inspect.stderr;
      if (inspect.exitCode !== 0) {
        errorCode = inspect.timedOut ? "ONBOARDING_TIMEOUT" : "ONBOARDING_INSPECTION_FAILED";
        return;
      }
      const inspectionBytes = await readFile(join(workDir, "inspection.json"));
      const inspection = await this.storeOutput(
        jobId,
        "inspection",
        "inspection.json",
        inspectionBytes,
        "application/json",
      );
      reportAssetId = inspection.id;

      if (!manifest) {
        passed = true;
        return;
      }

      const build = await this.executor.run(
        this.pythonExecutable,
        [script, "build", workDir],
        this.onboardingRoot,
        this.timeoutMs,
      );
      stdout += build.stdout;
      stderr += build.stderr;
      if (build.exitCode !== 0) {
        errorCode = build.timedOut ? "ONBOARDING_TIMEOUT" : "ONBOARDING_BUILD_FAILED";
        return;
      }

      let totalOutputBytes = 0;
      for (const filename of (await readdir(workDir)).sort()) {
        const descriptor = outputDescriptor(filename);
        if (!descriptor || descriptor.role === "inspection") continue;
        const path = join(workDir, filename);
        const info = await stat(path);
        if (!info.isFile()) continue;
        totalOutputBytes += info.size;
        if (totalOutputBytes > MAX_TOTAL_OUTPUT_BYTES) {
          throw new Error("ONBOARDING_OUTPUT_TOTAL_EXCEEDED");
        }
        await this.storeOutput(
          jobId,
          descriptor.role,
          filename,
          await readFile(path),
          descriptor.mimeType,
        );
      }

      const validation = await this.executor.run(
        this.pythonExecutable,
        [script, "validate", workDir],
        this.onboardingRoot,
        this.timeoutMs,
      );
      stdout += validation.stdout;
      stderr += validation.stderr;
      let report: { passed?: unknown };
      try {
        report = JSON.parse(validation.stdout) as { passed?: unknown };
      } catch {
        errorCode = "ONBOARDING_REPORT_INVALID";
        return;
      }
      const reportBytes = Buffer.from(JSON.stringify(report));
      const storedReport = await this.storeOutput(
        jobId,
        "validation_report",
        "validation-report.json",
        reportBytes,
        "application/json",
      );
      reportAssetId = storedReport.id;
      passed = validation.exitCode === 0 && report.passed === true;
      if (!passed) {
        errorCode = validation.timedOut ? "ONBOARDING_TIMEOUT" : "ONBOARDING_VALIDATION_FAILED";
      }
    } catch (error) {
      errorCode = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "ONBOARDING_EXECUTION_FAILED";
      stderr += error instanceof Error ? `\n${error.message}` : "\nUnknown execution error";
    } finally {
      await rm(workDir, { recursive: true, force: true });
      await this.repository.complete({
        jobId,
        status: passed ? "passed" : "failed",
        reportAssetId,
        errorCode: passed ? null : (errorCode ?? "ONBOARDING_EXECUTION_FAILED"),
        stdout: safeLog(stdout),
        stderr: safeLog(stderr),
        completedAt: this.clock(),
      });
      console.info(JSON.stringify({
        scope: "vortex-platform",
        event: passed ? "onboarding.job-completed" : "onboarding.job-failed",
        onboardingJobId: jobId,
        errorCode: passed ? null : errorCode,
        durationMs: Date.now() - started,
      }));
    }
  }
}
