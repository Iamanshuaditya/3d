import type {
  PouchProductionWeb,
  PouchSpec,
  PouchWebRegion,
  PouchWebSegment,
} from "@/types/pouch";

const MM_TOLERANCE = 1e-9;

export type PositionedPouchWebSegment = PouchWebSegment & {
  startMm: number;
  endMm: number;
};

export type PouchProductionWebLayout = Omit<PouchProductionWeb, "segments"> & {
  segments: PositionedPouchWebSegment[];
};

export function resolvePouchProductionWeb(spec: PouchSpec): PouchProductionWebLayout | null {
  const web = spec.productionWeb;
  if (!web) return null;
  if (web.widthMm <= 0 || web.repeatMm <= 0 || web.laneCount !== 1) {
    throw new Error(`Pouch ${spec.id} has invalid production-web dimensions or lane count.`);
  }

  let cursor = 0;
  const segments = web.segments.map((segment) => {
    if (!Number.isFinite(segment.lengthMm) || segment.lengthMm <= 0) {
      throw new Error(`Pouch web segment ${segment.id} has invalid length.`);
    }
    const positioned = { ...segment, startMm: cursor, endMm: cursor + segment.lengthMm };
    cursor = positioned.endMm;
    return positioned;
  });
  if (Math.abs(cursor - web.repeatMm) > MM_TOLERANCE) {
    throw new Error(
      `Pouch ${spec.id} web segments total ${cursor} mm, not ${web.repeatMm} mm.`,
    );
  }

  const required: Array<[PouchWebRegion, number]> = [
    ["front", spec.height],
    ["gusset", spec.gusset],
    ["back", spec.height],
  ];
  for (const [role, expectedLength] of required) {
    const matches = segments.filter((segment) => segment.role === role);
    if (matches.length !== 1 || Math.abs(matches[0].lengthMm - expectedLength) > MM_TOLERANCE) {
      throw new Error(
        `Pouch ${spec.id} must have one ${role} region measuring ${expectedLength} mm.`,
      );
    }
  }
  return { ...web, segments };
}

export function pouchWebRegion(
  spec: PouchSpec,
  role: PouchWebRegion,
): PositionedPouchWebSegment {
  const layout = resolvePouchProductionWeb(spec);
  const segment = layout?.segments.find((candidate) => candidate.role === role);
  if (!segment) throw new Error(`Pouch ${spec.id} has no measured ${role} web region.`);
  return segment;
}

/** Top-left web millimetres to Three/CanvasTexture UV coordinates. */
export function pouchWebMmToUv(
  web: Pick<PouchProductionWeb, "widthMm" | "repeatMm">,
  point: Readonly<{ xMm: number; yMm: number }>,
) {
  return {
    u: point.xMm / web.widthMm,
    v: 1 - point.yMm / web.repeatMm,
  };
}

/**
 * Finished face coordinates to the authored flat web.
 * `lateral` is left-to-right as viewed from that finished face.
 * `verticalOrDepth` is bottom-to-top for faces and front-to-back for gusset.
 */
export function pouchRegionUv(
  spec: PouchSpec,
  role: PouchWebRegion,
  lateral: number,
  verticalOrDepth: number,
) {
  const web = resolvePouchProductionWeb(spec);
  if (!web) throw new Error(`Pouch ${spec.id} has no measured production web.`);
  const region = pouchWebRegion(spec, role);

  if (role === "gusset") {
    return pouchWebMmToUv(web, {
      xMm: lateral * web.widthMm,
      yMm: region.startMm + verticalOrDepth * region.lengthMm,
    });
  }

  const rotated = region.artworkOrientationDeg === 180;
  return pouchWebMmToUv(web, {
    xMm: (rotated ? 1 - lateral : lateral) * web.widthMm,
    yMm: rotated
      ? region.startMm + verticalOrDepth * region.lengthMm
      : region.endMm - verticalOrDepth * region.lengthMm,
  });
}

export function pouchRegionCentreUv(spec: PouchSpec, role: PouchWebRegion) {
  return pouchRegionUv(spec, role, 0.5, 0.5);
}
