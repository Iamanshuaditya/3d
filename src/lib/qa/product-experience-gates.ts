import type { ProductExperienceDiagnostics } from "./product-experience-diagnostics";

export type ProductExperienceGateId =
  | "surfaceScaleIsotropic"
  | "surfacePhysicallySized"
  | "webWrapTilesWithoutGap"
  | "frontFaceNotMirrored"
  | "backFaceMirrored"
  | "cutGuidePresent"
  | "printableGuidesResolvedOrDeclaredUnresolved"
  | "previewOccupancyInRange"
  | "productSeparatedFromBackground"
  | "noGuideLeakInExport";

export type ProductExperienceFailure = Readonly<{
  gate: ProductExperienceGateId;
  productId: string;
  detail: string;
}>;

/**
 * Thresholds are calibrated against the current fixture set rather than picked
 * for roundness. Each one sits far enough from every passing fixture to avoid
 * flapping, and close enough to fail the regression it exists to catch.
 */
export const PRODUCT_EXPERIENCE_THRESHOLDS = Object.freeze({
  /** Editor pixels per mm may differ between axes by at most this fraction. */
  scaleAnisotropy: 0.005,
  /** Below this the product reads as tiny in the preview. */
  minimumPreviewOccupancy: 0.35,
  /** Above this the product is clipped or crowds the frame. */
  maximumPreviewOccupancy: 0.95,
  /** WCAG contrast ratio between substrate and preview background. */
  minimumSilhouetteContrast: 1.5,
});

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. Returns null for a colour it cannot parse. */
export function relativeLuminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!match) return null;
  const digits = match[1].length === 3
    ? match[1].split("").map((d) => d + d).join("")
    : match[1];
  const red = channel(Number.parseInt(digits.slice(0, 2), 16));
  const green = channel(Number.parseInt(digits.slice(2, 4), 16));
  const blue = channel(Number.parseInt(digits.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(a: string, b: string): number | null {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first === null || second === null) return null;
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Objective gates over one product's diagnostics. Every failure here is a hard
 * failure: it describes measurable geometry, mapping or presentation drift, not
 * a matter of taste. Subjective quality stays out of this function entirely.
 */
export function evaluateProductExperience(
  diagnostics: ProductExperienceDiagnostics,
): readonly ProductExperienceFailure[] {
  const failures: ProductExperienceFailure[] = [];
  const productId = diagnostics.productId;
  const fail = (gate: ProductExperienceGateId, detail: string) =>
    failures.push({ gate, productId, detail });

  const { surface, preview } = diagnostics;

  if (
    !(surface.physicalWidthMm > 0) ||
    !(surface.physicalHeightMm > 0) ||
    !(surface.editorWidth > 0) ||
    !(surface.editorHeight > 0)
  ) {
    fail(
      "surfacePhysicallySized",
      `surface ${surface.id} has a non-positive dimension: ` +
        `${surface.editorWidth}x${surface.editorHeight}px, ` +
        `${surface.physicalWidthMm}x${surface.physicalHeightMm}mm`,
    );
  } else {
    const anisotropy =
      Math.abs(surface.pxPerMmX - surface.pxPerMmY) /
      Math.max(surface.pxPerMmX, surface.pxPerMmY);
    if (anisotropy > PRODUCT_EXPERIENCE_THRESHOLDS.scaleAnisotropy) {
      fail(
        "surfaceScaleIsotropic",
        `surface ${surface.id} scales ${surface.pxPerMmX.toFixed(4)} px/mm across ` +
          `and ${surface.pxPerMmY.toFixed(4)} px/mm down (${(anisotropy * 100).toFixed(2)}% apart), ` +
          "so artwork is stretched between the editor and print",
      );
    }
  }

  if (diagnostics.webColumns) {
    const columns = diagnostics.webColumns;
    const front = columns.find((column) => column.id === "front");
    const back = columns.find((column) => column.id === "back");
    if (!front) fail("frontFaceNotMirrored", "printed web declares no front column");
    else if (front.mirrored) {
      fail("frontFaceNotMirrored", "front column is mirrored, so front artwork reads reversed");
    }
    if (!back) fail("backFaceMirrored", "printed web declares no back column");
    else if (!back.mirrored) {
      fail(
        "backFaceMirrored",
        "back column is not mirrored, so the wrap reads reversed from outside",
      );
    }
    for (let index = 1; index < columns.length; index += 1) {
      const previous = columns[index - 1];
      const current = columns[index];
      const expected = previous.startMm + previous.widthMm;
      if (Math.abs(current.startMm - expected) > 1e-6) {
        fail(
          "webWrapTilesWithoutGap",
          `column ${current.id} starts at ${current.startMm}mm but ${previous.id} ends at ` +
            `${expected}mm, leaving a ${(current.startMm - expected).toFixed(3)}mm ` +
            "gap or overlap in the printed wrap",
        );
      }
    }
  }

  if (!diagnostics.guideClasses.includes("cut")) {
    fail("cutGuidePresent", "no cut/trim guide is presented, so the trim edge is invisible");
  }

  const hasBleed = diagnostics.guideClasses.includes("bleed");
  const hasSafe = diagnostics.guideClasses.includes("safe");
  const declaresUnresolved = diagnostics.unresolvedReferenceCount > 0;
  if (!(hasBleed && hasSafe) && !declaresUnresolved) {
    fail(
      "printableGuidesResolvedOrDeclaredUnresolved",
      `surface ${surface.id} presents neither a complete bleed/safe pair ` +
        `(bleed=${hasBleed}, safe=${hasSafe}) nor any unresolved source reference. ` +
        "A surface must either resolve its printable limits or declare them unresolved; " +
        "silently omitting them lets a customer place artwork against limits that were guessed",
    );
  }

  // A null preview means no headless geometry exists for this family, so
  // framing is measured in the browser lane instead. `measuresFraming` on the
  // report records that, so an unmeasured product never reads as a pass.
  if (preview !== null) {
    const percent = (preview.occupancy * 100).toFixed(1);
    const clampNote = preview.distanceClamped
      ? ` — framing was clamped by the product's own distance limits ` +
        `(${preview.minDistance.toFixed(2)}..${preview.maxDistance.toFixed(2)}), ` +
        `which asked for ${preview.unclampedDistance.toFixed(2)}`
      : "";
    if (preview.occupancy < PRODUCT_EXPERIENCE_THRESHOLDS.minimumPreviewOccupancy) {
      fail(
        "previewOccupancyInRange",
        `product fills ${percent}% of the limiting viewport axis, below the ` +
          `${(PRODUCT_EXPERIENCE_THRESHOLDS.minimumPreviewOccupancy * 100).toFixed(0)}% floor` +
          clampNote,
      );
    } else if (preview.occupancy > PRODUCT_EXPERIENCE_THRESHOLDS.maximumPreviewOccupancy) {
      fail(
        "previewOccupancyInRange",
        `product fills ${percent}% of the limiting viewport axis, above the ` +
          `${(PRODUCT_EXPERIENCE_THRESHOLDS.maximumPreviewOccupancy * 100).toFixed(0)}% ceiling` +
          clampNote,
      );
    }
  }

  const contrast = contrastRatio(surface.substrate, diagnostics.background);
  if (contrast === null) {
    fail(
      "productSeparatedFromBackground",
      `cannot compare substrate ${surface.substrate} with background ${diagnostics.background}`,
    );
  } else if (contrast < PRODUCT_EXPERIENCE_THRESHOLDS.minimumSilhouetteContrast) {
    fail(
      "productSeparatedFromBackground",
      `substrate ${surface.substrate} against background ${diagnostics.background} gives a ` +
        `${contrast.toFixed(2)}:1 contrast ratio, below the ` +
        `${PRODUCT_EXPERIENCE_THRESHOLDS.minimumSilhouetteContrast}:1 floor, so the ` +
        "product edge disappears into the preview",
    );
  }

  return failures;
}

/**
 * Proves UI chrome cannot reach printed output. The caller renders the same
 * design twice — once with the surface's dieline guides attached, once with
 * them removed — and passes the two digests. Identical bytes mean the renderer
 * never consulted the guides.
 */
export function evaluateExportGuideLeak(input: {
  productId: string;
  withGuidesDigest: string;
  withoutGuidesDigest: string;
}): readonly ProductExperienceFailure[] {
  if (input.withGuidesDigest === input.withoutGuidesDigest) return [];
  return [
    {
      gate: "noGuideLeakInExport",
      productId: input.productId,
      detail:
        "production artwork changed when dieline guides were attached to the surface " +
        `(${input.withGuidesDigest.slice(0, 12)} vs ${input.withoutGuidesDigest.slice(0, 12)}), ` +
        "so UI guide geometry is reaching the printed output",
    },
  ];
}
