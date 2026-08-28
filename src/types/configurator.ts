import type { GlbArticulationSpec } from "./unfold";
import type { ArtworkRenderMode, ArtworkTreatment } from "./embroidery";
import type { CartonSpec } from "./carton";
import type { ProvenanceLedger } from "./provenance";

/**
 * Core contracts for the product customization engine.
 *
 * The 2D design state is the source of truth. The 3D view is a live preview
 * driven by a CanvasTexture — never the other way around.
 */

export type ImageCrop = {
  /** Normalized source-image coordinates; the original asset remains untouched. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageElement = {
  id: string;
  type: "image";
  /**
   * Durable artwork identity. New project-backed documents always set this.
   * The server verifies that the asset belongs to the same project before a
   * revision is accepted.
   */
  assetId?: string;
  /**
   * Runtime locator used by browser image decoders. It may be an object URL
   * for a legacy/transient design or an authorized project-asset endpoint.
   * It is deliberately not the durable identity and may be omitted from a
   * stored DesignDocument.
   */
  src?: string;
  /** Original asset dimensions, retained for effective-PPI preflight. */
  sourcePixelWidth?: number;
  sourcePixelHeight?: number;
  sourceName?: string;
  sourceMimeType?: string;
  /** Optional non-destructive source window rendered into this element's frame. */
  crop?: ImageCrop;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  /** UI transform lock. It never changes printed pixels or geometry. */
  locked?: boolean;
  /**
   * How this artwork is reproduced on the product. Purely additive: the asset
   * above is never rewritten, so switching back to "print" restores the
   * original pixels exactly. Absent means print.
   */
  treatment?: ArtworkTreatment;
};

export type TextElement = {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  fill: string;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  /** UI transform lock. It never changes printed pixels or geometry. */
  locked?: boolean;
  /**
   * Optional semantic personalization source. Renderers still consume `text`;
   * this metadata lets the template/personalization layer update it without
   * parsing magic {{tokens}}. Manual Studio edits intentionally detach it.
   */
  binding?: {
    type: "field";
    key: string;
    fallback?: string;
  };
};

export type DesignElement = ImageElement | TextElement;

/** Design for a single printable surface. Order in `elements` is z-order. */
export type SurfaceDesign = {
  elements: DesignElement[];
  /** Optional flat backdrop painted behind all elements. `null` = transparent. */
  background: string | null;
};

export type DesignDocument = {
  productId: string;
  surfaces: Record<string, SurfaceDesign>;
  /** Structured values used to materialize bound elements, when applicable. */
  personalization?: PersonalizationData;
};

export type PersonalizationScalar = string | number | boolean | null;
export type PersonalizationData = {
  [key: string]: PersonalizationScalar | PersonalizationData;
};

/** Optional print-production guides. Purely visual — never exported into artwork. */
export type SurfaceGuides = {
  /** Inset from each edge, in editor pixels. */
  bleed?: number;
  safeArea?: number;
};

/**
 * Physical print geometry for a rectangular sheet. Millimetres are the
 * authority; editor pixels are only a deterministic working coordinate space.
 */
export type RectangularPrintLayout = {
  unit: "mm";
  pxPerMm: number;
  trimBoxMm: { x: number; y: number; width: number; height: number };
  safeAreaBoxMm: { x: number; y: number; width: number; height: number };
  showCenterGuides?: boolean;
};

/**
 * A named production panel within one continuous print web. The measurements
 * come from the printer's panel-section metadata, not from visual guesswork.
 */
export type EditableSection = {
  id: string;
  label: string;
  /** GLB mesh receiving this part of the shared artwork texture. */
  meshName: string;
  /** Panel bounds inside the print web, in centimetres. */
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  /** Printer-authored orientation for newly placed panel content. */
  contentRotation: number;
  /**
   * Optional print-only transform. This lets the editor keep artwork upright
   * while the horizontal production web receives the quarter-turn required by
   * the physical panel UVs.
   */
  textureRotation?: number;
};

/** One polyline of a dieline overlay, in editor pixels. */
export type DielinePath = { points: number[]; closed: boolean };

export type DielineRegion = {
  id: string;
  label: string;
  role: "artwork" | "technical" | "source-reference";
  x: number;
  y: number;
  width: number;
  height: number;
  artworkOrientationDeg?: 0 | 180;
};

export type DielineReference = {
  id: string;
  label: string;
  points: number[];
};

/**
 * Data-driven dieline overlay for a surface (cut outlines, crease/fold lines,
 * safety outlines). Generated by the product-onboarding pipeline from the
 * region meshes' true UV boundaries — takes precedence over spec-derived
 * overlays so arbitrary onboarded products get production guides without
 * product-specific code.
 */
export type SurfaceDieline = {
  cuts: DielinePath[];
  creases: DielinePath[];
  /** Exact bleed-limit geometry, kept separate from safe-area geometry. */
  bleed?: DielinePath[];
  safety?: DielinePath[];
  /** Seals, no-print bands, centrelines, and other non-cut technical marks. */
  technical?: DielinePath[];
  /** Editor-only measured regions; never emitted by artwork renderers. */
  regions?: DielineRegion[];
  /** Editor-only source references with intentionally unclassified meaning. */
  references?: DielineReference[];
};

/**
 * Customer-navigation meaning for a technical editable surface. A page is a
 * view onto a surface, never a mesh and never a second copy of design state.
 * Continuous webs remain one surface even when several 3D panels consume it.
 */
export type EditableSurfacePresentation =
  | {
      kind: "page";
      pageNumber: number;
      side?: "front" | "back" | "inside" | "outside";
    }
  | { kind: "print-area"; order?: number }
  | { kind: "continuous-web"; order?: number };

export type EditableSurface = {
  id: string;
  /** Human label used by the surface selector. */
  label: string;
  /** Optional semantic navigation role; omitted legacy surfaces are inferred. */
  presentation?: EditableSurfacePresentation;
  /** Optional generated dieline overlay (see SurfaceDieline). */
  dieline?: SurfaceDieline;
  /** Must match a mesh name inside the GLB. Never an index. */
  meshName: string;
  /**
   * Additional GLB meshes driven by the same artwork canvas. Flexible
   * packaging commonly splits one production web across front, gusset and
   * back meshes while retaining a single printable surface.
   */
  meshNames?: string[];
  /** Optional front/gusset/back sections inside the shared production web. */
  sections?: EditableSection[];
  editorWidth: number;
  editorHeight: number;
  /** Real-world print size, shown on the editor's dimension rules. */
  physicalWidthCm: number;
  physicalHeightCm: number;
  /** Display unit for the editor rulers. Measurements remain stored in cm. */
  displayUnit?: "mm" | "cm" | "in";
  guides?: SurfaceGuides;
  /** Exact rectangular trim/safe geometry when the artwork page includes bleed. */
  rectangularLayout?: RectangularPrintLayout;
  /**
   * Reproduction methods this surface offers. Packaging is printed; a garment
   * panel can also be embroidered. Absent means print only, so no existing
   * product gains a control it cannot honour.
   */
  renderModes?: ArtworkRenderMode[];
  /**
   * Colour of the unprinted substrate. Pouch film and board are white, not
   * transparent — without this the empty canvas' zero alpha renders as black.
   */
  defaultBackground?: string;
  /**
   * Print renderer base when it differs from the visual substrate preview.
   * For kraft, process-white means no CMYK ink and reveals the brown stock.
   */
  productionBackground?: string;
};

export type CameraPreset = {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
};

/**
 * How the 3D geometry is produced.
 *  - "glb"            a prepared mesh file (bottles, jars, anything revolved)
 *  - "folded-carton"  generated at runtime from a dieline spec, so the same
 *                     data drives the mesh, the editor canvas and the fold
 *                     animation. Adding a box needs a spec, not a model.
 */
export type ProductFamily = "glb" | "folded-carton" | "pouch" | "flat-sheet";

export type FlatSheetSpec = {
  unit: "mm";
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
  safeAreaInsetMm: number;
  editorPxPerMm: number;
  /** Preview/material parameter only; it never changes print geometry. */
  previewThicknessMm: number;
};

export type ProductConfig = {
  id: string;
  /** Immutable version that produced this resolved engine configuration. */
  productVersionId?: string;
  /** Deterministic identity for the validated option selection. */
  configurationId?: string;
  /** Validated customer-facing values used to resolve this configuration. */
  optionSelection?: Record<string, string | number | boolean>;
  name: string;
  family: ProductFamily;
  /** Required for family "glb". */
  modelUrl: string;
  /** Required for family "folded-carton" — key into the carton registry. */
  cartonSpecId?: string;
  /**
   * Resolved, version-pinned structural carton. Parameterized products embed
   * this so dimensions/dielines cannot drift with a mutable runtime registry.
   * Legacy fixed products continue to resolve `cartonSpecId`.
   */
  cartonSpec?: CartonSpec;
  /** Required for family "pouch" — key into the pouch registry. */
  pouchSpecId?: string;
  /** Required for family "flat-sheet". One source for editor, 3D and export. */
  flatSheetSpec?: FlatSheetSpec;
  /**
   * Explicit provenance for this product's critical dimensions and semantics.
   *
   * Omit it and `resolveManufacturingProvenance` derives the ledger from the
   * construction spec. Set it to override that derivation for a product whose
   * evidence lives outside the spec — never to upgrade an assumption.
   */
  manufacturingProvenance?: ProvenanceLedger;
  /**
   * @deprecated Presentation is derived from the product's construction by
   * `resolveProductPresentation`. Kept so existing configs keep type-checking.
   */
  canOpen?: boolean;
  /**
   * Force a product to render with no structural control even though its
   * construction supports one. Omit for the derived capability.
   */
  presentation?: "static";
  /**
   * Optional authored articulation for a prepared GLB (hinged cases, folding
   * displays). Declared as a contract; see `GlbArticulationSpec`. A product
   * that sets this reports `unsupported` until a GLB articulation driver
   * exists — it is never silently ignored.
   */
  articulation?: GlbArticulationSpec;
  editableSurfaces: EditableSurface[];
  /** Camera framing for this product. */
  camera: {
    initial: [number, number, number];
    target: [number, number, number];
    minDistance: number;
    maxDistance: number;
    presets: CameraPreset[];
    /**
     * Keep the orbit pivot and zoom on the product itself.
     *
     * Structural cartons are modelled in canonical sheet coordinates, so the
     * assembled body sits wherever its root panel falls on the sheet while the
     * flat pose is centred on the origin. A fixed pivot then sits off the
     * product and orbiting swings it through a wide arc instead of turning it
     * in place. Opt in per product; fixed-pose products keep their authored
     * framing.
     */
    autoFrame?: boolean;
  };
  /**
   * Render this product without a persisted project.
   *
   * Some products are built at request time from a local, non-redistributable
   * source rather than resolved from the published catalogue, so there is no
   * product row to create a project against. Without this the Studio blocks on
   * "product is not published" and uploads never unlock. Preview-only sessions
   * keep artwork in memory for the tab and never call the projects API.
   */
  previewOnly?: boolean;
  /** Vertical offset applied to the model so it sits on the ground plane. */
  modelYOffset?: number;
  /**
   * Fixed presentation rotation in radians, applied outside structural hinge
   * transforms. This orients a product for viewing without changing canonical
   * dieline coordinates, fold state, artwork mapping, or camera state.
   */
  modelRotation?: [number, number, number];
  /** Uniform scale applied without modifying the source GLB. */
  modelScale?: number;
  /** Ground-plane height when it differs from the model origin. */
  shadowY?: number;
  /** Hide from the library/catalogue while keeping the URL working. */
  hidden?: boolean;
  /** Optional key into the reusable print-profile registry. */
  printProfileId?: string;
  /** Product-specific production material response. */
  materialProfile?:
    | "standard"
    | "glossy-laminate"
    | "clear-barrier-gloss"
    | "kraft-corrugated"
    | "kraft-cardstock"
    | "cotton-fabric";
};

/** Result of checking a loaded GLB against its ProductConfig. */
export type ValidationResult = {
  ok: boolean;
  errors: string[];
  foundMeshes: string[];
};
