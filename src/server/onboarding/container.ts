import { join } from "node:path";
import { getVortexDatabase } from "@/server/persistence/database";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import { OnboardingRunner } from "./onboarding-runner";
import { OnboardingService } from "./onboarding-service";
import { SqliteOnboardingJobRepository } from "./sqlite-onboarding-job-repository";

let singleton: OnboardingService | null = null;

export function getOnboardingService() {
  if (singleton) return singleton;
  const dataRoot = process.env.VORTEX_DATA_DIR || join(process.cwd(), ".data");
  const onboardingRoot = join(process.cwd(), "product-onboarding");
  const repository = new SqliteOnboardingJobRepository(getVortexDatabase());
  const objectStore = new FilesystemObjectStore(join(dataRoot, "objects"));
  const runner = new OnboardingRunner(
    repository,
    objectStore,
    join(dataRoot, "onboarding-work"),
    onboardingRoot,
  );
  singleton = new OnboardingService(
    repository,
    objectStore,
    runner,
    onboardingRoot,
  );
  return singleton;
}
