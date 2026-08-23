import assert from "node:assert/strict";
import { readFile, rm, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { ProductOperator } from "@/platform/products/drafts";
import { ValidationError } from "@/platform/projects/errors";
import { openVortexDatabase } from "@/server/persistence/database";
import {
  OnboardingRunner,
  SpawnCommandExecutor,
  type CommandResult,
  type OnboardingCommandExecutor,
} from "@/server/onboarding/onboarding-runner";
import { MAX_GLB_BYTES, OnboardingService } from "@/server/onboarding/onboarding-service";
import { SqliteOnboardingJobRepository } from "@/server/onboarding/sqlite-onboarding-job-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";

const operator: ProductOperator = {
  id: "operator.onboarding",
  permissions: ["onboarding:run"],
};

async function fixture(
  t: TestContext,
  executor: OnboardingCommandExecutor,
  maxConcurrent = 0,
) {
  const directory = await mkdtemp(join(tmpdir(), "vortex-onboarding-test-"));
  const database = openVortexDatabase(":memory:");
  const repository = new SqliteOnboardingJobRepository(database);
  const objectStore = new FilesystemObjectStore(join(directory, "objects"));
  const onboardingRoot = join(process.cwd(), "product-onboarding");
  const runner = new OnboardingRunner(
    repository,
    objectStore,
    join(directory, "work"),
    onboardingRoot,
    executor,
    join(onboardingRoot, ".venv", "bin", "python"),
    120_000,
    maxConcurrent,
  );
  const service = new OnboardingService(
    repository,
    objectStore,
    runner,
    onboardingRoot,
  );
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, repository, objectStore, runner, service };
}

class FailedInspection implements OnboardingCommandExecutor {
  async run(): Promise<CommandResult> {
    return { exitCode: 1, stdout: "", stderr: "bad model", timedOut: false };
  }
}

class ValidationFailure implements OnboardingCommandExecutor {
  async run(_executable: string, args: string[]): Promise<CommandResult> {
    const command = args[1];
    const workDir = args[2];
    if (command === "inspect") {
      await writeFile(join(workDir, "inspection.json"), JSON.stringify({ meshes: [] }));
      return { exitCode: 0, stdout: "inspection", stderr: "", timedOut: false };
    }
    if (command === "build") {
      await writeFile(join(workDir, "product-customizable.glb"), Buffer.from("built"));
      await writeFile(join(workDir, "product.json"), "{}");
      await writeFile(join(workDir, "regions.json"), "{}");
      return { exitCode: 0, stdout: "build", stderr: "", timedOut: false };
    }
    return {
      exitCode: 2,
      stdout: JSON.stringify({ passed: false, issues: ["chirality"] }),
      stderr: "",
      timedOut: false,
    };
  }
}

function minimalFramedGlb() {
  const bytes = Buffer.alloc(12);
  bytes.write("glTF", 0, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.byteLength, 8);
  return bytes;
}

test("a real checked-in GLB runs through inspect, build, validate, and durable outputs", async (t) => {
  const { directory, runner, service } = await fixture(t, new SpawnCommandExecutor());
  const productDir = join(process.cwd(), "product-onboarding", "products", "tshirt");
  const job = await service.create(operator, {
    productId: "onboarding-tshirt-fixture",
    glb: await readFile(join(productDir, "source.glb")),
    manifest: await readFile(join(productDir, "manifest.json")),
  });
  await runner.run(job.id);

  const completed = await service.get(job.id);
  assert.equal(completed.job.status, "passed");
  assert.equal(completed.job.errorCode, null);
  assert.ok(completed.job.reportAssetId);
  assert.ok(completed.assets.some((asset) => asset.role === "inspection"));
  assert.ok(completed.assets.some((asset) => asset.role === "validation_report"));
  assert.ok(completed.assets.some((asset) => asset.role === "product_glb"));
  const report = await service.readOutput(job.id, completed.job.reportAssetId!);
  assert.equal(JSON.parse(Buffer.from(report.bytes).toString("utf8")).passed, true);
  await assert.rejects(
    () => readFile(join(directory, "work", job.id, "source.glb")),
    /ENOENT/,
    "per-job working files are cleaned",
  );
});

test("invalid and oversized GLBs fail before a job or subprocess is created", async (t) => {
  const { repository, service } = await fixture(t, new FailedInspection());
  await assert.rejects(
    () => service.create(operator, { productId: "bad-glb", glb: Buffer.from("not a glb") }),
    (error) => error instanceof ValidationError && error.code === "GLB_SIZE_INVALID",
  );
  await assert.rejects(
    () => service.create(operator, {
      productId: "huge-glb",
      glb: new Uint8Array(MAX_GLB_BYTES + 1),
    }),
    (error) => error instanceof ValidationError && error.code === "GLB_SIZE_INVALID",
  );
  assert.equal(await repository.find("does-not-exist"), null);
});

test("subprocess and validation failures remain visible with persisted reports", async (t) => {
  const inspectionFixture = await fixture(t, new FailedInspection());
  const failed = await inspectionFixture.service.create(operator, {
    productId: "inspection-failure",
    glb: minimalFramedGlb(),
  });
  await inspectionFixture.runner.run(failed.id);
  assert.equal((await inspectionFixture.service.get(failed.id)).job.errorCode, "ONBOARDING_INSPECTION_FAILED");

  const validationFixture = await fixture(t, new ValidationFailure());
  const validation = await validationFixture.service.create(operator, {
    productId: "validation-failure",
    glb: minimalFramedGlb(),
    manifest: Buffer.from(JSON.stringify({
      id: "ignored",
      source: "../../unsafe.glb",
      physical: {},
      regions: [],
    })),
  });
  await validationFixture.runner.run(validation.id);
  const result = await validationFixture.service.get(validation.id);
  assert.equal(result.job.status, "failed");
  assert.equal(result.job.errorCode, "ONBOARDING_VALIDATION_FAILED");
  assert.ok(result.job.reportAssetId);
  const report = await validationFixture.service.readOutput(validation.id, result.job.reportAssetId!);
  assert.equal(JSON.parse(Buffer.from(report.bytes).toString("utf8")).passed, false);
  assert.ok(result.assets.every((asset) => !asset.storageKey.includes("..")));
});
