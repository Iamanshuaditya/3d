/**
 * Embeddable configurator contract (#27).
 *
 * A packaging manufacturer puts the customization experience on their own
 * website, so the configurator has to be a deliberate integration surface
 * rather than the internal Studio with its chrome hidden. Everything a client
 * can vary lives in this contract as data; nothing here justifies a fork.
 */

/** Presentation tokens applied as CSS custom properties inside the frame. */
export type EmbedTheme = {
  /** Primary action and selection colour. */
  accent: string;
  /** Page background behind the workspace. */
  surface: string;
  /** Raised panel background. */
  panel: string;
  /** Body text colour. */
  text: string;
  /** Secondary text colour. */
  dim: string;
  /** Hairline/border colour. */
  line: string;
  /** Corner radius for controls, in pixels. */
  radiusPx: number;
  /** Host-supplied font stack, or null to use the configurator's own. */
  fontFamily: string | null;
};

/**
 * Tools a client exposes to their customer. Everything defaults off in the
 * resolver, so a new capability is never switched on for existing clients by
 * the act of shipping it.
 */
export type EmbedFeatures = {
  text: boolean;
  uploads: boolean;
  background: boolean;
  adjust: boolean;
  /** Live 3D preview alongside the 2D editor. */
  preview3d: boolean;
  /** Flat/folded structural control where the construction supports it. */
  unfold: boolean;
  /** Lets the customer download the print-ready artifact themselves. */
  downloadArtifact: boolean;
};

/** What finishing the design means on this client's site. */
export type EmbedCompletionMode = "save" | "quote" | "inquiry";

export type EmbedCompletion = {
  mode: EmbedCompletionMode;
  /** Wording of the completion button, e.g. "Request a quote". */
  ctaLabel: string;
  /** Sentence shown once the host has been notified. */
  confirmationText: string;
};

export type EmbedClient = {
  id: string;
  name: string;
  status: "active" | "disabled";
  /**
   * Exact origins permitted to frame this client's configurator.
   *
   * Exact matches only. A wildcard here would let any subdomain — including one
   * an attacker controls — frame a client's session, so the type does not
   * offer the option.
   */
  allowedOrigins: string[];
  /** The catalogue subset this client's customers may configure. */
  productIds: string[];
  theme: EmbedTheme;
  features: EmbedFeatures;
  completion: EmbedCompletion;
};

/** The resolved, safe-to-serialize configuration handed to the embed frame. */
export type ResolvedEmbedConfig = {
  clientId: string;
  clientName: string;
  productId: string;
  hostOrigin: string;
  theme: EmbedTheme;
  features: EmbedFeatures;
  completion: EmbedCompletion;
};

export type EmbedRejectionCode =
  | "UNKNOWN_CLIENT"
  | "CLIENT_DISABLED"
  | "ORIGIN_NOT_ALLOWED"
  | "PRODUCT_NOT_ENABLED"
  | "MISSING_HOST_ORIGIN";

export class EmbedRejection extends Error {
  constructor(
    readonly code: EmbedRejectionCode,
    message: string,
  ) {
    super(message);
    this.name = "EmbedRejection";
  }
}

export interface EmbedClientReader {
  find(clientId: string): EmbedClient | null;
  list(): EmbedClient[];
}
