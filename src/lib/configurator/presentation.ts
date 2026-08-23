import type { CameraPreset, ProductConfig } from "@/types/configurator";
import type { UnfoldPlan } from "@/types/unfold";
import { CARTONS } from "./carton-spec";
import { cartonUnfoldPlan } from "./unfold-plan";

/**
 * What a product can DO, as opposed to what it looks like.
 *
 * Presentation is resolved from the product's construction rather than from a
 * boolean on the config, so the UI never has to ask "is this a box?". A
 * product that cannot mechanically flatten simply does not report
 * `progressive-unfold`, and the control that would offer it never renders.
 */
export type ProductPresentation =
  /** Nothing articulates. Bottles, jars, pouches, labels. */
  | { mode: "static" }
  /** One meaningful articulation that does not reach a flat state. */
  | { mode: "open-close"; plan: UnfoldPlan }
  /** A dependency-ordered sequence that ends at the printed dieline. */
  | { mode: "progressive-unfold"; plan: UnfoldPlan }
  /**
   * The product declares articulation the runtime cannot drive yet. Reported
   * explicitly instead of silently degrading to "static", so an authored GLB
   * articulation that is not wired up is visible rather than invisible.
   */
  | { mode: "unsupported"; reason: string };

export function resolveProductPresentation(config: ProductConfig): ProductPresentation {
  if (config.presentation === "static") return { mode: "static" };

  if (config.family === "folded-carton") {
    const spec = CARTONS[config.cartonSpecId ?? ""];
    if (!spec) return { mode: "static" };
    const plan = cartonUnfoldPlan(spec);
    if (!plan || !plan.steps.length) return { mode: "static" };
    return plan.reachesFlat
      ? { mode: "progressive-unfold", plan }
      : { mode: "open-close", plan };
  }

  if (config.articulation) {
    return {
      mode: "unsupported",
      reason:
        `Product "${config.id}" declares "${config.articulation.mode}" articulation. ` +
        `Driving authored GLB node hinges is not implemented yet — an arbitrary ` +
        `GLB carries no structural information, so it cannot be unfolded without one.`,
    };
  }

  return { mode: "static" };
}

/** Convenience predicate for callers that only care whether a control shows. */
export function hasArticulation(presentation: ProductPresentation): boolean {
  return presentation.mode === "open-close" || presentation.mode === "progressive-unfold";
}

/** Vertical field of view used by the studio's 3D canvas, in degrees. */
const VIEWER_FOV_DEG = 32;

/**
 * Framing for the fully-unfolded pose: the blank seen from its PRINTED side.
 *
 * The flat carton is its dieline, so the camera should read it exactly the way
 * the 2D editor does. Because a carton printed on the outside is folded with
 * the sheet flipped over (see `toUv`), the printed side of the flattened blank
 * faces down — so this preset sits below the sheet looking up, which is what
 * makes the pose reproduce the editor canvas rather than its mirror image.
 *
 * We keep the PerspectiveCamera rather than swapping in an orthographic one:
 * OrbitControls' distance clamps, the hover-parallax rig and every authored
 * preset are all tuned for perspective, and at this distance the convergence
 * over a 40cm sheet is not what makes the pose legible — the square-on angle
 * is. A few degrees of tilt keeps OrbitControls off its polar limit
 * (`maxPolarAngle`, PI * 0.98) instead of gimbal-locking at true zenith.
 */
export function dielineCameraPreset(
  config: ProductConfig,
  dielineWidthMm: number,
  dielineHeightMm: number,
): CameraPreset {
  const halfExtent = (Math.max(dielineWidthMm, dielineHeightMm) * 0.01) / 2;
  const fitted = (halfExtent * 1.25) / Math.tan((VIEWER_FOV_DEG / 2) * (Math.PI / 180));
  const distance = Math.min(
    config.camera.maxDistance,
    Math.max(config.camera.minDistance, fitted),
  );
  // Comfortably inside OrbitControls' PI * 0.98 polar limit.
  const tilt = 0.09;
  const y = config.modelYOffset ?? 0;
  return {
    id: "dieline",
    label: "Dieline",
    position: [0, y - distance * Math.cos(tilt), -distance * Math.sin(tilt)],
    target: [0, y, 0],
  };
}

/** The product's default framing, used when returning from the flat pose. */
export function defaultCameraPreset(config: ProductConfig): CameraPreset {
  return {
    id: "initial",
    label: "Default",
    position: config.camera.initial,
    target: config.camera.target,
  };
}
