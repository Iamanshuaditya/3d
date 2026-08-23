import type { OnboardingAsset, OnboardingJob } from "@/platform/onboarding/types";

export function onboardingJobAdminDto(job: OnboardingJob, assets: OnboardingAsset[]) {
  return {
    id: job.id,
    operatorId: job.operatorId,
    productId: job.productId,
    draftId: job.draftId,
    status: job.status,
    inputAssetId: job.inputAssetId,
    manifestAssetId: job.manifestAssetId,
    commandVersion: job.commandVersion,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    reportAssetId: job.reportAssetId,
    errorCode: job.errorCode,
    createdAt: job.createdAt,
    outputs: assets
      .filter((asset) => !asset.role.startsWith("input_"))
      .map((asset) => ({
        id: asset.id,
        role: asset.role,
        filename: asset.filename,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        sha256: asset.sha256,
        contentUrl: `/api/v1/admin/onboarding/jobs/${encodeURIComponent(job.id)}/assets/${encodeURIComponent(asset.id)}/content`,
      })),
  };
}
