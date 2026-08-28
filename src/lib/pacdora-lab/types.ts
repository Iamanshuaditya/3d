export type DimensionMode = "inner" | "manufacture" | "outer";

export type PackagingKind = "box" | "center-seal" | "stand-up";

export type BoxConstruction = "roll-end" | "ear-lock" | "display";

export type PouchStyle = "center-seal" | "stand-up";

export type PouchArtworkPlacement = "front" | "back" | "both";

export type PouchArtworkFit = "cover" | "contain";

export type PouchArtwork = {
  sourceUrl: string;
  name: string;
  placement: PouchArtworkPlacement;
  fit: PouchArtworkFit;
  /** Additional scale after cover/contain fitting. 1 = fitted size. */
  scale: number;
  /** Panel-relative offsets; 0.1 moves the artwork by 10% of that panel. */
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
};

export type PackagingMaterialKind = "paperboard" | "corrugated" | "film";

export type Dimensions3 = {
  length: number;
  width: number;
  height: number;
};

export type MaterialProfile = {
  id: string;
  label: string;
  kind: PackagingMaterialKind;
  caliperMm: number;
  color: string;
  roughness: number;
  metalness: number;
  /** Inner-to-score allowance per material layer. */
  scoreAllowanceFactor: number;
  /** Score-to-outer allowance per material layer on length and width. */
  outerAllowanceFactor: number;
  /** Additional vertical stack above manufacture height. */
  closureStackFactor: number;
};

export type DielinePanel = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  role: "body" | "wall" | "lid" | "flap" | "film" | "seal";
  /** Local cut contour in millimetres from the panel's top-left corner. */
  outline?: Array<{ x: number; y: number }>;
};

export type DielineLine = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "crease" | "cut" | "seal";
};

export type BoxLabInput = {
  dimensions: Dimensions3;
  dimensionMode: DimensionMode;
  materialId: string;
  /** Defaults to the conventional roll-end mailer for older callers. */
  construction?: BoxConstruction;
};

export type BoxLabSolution = {
  kind: "box";
  construction: BoxConstruction;
  material: MaterialProfile;
  input: BoxLabInput;
  inner: Dimensions3;
  manufacture: Dimensions3;
  outer: Dimensions3;
  blank: { width: number; height: number; margin: number };
  panels: DielinePanel[];
  lines: DielineLine[];
  assumptions: string[];
};

export type PouchLabInput = {
  style: PouchStyle;
  width: number;
  height: number;
  depth: number;
  materialId: string;
  inflation: number;
  endSealMm: number;
  backSealMm: number;
  gussetMm: number;
  zipper: boolean;
  hangHole: boolean;
};

export type PouchLabSolution = {
  kind: "pouch";
  material: MaterialProfile;
  input: PouchLabInput;
  style: PouchStyle;
  inflatedDepth: number;
  web: { width: number; height: number };
  panels: DielinePanel[];
  lines: DielineLine[];
  assumptions: string[];
};
