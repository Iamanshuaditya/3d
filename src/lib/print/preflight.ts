import type { ImageElement } from "@/types/configurator";
import type {
  NormalizedPrintJob,
  PreflightIssue,
  PreflightReport,
} from "./types";
import { pixelsForMm } from "./physical-resolution";

const MM_PER_INCH = 25.4;

export type EffectivePpi = { x: number; y: number; minimum: number };
export type ImageQualityState = "good" | "warning" | "poor" | "unknown";

export function imageQualityState(
  ppi: EffectivePpi | null,
  minimumPpi: number,
  warningPpi: number,
): ImageQualityState {
  if (!ppi) return "unknown";
  if (ppi.minimum < minimumPpi) return "poor";
  if (ppi.minimum < warningPpi) return "warning";
  return "good";
}

/**
 * Calculates resolution after scale and rotation in physical space. This is
 * deliberately independent of screen/editor resolution.
 */
export function effectiveImagePpi(
  image: ImageElement,
  editorWidth: number,
  editorHeight: number,
  physicalWidthMm: number,
  physicalHeightMm: number,
): EffectivePpi | null {
  if (!image.sourcePixelWidth || !image.sourcePixelHeight) return null;

  const mmPerEditorX = physicalWidthMm / editorWidth;
  const mmPerEditorY = physicalHeightMm / editorHeight;
  const radians = (image.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const placedWidth = Math.abs(image.width * image.scaleX);
  const placedHeight = Math.abs(image.height * image.scaleY);

  const widthMm = Math.hypot(
    placedWidth * cos * mmPerEditorX,
    placedWidth * sin * mmPerEditorY,
  );
  const heightMm = Math.hypot(
    placedHeight * sin * mmPerEditorX,
    placedHeight * cos * mmPerEditorY,
  );

  if (widthMm <= 0 || heightMm <= 0) return null;
  const sourceWidth = image.sourcePixelWidth * (image.crop?.width ?? 1);
  const sourceHeight = image.sourcePixelHeight * (image.crop?.height ?? 1);
  const x = sourceWidth / (widthMm / MM_PER_INCH);
  const y = sourceHeight / (heightMm / MM_PER_INCH);
  return { x, y, minimum: Math.min(x, y) };
}

function issue(
  issues: PreflightIssue[],
  value: Omit<PreflightIssue, "severity"> & { severity: PreflightIssue["severity"] },
) {
  issues.push(value);
}

export function preflightPrintJob(
  job: NormalizedPrintJob,
  createdAt = new Date().toISOString(),
): PreflightReport {
  const issues: PreflightIssue[] = [];
  const checks: PreflightReport["checks"] = [];

  const identityMatches = job.design.productId === job.product.id;
  checks.push({
    name: "Design/product identity",
    passed: identityMatches,
    detail: identityMatches
      ? `Design belongs to ${job.product.id}.`
      : `Design belongs to ${job.design.productId}, not ${job.product.id}.`,
  });
  if (!identityMatches) {
    issue(issues, {
      code: "PRODUCT_MISMATCH",
      severity: "error",
      message: "The design document does not belong to the selected product.",
    });
  }

  let pageGeometryOk = true;
  let dielinesOk = true;
  let rasterBudgetOk = true;
  let imageResolutionOk = true;
  let imageMetadataOk = true;
  let bleedOk = true;
  let artworkTreatmentsOk = true;

  for (const entry of job.surfaces) {
    const { surface, design, dieline } = entry;
    const physicalWidthMm = surface.physicalWidthCm * 10;
    const physicalHeightMm = surface.physicalHeightCm * 10;
    if (
      !Number.isFinite(physicalWidthMm) ||
      !Number.isFinite(physicalHeightMm) ||
      physicalWidthMm <= 0 ||
      physicalHeightMm <= 0 ||
      surface.editorWidth <= 0 ||
      surface.editorHeight <= 0
    ) {
      pageGeometryOk = false;
      issue(issues, {
        code: "INVALID_PAGE_GEOMETRY",
        severity: "error",
        surfaceId: surface.id,
        message: `${surface.label} has invalid physical or editor dimensions.`,
      });
    }

    if (!dieline.cuts.length) {
      dielinesOk = false;
      issue(issues, {
        code: "MISSING_CUT_PATH",
        severity: "error",
        surfaceId: surface.id,
        message: `${surface.label} has no production cut/trim path.`,
      });
    }

    if (job.profile.minimumBleedMm > 0) {
      const guide = surface.guides?.bleed;
      const bleedMm = guide
        ? Math.min(
            (guide / surface.editorWidth) * physicalWidthMm,
            (guide / surface.editorHeight) * physicalHeightMm,
          )
        : 0;
      if (bleedMm + 0.01 < job.profile.minimumBleedMm) {
        bleedOk = false;
        issue(issues, {
          code: "INSUFFICIENT_BLEED",
          severity: "error",
          surfaceId: surface.id,
          message: `${surface.label} has ${bleedMm.toFixed(2)} mm bleed; ${job.profile.minimumBleedMm.toFixed(2)} mm is required.`,
        });
      }
    }

    const rasterWidth = pixelsForMm(physicalWidthMm, job.profile.renderPpi);
    const rasterHeight = pixelsForMm(physicalHeightMm, job.profile.renderPpi);
    if (rasterWidth * rasterHeight > job.profile.maximumRasterPixels) {
      rasterBudgetOk = false;
      issue(issues, {
        code: "RASTER_BUDGET_EXCEEDED",
        severity: "error",
        surfaceId: surface.id,
        message: `${surface.label} requires ${rasterWidth}×${rasterHeight}px at ${job.profile.renderPpi} PPI, above this profile's memory limit.`,
      });
    }

    for (const element of design.elements) {
      if (element.type !== "image") continue;
      if (element.treatment?.mode === "embroidery") {
        artworkTreatmentsOk = false;
        issue(issues, {
          code: "EMBROIDERY_PRODUCTION_UNSUPPORTED",
          severity: "error",
          surfaceId: surface.id,
          elementId: element.id,
          message: `${element.sourceName ?? element.id} uses visual embroidery preview settings. Vortex does not yet generate machine-ready embroidery files.`,
        });
      }
      const ppi = effectiveImagePpi(
        element,
        surface.editorWidth,
        surface.editorHeight,
        physicalWidthMm,
        physicalHeightMm,
      );
      if (!ppi) {
        imageMetadataOk = false;
        issue(issues, {
          code: "IMAGE_DIMENSIONS_UNKNOWN",
          severity: "error",
          surfaceId: surface.id,
          elementId: element.id,
          message: `${element.sourceName ?? element.id} has no original pixel dimensions, so print resolution cannot be certified.`,
        });
        continue;
      }
      if (ppi.minimum < job.profile.minimumImagePpi) {
        imageResolutionOk = false;
        issue(issues, {
          code: "IMAGE_PPI_TOO_LOW",
          severity: "error",
          surfaceId: surface.id,
          elementId: element.id,
          message: `${element.sourceName ?? element.id} is ${Math.floor(ppi.minimum)} PPI at placed size; minimum is ${job.profile.minimumImagePpi} PPI.`,
        });
      } else if (ppi.minimum < job.profile.warningImagePpi) {
        issue(issues, {
          code: "IMAGE_PPI_WARNING",
          severity: "warning",
          surfaceId: surface.id,
          elementId: element.id,
          message: `${element.sourceName ?? element.id} is ${Math.floor(ppi.minimum)} PPI; ${job.profile.warningImagePpi} PPI is recommended.`,
        });
      }
    }
  }

  checks.push(
    {
      name: "Physical page geometry",
      passed: pageGeometryOk,
      detail: pageGeometryOk ? "All surfaces have exact positive physical dimensions." : "One or more surfaces has invalid dimensions.",
    },
    {
      name: "Manufacturing paths",
      passed: dielinesOk,
      detail: dielinesOk ? "Every surface has a cut/trim path." : "A cut/trim path is missing.",
    },
    {
      name: "Minimum bleed",
      passed: bleedOk,
      detail: bleedOk
        ? `All surfaces meet the ${job.profile.minimumBleedMm.toFixed(2)} mm profile requirement.`
        : "A surface has insufficient bleed.",
    },
    {
      name: "300 PPI render budget",
      passed: rasterBudgetOk,
      detail: rasterBudgetOk ? "All surfaces fit the production raster budget." : "A surface exceeds the raster budget.",
    },
    {
      name: "Original image metadata",
      passed: imageMetadataOk,
      detail: imageMetadataOk ? "All placed images retain source dimensions." : "An image cannot be resolution-checked.",
    },
    {
      name: "Effective image resolution",
      passed: imageResolutionOk,
      detail: imageResolutionOk ? `All images meet ${job.profile.minimumImagePpi} PPI minimum.` : "An image is below the minimum effective PPI.",
    },
    {
      name: "Production artwork treatments",
      passed: artworkTreatmentsOk,
      detail: artworkTreatmentsOk
        ? "Every artwork treatment has a supported production representation."
        : "Visual embroidery preview cannot be emitted as machine embroidery production data.",
    },
    {
      name: "Color-managed output",
      passed: true,
      detail: `${job.profile.standard} with ${job.profile.outputConditionIdentifier} ${job.profile.outputIcc.alternate} output intent${job.profile.maximumTotalAreaCoveragePercent ? ` (${job.profile.maximumTotalAreaCoveragePercent}% TAC profile)` : ""}.`,
    },
  );

  if (job.profile.approval === "generic") {
    issue(issues, {
      code: "FACTORY_PROFILE_APPROVAL_REQUIRED",
      severity: "warning",
      message: `${job.profile.label} is a generic color-managed handoff. The receiving factory must approve it or supply its press/substrate profile before unattended production.`,
    });
  } else if (job.profile.approval === "simulated-company") {
    issue(issues, {
      code: "SIMULATED_CONVERTER_PROFILE",
      severity: "warning",
      message: `${job.profile.label} models a converter contract but is not approval from an external factory. Approve a physical proof before marking it factory-approved.`,
    });
  }

  return {
    engine: "Vortex Print Engine",
    engineVersion: "1.0",
    profileId: job.profile.id,
    standard: job.profile.standard,
    createdAt,
    passed: !issues.some((candidate) => candidate.severity === "error"),
    issues,
    checks,
  };
}
