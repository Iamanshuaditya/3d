import type { CartonSpec } from "@/types/carton";
import type { SurfaceDieline } from "@/types/configurator";
import {
  buildPlanarGraph,
  extractStructuralPanels,
  flattenVectorPath,
  resolveStructuralRig,
  type CanonicalDieline,
  type PlanarGraph,
  type ResolvedStructuralRig,
  type StructuralPanel,
} from "@/lib/structure";

const SIZE_TOLERANCE_MM = 0.01;

export type ResolvedStructuralCarton = Readonly<{
  dieline: CanonicalDieline;
  graph: PlanarGraph;
  panels: readonly StructuralPanel[];
  rig: ResolvedStructuralRig;
}>;

/**
 * Resolves and validates an exact structural carton once from its canonical
 * vector authority. Legacy width/height/thickness fields may describe the same
 * product for older code, but they are not allowed to silently disagree.
 */
export function resolveStructuralCarton(spec: CartonSpec): ResolvedStructuralCarton | null {
  const authority = spec.structural;
  if (!authority) return null;
  const { dieline, construction } = authority;

  if (
    Math.abs(spec.width - dieline.widthMm) > SIZE_TOLERANCE_MM ||
    Math.abs(spec.height - dieline.heightMm) > SIZE_TOLERANCE_MM
  ) {
    throw new Error(
      `Carton ${spec.id} legacy bounds ${spec.width}×${spec.height} mm disagree with canonical structural bounds ${dieline.widthMm}×${dieline.heightMm} mm.`,
    );
  }
  if (Math.abs(spec.boardThickness - construction.boardThicknessMm) > SIZE_TOLERANCE_MM) {
    throw new Error(
      `Carton ${spec.id} board thickness ${spec.boardThickness} mm disagrees with authored structural thickness ${construction.boardThicknessMm} mm.`,
    );
  }

  const graph = buildPlanarGraph(dieline);
  const panels = extractStructuralPanels(dieline, graph);
  const rig = resolveStructuralRig(dieline, graph, panels, construction);
  return { dieline, graph, panels, rig };
}

const CUT_OPERATIONS = new Set(["cut", "window-cut"]);
const CREASE_OPERATIONS = new Set(["crease", "score", "perforation", "half-cut"]);
const SAFETY_OPERATIONS = new Set(["bleed", "safe"]);

/**
 * Projects canonical millimetre linework into editor pixels. Curves are
 * adaptively flattened using the canonical physical tolerance; manufacturing
 * geometry remains vector and is never reconstructed from these UI polylines.
 */
export function structuralCartonOverlay(
  spec: CartonSpec,
  editorWidth: number,
  editorHeight: number,
): SurfaceDieline | null {
  const authority = spec.structural;
  if (!authority) return null;
  const { dieline } = authority;
  if (!Number.isFinite(editorWidth) || editorWidth <= 0 || !Number.isFinite(editorHeight) || editorHeight <= 0) {
    throw new RangeError("Structural editor dimensions must be finite and positive.");
  }
  const sx = editorWidth / dieline.widthMm;
  const sy = editorHeight / dieline.heightMm;
  const path = (entity: CanonicalDieline["entities"][number]) => {
    const flattened = flattenVectorPath(
      entity.path,
      dieline.tolerances.curveFlatteningMm,
      dieline.tolerances.maxSubdivisionDepth,
      dieline.tolerances.coordinateEpsilonMm,
    );
    return {
      points: flattened.points.flatMap((point) => [point.x * sx, point.y * sy]),
      closed: flattened.closed,
    };
  };

  return {
    cuts: dieline.entities.filter((entity) => CUT_OPERATIONS.has(entity.operation)).map(path),
    creases: dieline.entities.filter((entity) => CREASE_OPERATIONS.has(entity.operation)).map(path),
    safety: dieline.entities.filter((entity) => SAFETY_OPERATIONS.has(entity.operation)).map(path),
  };
}
