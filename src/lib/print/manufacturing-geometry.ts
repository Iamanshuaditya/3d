import { dielineOverlay } from "@/lib/configurator/carton-geometry";
import { resolveCartonSpec } from "@/lib/configurator/carton-spec";
import type { DielinePath } from "@/types/carton";
import type { ProductConfig } from "@/types/configurator";
import type { NormalizedPrintJob } from "./types";

export type ManufacturingOperation = "cut" | "crease" | "bleed";

export type ManufacturingPath = {
  operation: ManufacturingOperation;
  closed: boolean;
  points: Array<{ xMm: number; yMm: number }>;
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
  sheets: ManufacturingSheet[];
};

const GEOMETRY_TOLERANCE_MM = 0.01;

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
 * millimetres. It refuses a surface/spec size mismatch instead of silently
 * stretching the cutting geometry to fit a UI or PDF size.
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
          bleed: (derived.safety ?? []).map(path),
        };
      })();
  const paths = [
    ...overlay.cuts.map((candidate) => validPath(candidate, "cut")),
    ...overlay.creases.map((candidate) => validPath(candidate, "crease")),
    ...(overlay.bleed ?? []).map((candidate) => validPath(candidate, "bleed")),
  ];
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
