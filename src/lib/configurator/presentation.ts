import type { ProductConfig } from "@/types/configurator";
import type { UnfoldPlan } from "@/types/unfold";
import { resolveCartonSpec } from "./carton-spec";
import { cartonUnfoldPlan } from "./unfold-plan";
import { glbUnfoldPlan } from "./glb-articulation";

/**
 * What a product can DO, as opposed to what it looks like.
 *
 * Presentation is resolved from the product's construction rather than from a
 * boolean on the config, so the UI never has to ask "is this a box?". A
 * product that cannot mechanically flatten simply does not report
 * `progressive-unfold`, and the control that would offer it never renders.
 *
 * Camera state is deliberately absent from this contract. Folding changes
 * structural pose only; orbit, target, distance and FOV remain independent
 * presentation state controlled by the user or an explicit camera action.
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
    const spec = resolveCartonSpec(config);
    if (!spec) return { mode: "static" };
    return classify(cartonUnfoldPlan(spec));
  }

  if (config.articulation) {
    if (config.articulation.mode !== "glb-nodes") {
      return {
        mode: "unsupported",
        reason:
          `Product "${config.id}" declares "${config.articulation.mode}" articulation, ` +
          `which has no runtime driver.`,
      };
    }
    return classify(glbUnfoldPlan(config.articulation));
  }

  return { mode: "static" };
}

/**
 * A plan becomes a toggle only when there is genuinely one thing to toggle.
 * Anything with more than one stage gets the stepped control, whether or not
 * it ends flat — a hinged case that opens and then folds out an easel has two
 * meaningful stages and should say so.
 */
function classify(plan: UnfoldPlan | null): ProductPresentation {
  if (!plan || !plan.steps.length) return { mode: "static" };
  if (plan.steps.length === 1 && !plan.reachesFlat) return { mode: "open-close", plan };
  return { mode: "progressive-unfold", plan };
}

/** Convenience predicate for callers that only care whether a control shows. */
export function hasArticulation(presentation: ProductPresentation): boolean {
  return presentation.mode === "open-close" || presentation.mode === "progressive-unfold";
}
