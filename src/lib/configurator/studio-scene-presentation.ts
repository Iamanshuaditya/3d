import type { ProductConfig } from "@/types/configurator";

export type StudioLightingProfile = "clear-film" | "fabric" | "kraft" | "print-studio";

export type StudioScenePresentation = Readonly<{
  background: string;
  ground: string;
  lighting: StudioLightingProfile;
  toneMapping: "none" | "aces";
  exposure: number;
  environment: boolean;
  framePadding: number;
  shadowOpacity: number;
  shadowBlur: number;
}>;

const PRESENTATIONS: Record<StudioLightingProfile, StudioScenePresentation> = {
  "clear-film": Object.freeze({
    background: "#737d8d",
    ground: "#626c7b",
    lighting: "clear-film",
    toneMapping: "none",
    exposure: 1,
    environment: false,
    framePadding: 1.14,
    shadowOpacity: 0.34,
    shadowBlur: 2.8,
  }),
  fabric: Object.freeze({
    background: "#77808e",
    ground: "#68717e",
    lighting: "fabric",
    toneMapping: "aces",
    exposure: 0.72,
    environment: true,
    framePadding: 1.16,
    shadowOpacity: 0.3,
    shadowBlur: 3.2,
  }),
  kraft: Object.freeze({
    // Unbleached board sits at almost exactly the luminance of the neutral
    // print-studio grey, so on that background a kraft product loses its
    // silhouette even though the hues differ. A deeper, cooler slate restores
    // the edge without touching the board's own colour.
    background: "#454c56",
    ground: "#3b414a",
    lighting: "kraft",
    toneMapping: "aces",
    exposure: 1.04,
    environment: true,
    framePadding: 1.14,
    shadowOpacity: 0.38,
    shadowBlur: 3,
  }),
  "print-studio": Object.freeze({
    // A middle-value cool grey keeps both white stock and near-black artwork
    // legible. Contrast is created outside the product material, so customer
    // colours are never tinted to solve a silhouette problem.
    background: "#8a94a3",
    ground: "#77818f",
    lighting: "print-studio",
    toneMapping: "aces",
    exposure: 1,
    environment: true,
    framePadding: 1.14,
    shadowOpacity: 0.32,
    shadowBlur: 3,
  }),
};

/** Presentation-only defaults. Product geometry and artwork never enter them. */
export function resolveStudioScenePresentation(
  config: Pick<ProductConfig, "materialProfile">,
): StudioScenePresentation {
  if (config.materialProfile === "clear-barrier-gloss") {
    return PRESENTATIONS["clear-film"];
  }
  if (config.materialProfile === "cotton-fabric") {
    return PRESENTATIONS.fabric;
  }
  if (
    config.materialProfile === "kraft-corrugated" ||
    config.materialProfile === "kraft-cardstock"
  ) {
    return PRESENTATIONS.kraft;
  }
  return PRESENTATIONS["print-studio"];
}

export function frameDistanceForSphere(input: Readonly<{
  radius: number;
  verticalFovDeg: number;
  aspect: number;
  padding: number;
  minDistance: number;
  maxDistance: number;
}>): number {
  const vertical = (input.verticalFovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(input.aspect, 1e-6));
  const limitingFov = Math.min(vertical, horizontal);
  const rawDistance = (Math.max(0, input.radius) * input.padding) /
    Math.max(Math.sin(limitingFov / 2), 1e-6);
  return Math.min(input.maxDistance, Math.max(input.minDistance, rawDistance));
}

/** Ignores mesh/animation noise while still detecting a real pose-size change. */
export function shouldRefitExtent(
  previousRadius: number | null,
  nextRadius: number,
  relativeThreshold = 0.05,
): boolean {
  if (!Number.isFinite(nextRadius) || nextRadius <= 0) return false;
  if (previousRadius === null || previousRadius <= 0) return true;
  return Math.abs(nextRadius - previousRadius) / previousRadius > relativeThreshold;
}

