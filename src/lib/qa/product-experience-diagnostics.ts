import type {
  DielineGuideClass,
} from "@/lib/configurator/dieline-presentation";
import { buildDielinePresentation } from "@/lib/configurator/dieline-presentation";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import {
  frameDistanceForSphere,
  resolveStudioScenePresentation,
} from "@/lib/configurator/studio-scene-presentation";
import { buildPouchGeometry, styledWebLayout } from "@/lib/configurator/pouch-geometry";
import { resolvePouchProductionWeb } from "@/lib/configurator/pouch-production-web";
import { POUCHES } from "@/lib/configurator/pouch-spec";
import {
  flatSheetSceneDimensions,
  SCENE_UNITS_PER_MM,
} from "@/lib/configurator/flat-sheet-mesh";
import { resolveCartonSpec } from "@/lib/configurator/carton-spec";
import type { EditableSurface, ProductConfig } from "@/types/configurator";
import type { PouchSpec } from "@/types/pouch";

const MM_PER_CM = 10;

export type WebColumnFacts = Readonly<{
  id: string;
  startMm: number;
  widthMm: number;
  mirrored: boolean;
}>;

export type SurfaceFacts = Readonly<{
  id: string;
  editorWidth: number;
  editorHeight: number;
  physicalWidthMm: number;
  physicalHeightMm: number;
  /** Editor pixels per millimetre on each axis; these must agree. */
  pxPerMmX: number;
  pxPerMmY: number;
  substrate: string;
}>;

export type MeasuredWebFacts = Readonly<{
  widthMm: number;
  repeatMm: number;
  segmentCount: number;
  /** Bands carrying no artwork: seals, slitting marks, technical references. */
  technicalSegmentCount: number;
  /** Source facts whose converter meaning is recorded as not established. */
  openSourceQuestionCount: number;
  /** Values that exist only to make a convincing preview. */
  previewAssumptionCount: number;
}>;

export type PreviewFacts = Readonly<{
  background: string;
  /** Fraction of the limiting viewport axis the bounding sphere subtends. */
  occupancy: number;
  /** True when min/max distance clamping, not padding, decided the framing. */
  distanceClamped: boolean;
  /** Bounding-sphere radius in scene units the framing was computed from. */
  boundingRadius: number;
  /** Distance the padding alone asks for, before the product's clamps apply. */
  unclampedDistance: number;
  minDistance: number;
  maxDistance: number;
}>;

export type ProductExperienceDiagnostics = Readonly<{
  productId: string;
  family: ProductConfig["family"];
  surface: SurfaceFacts;
  guideClasses: readonly DielineGuideClass[];
  /** Source references whose converter meaning is not established. */
  unresolvedReferenceCount: number;
  /** The styled printed-web wrap; absent for measured webs and non-pouches. */
  webColumns: readonly WebColumnFacts[] | null;
  /** The source-measured web; absent for parametric pouches and non-pouches. */
  measuredWeb: MeasuredWebFacts | null;
  preview: PreviewFacts | null;
  /** Always known, even when framing cannot be measured headlessly. */
  background: string;
}>;

type DiagnosticsOptions = Readonly<{
  /** Viewport the preview is measured against. */
  viewportAspect?: number;
  verticalFovDeg?: number;
  /** Bounding-sphere radius in scene units, measured from the built model. */
  boundingRadius?: number;
}>;

const DEFAULT_ASPECT = 16 / 10;
const DEFAULT_FOV_DEG = 32;

function limitingFovRad(verticalFovDeg: number, aspect: number): number {
  const vertical = (verticalFovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 1e-6));
  return Math.min(vertical, horizontal);
}

/**
 * Fraction of the limiting viewport axis the product subtends at the framed
 * distance. Derived from the same helper the viewer uses, so a change to
 * framing padding or to a product's distance clamps moves this number.
 */
export function previewOccupancy(input: {
  radius: number;
  padding: number;
  minDistance: number;
  maxDistance: number;
  verticalFovDeg: number;
  aspect: number;
}): {
  occupancy: number;
  distanceClamped: boolean;
  radius: number;
  unclampedDistance: number;
} {
  const distance = frameDistanceForSphere({
    radius: input.radius,
    verticalFovDeg: input.verticalFovDeg,
    aspect: input.aspect,
    padding: input.padding,
    minDistance: input.minDistance,
    maxDistance: input.maxDistance,
  });
  const fov = limitingFovRad(input.verticalFovDeg, input.aspect);
  const ratio = Math.min(1, input.radius / Math.max(distance, 1e-6));
  const subtended = 2 * Math.asin(ratio);
  const unclamped = (input.radius * input.padding) / Math.max(Math.sin(fov / 2), 1e-6);
  return {
    occupancy: subtended / fov,
    distanceClamped: Math.abs(distance - unclamped) > 1e-6,
    radius: input.radius,
    unclampedDistance: unclamped,
  };
}

function surfaceFacts(surface: EditableSurface): SurfaceFacts {
  const physicalWidthMm = surface.physicalWidthCm * MM_PER_CM;
  const physicalHeightMm = surface.physicalHeightCm * MM_PER_CM;
  return {
    id: surface.id,
    editorWidth: surface.editorWidth,
    editorHeight: surface.editorHeight,
    physicalWidthMm,
    physicalHeightMm,
    pxPerMmX: surface.editorWidth / physicalWidthMm,
    pxPerMmY: surface.editorHeight / physicalHeightMm,
    substrate: surface.defaultBackground ?? "#ffffff",
  };
}

/**
 * Reads the printed-web column layout that decides pouch chirality. `mirrored`
 * on the back column is what makes the wrap read correctly from outside; a
 * regression that drops it, or adds it to the front, is a mirrored-artwork bug.
 *
 * Returns null when the layout is not the one the product actually consumes: a
 * source-measured web takes its segment order from the manufacturer, and a
 * stand-up pouch is built by the unstyled mesh path against its own three-panel
 * section list. Reporting the wrap for those would gate on dead data.
 */
function webColumnFacts(spec: PouchSpec | null): readonly WebColumnFacts[] | null {
  if (!spec || spec.productionWeb) return null;
  if ((spec.style ?? "stand_up") === "stand_up") return null;
  const layout = styledWebLayout(spec);
  return layout.columns.map((column) => ({
    id: column.id,
    startMm: column.x0,
    widthMm: column.w,
    mirrored: column.mirrored === true,
  }));
}

function measuredWebFacts(spec: PouchSpec | null): MeasuredWebFacts | null {
  if (!spec) return null;
  const web = resolvePouchProductionWeb(spec);
  if (!web) return null;
  return {
    widthMm: web.widthMm,
    repeatMm: web.repeatMm,
    segmentCount: web.segments.length,
    technicalSegmentCount: web.segments.filter((segment) => segment.role === "technical")
      .length,
    openSourceQuestionCount: web.sourceReview.length,
    previewAssumptionCount: web.previewAssumptions.length,
  };
}

/**
 * Bounding-sphere radius in scene units, taken from the geometry each family
 * actually builds. Framing cannot be judged against a guessed size, so a
 * family with no headless geometry returns null and its framing gate is
 * skipped rather than evaluated against a fabricated number.
 */
function boundingRadius(config: ProductConfig, spec: PouchSpec | null): number | null {
  if (config.family === "pouch" && spec) {
    const { size } = buildPouchGeometry(spec);
    return Math.hypot(size.width, size.height, size.depth) / 2;
  }
  if (config.family === "flat-sheet" && config.flatSheetSpec) {
    const scene = flatSheetSceneDimensions(config.flatSheetSpec);
    return Math.hypot(scene.width, scene.height, scene.thickness) / 2;
  }
  if (config.family === "folded-carton") {
    const carton = resolveCartonSpec(config);
    if (!carton) return null;
    // Assembled extent is bounded by the flat sheet it is cut from.
    return (
      (Math.hypot(carton.width, carton.height) * SCENE_UNITS_PER_MM) / 2
    );
  }
  return null;
}

export function buildProductExperienceDiagnostics(
  config: ProductConfig,
  options: DiagnosticsOptions = {},
): ProductExperienceDiagnostics {
  const surface = config.editableSurfaces[0];
  if (!surface) {
    throw new Error(`Product ${config.id} has no editable surface to benchmark.`);
  }
  const dieline = resolveSurfaceDieline(config, surface);
  const items = buildDielinePresentation(dieline);
  const guideClasses = [...new Set(items.map((item) => item.guideClass))].sort();
  const presentation = resolveStudioScenePresentation(config);
  const aspect = options.viewportAspect ?? DEFAULT_ASPECT;
  const verticalFovDeg = options.verticalFovDeg ?? DEFAULT_FOV_DEG;
  const spec = config.family === "pouch" && config.pouchSpecId
    ? POUCHES[config.pouchSpecId] ?? null
    : null;
  const radius = options.boundingRadius ?? boundingRadius(config, spec);
  const framing = radius === null ? null : previewOccupancy({
    radius,
    padding: presentation.framePadding,
    minDistance: config.camera.minDistance,
    maxDistance: config.camera.maxDistance,
    verticalFovDeg,
    aspect,
  });

  return {
    productId: config.id,
    family: config.family,
    surface: surfaceFacts(surface),
    guideClasses,
    unresolvedReferenceCount: dieline?.references?.length ?? 0,
    webColumns: webColumnFacts(spec),
    measuredWeb: measuredWebFacts(spec),
    preview: framing === null
      ? null
      : {
          background: presentation.background,
          occupancy: framing.occupancy,
          distanceClamped: framing.distanceClamped,
          boundingRadius: framing.radius,
          unclampedDistance: framing.unclampedDistance,
          minDistance: config.camera.minDistance,
          maxDistance: config.camera.maxDistance,
        },
    /** Null when no headless geometry exists to measure. */
    background: presentation.background,
  };
}
