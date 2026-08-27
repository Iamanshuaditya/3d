import { dielineOverlay } from "@/lib/configurator/carton-geometry";
import { resolveCartonSpec } from "@/lib/configurator/carton-spec";
import { flattenVectorPath } from "@/lib/structure/vector-math";
import type { CanonicalDieline, CoreStructuralOperation } from "@/lib/structure/vector-domain";
import type { DielinePath } from "@/types/carton";
import type { ProductConfig } from "@/types/configurator";
import type { NormalizedPrintJob } from "./types";

export type ManufacturingOperation = "cut" | "crease" | "bleed";

export type ManufacturingPath = {
  operation: ManufacturingOperation;
  closed: boolean;
  points: Array<{ xMm: number; yMm: number }>;
  /** Canonical source identity retained for audit/provenance when available. */
  sourceEntityId?: string;
  sourcePathId?: string;
};

export type ManufacturingSheet = {
  surfaceId: string;
  label: string;
  widthMm: number;
  heightMm: number;
  paths: ManufacturingPath[];
};

export type ManufacturingGeometry = {
  units: "mm";
  productId: string;
  productVersionId: string | null;
  configurationId: string | null;
  /** Canonical source hash when production geometry came from structural authority. */
  sourceSha256?: string;
  sheets: ManufacturingSheet[];
};

const GEOMETRY_TOLERANCE_MM = 0.01;
const CUT_OPERATIONS = new Set<CoreStructuralOperation>(["cut", "window-cut"]);
const CREASE_OPERATIONS = new Set<CoreStructuralOperation>([
  "crease",
  "score",
  "perforation",
  "half-cut",
]);

function validPath(path: DielinePath, operation: ManufacturingOperation) {
  const minimumPoints = path.closed ? 3 : 2;
  if (path.points.length < minimumPoints) {
    throw new Error(`Manufacturing ${operation} path has too few points.`);
  }
  return {
    operation,
    closed: path.closed ?? false,
    points: path.points.map(({ x, y }) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`Manufacturing ${operation} path contains a non-finite coordinate.`);
      }
      return { xMm: x, yMm: y };
    }),
  } satisfies ManufacturingPath;
}

function canonicalManufacturingPaths(dieline: CanonicalDieline): ManufacturingPath[] {
  return dieline.entities.flatMap((entity) => {
    let operation: ManufacturingOperation | null = null;
    if (CUT_OPERATIONS.has(entity.operation as CoreStructuralOperation)) operation = "cut";
    else if (CREASE_OPERATIONS.has(entity.operation as CoreStructuralOperation)) operation = "crease";
    else if (entity.operation === "bleed") operation = "bleed";
    if (!operation) return [];

    // Manufacturing coordinates stay derived from the canonical vector source.
    // The current SVG/PDF artifact layer is polyline-based, so curves are
    // tessellated here using the canonical physical error budget rather than a
    // screen/rendering tolerance. Provenance is retained on every emitted path.
    const flattened = flattenVectorPath(
      entity.path,
      dieline.tolerances.curveFlatteningMm,
      dieline.tolerances.maxSubdivisionDepth,
      dieline.tolerances.coordinateEpsilonMm,
    );
    const minimumPoints = flattened.closed ? 3 : 2;
    if (flattened.points.length < minimumPoints) {
      throw new Error(
        `Canonical manufacturing ${operation} entity ${entity.id} has too few points after certified flattening.`,
      );
    }
    return [
      {
        operation,
        closed: flattened.closed,
        points: flattened.points.map((point) => ({ xMm: point.x, yMm: point.y })),
        sourceEntityId: entity.id,
        sourcePathId: entity.path.id,
      },
    ];
  });
}

export function supportsManufacturingSvg(product: ProductConfig) {
  const spec = resolveCartonSpec(product);
  const surface = product.editableSurfaces[0];
  return Boolean(
    spec &&
      product.editableSurfaces.length === 1 &&
      Math.abs(surface.physicalWidthCm * 10 - spec.width) <= GEOMETRY_TOLERANCE_MM &&
      Math.abs(surface.physicalHeightCm * 10 - spec.height) <= GEOMETRY_TOLERANCE_MM,
  );
}

/**
 * Normalizes the version-pinned structural spec directly into manufacturing
 * millimetres. Exact structural authority always wins over legacy presentation
 * paths so editor, 3D and manufacturing cannot silently diverge.
 */
export function normalizeManufacturingGeometry(
  job: NormalizedPrintJob,
): ManufacturingGeometry {
  const spec = resolveCartonSpec(job.product);
  if (!spec || job.product.editableSurfaces.length !== 1) {
    throw new Error("Manufacturing SVG currently supports one-sheet folded cartons.");
  }
  const surface = job.product.editableSurfaces[0];
  const widthMm = surface.physicalWidthCm * 10;
  const heightMm = surface.physicalHeightCm * 10;
  if (
    Math.abs(widthMm - spec.width) > GEOMETRY_TOLERANCE_MM ||
    Math.abs(heightMm - spec.height) > GEOMETRY_TOLERANCE_MM
  ) {
    throw new Error(
      `Resolved print surface ${widthMm}×${heightMm} mm does not match structural blank ${spec.width}×${spec.height} mm.`,
    );
  }

  let paths: ManufacturingPath[];
  let sourceSha256: string | undefined;
  if (spec.structural) {
    const canonical = spec.structural.dieline;
    if (
      Math.abs(canonical.widthMm - spec.width) > GEOMETRY_TOLERANCE_MM ||
      Math.abs(canonical.heightMm - spec.height) > GEOMETRY_TOLERANCE_MM
    ) {
      throw new Error("Canonical manufacturing bounds disagree with the resolved carton spec.");
    }
    paths = canonicalManufacturingPaths(canonical);
    sourceSha256 = canonical.source.sha256;
  } else {
    const overlay = spec.dieline
      ? spec.dieline
      : (() => {
          const derived = dielineOverlay(spec, spec.width, spec.height);
          const path = (candidate: { points: number[]; closed: boolean }): DielinePath => ({
            points: Array.from({ length: candidate.points.length / 2 }, (_, index) => ({
              x: candidate.points[index * 2],
              y: candidate.points[index * 2 + 1],
            })),
            closed: candidate.closed,
          });
          return {
            cuts: derived.cuts.map(path),
            creases: derived.creases.map(path),
            bleed: (derived.bleed ?? []).map(path),
          };
        })();
    paths = [
      ...overlay.cuts.map((candidate) => validPath(candidate, "cut")),
      ...overlay.creases.map((candidate) => validPath(candidate, "crease")),
      ...(overlay.bleed ?? []).map((candidate) => validPath(candidate, "bleed")),
    ];
  }

  for (const path of paths) {
    for (const point of path.points) {
      if (
        point.xMm < -GEOMETRY_TOLERANCE_MM ||
        point.yMm < -GEOMETRY_TOLERANCE_MM ||
        point.xMm > spec.width + GEOMETRY_TOLERANCE_MM ||
        point.yMm > spec.height + GEOMETRY_TOLERANCE_MM
      ) {
        throw new Error(`Manufacturing ${path.operation} path falls outside the structural blank.`);
      }
    }
  }

  return {
    units: "mm",
    productId: job.product.id,
    productVersionId: job.product.productVersionId ?? null,
    configurationId: job.product.configurationId ?? null,
    ...(sourceSha256 ? { sourceSha256 } : {}),
    sheets: [
      {
        surfaceId: surface.id,
        label: surface.label,
        widthMm: spec.width,
        heightMm: spec.height,
        paths,
      },
    ],
  };
}
