import type { CanonicalDieline } from "./vector-domain";
import {
  evaluateGoldenStructuralAcceptance,
  LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
  type GoldenStructuralAcceptanceReport,
} from "./structural-acceptance";
import {
  buildProfiledPlanarGraph,
  type StructuralTopologyProfile,
  type StructuralTopologyRepair,
} from "./topology-profile";

/**
 * Source-specific topology contract for the reviewed CloudLab lock-bottom PDF.
 *
 * Independent object-level measurement found four diagonal crease terminals
 * 0.0135–0.0147 mm from the INTERIOR of their intended cut spans. The global
 * endpoint-to-endpoint snapper cannot and should not invent those joins.
 * Instead this exact source is hash-locked to an explicit topology-only
 * endpoint-to-span profile. Canonical source vectors remain untouched.
 */
export const LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM = 0.02;
export const LOCK_BOTTOM_WINDOW_EXPECTED_PANEL_COUNT = 17;
export const LOCK_BOTTOM_WINDOW_EXPECTED_TOPOLOGY_REPAIRS = 4;

export const LOCK_BOTTOM_WINDOW_TOPOLOGY_PROFILE: StructuralTopologyProfile = Object.freeze({
  id: "cloudlab-lock-bottom-window-300x150x200",
  sourceSha256: LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS.sourceSha256,
  endpointToSpanSnapMm: LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM,
  expectedRepairCount: LOCK_BOTTOM_WINDOW_EXPECTED_TOPOLOGY_REPAIRS,
});

export type LockBottomGoldenAcceptanceReport = GoldenStructuralAcceptanceReport &
  Readonly<{
    profile: Readonly<{
      id: "cloudlab-lock-bottom-window-300x150x200";
      endpointToSpanSnapMm: number;
      expectedPanelCount: number;
      expectedRepairCount: number;
      actualRepairCount: number;
      maxRepairDistanceMm: number;
      repairs: readonly StructuralTopologyRepair[];
      panelCountPassed: boolean;
      repairCountPassed: boolean;
      repairDistancePassed: boolean;
      sourceProfileApplied: true;
    }>;
    passed: boolean;
  }>;

export function applyLockBottomGoldenSourceProfile(
  dieline: CanonicalDieline,
): Readonly<{
  topologyDieline: CanonicalDieline;
  repairs: readonly StructuralTopologyRepair[];
}> {
  const profiled = buildProfiledPlanarGraph(dieline, LOCK_BOTTOM_WINDOW_TOPOLOGY_PROFILE);
  return {
    topologyDieline: profiled.topologyDieline,
    repairs: profiled.repairs,
  };
}

/**
 * Full golden source acceptance with the reviewed local topology profile.
 *
 * Cut/source measurements still originate in the untouched imported source;
 * the derived topology copy differs only where the four audited dangling
 * crease endpoints are projected <=0.02 mm to their intended cut spans.
 */
export function evaluateLockBottomGoldenAcceptance(
  rawDieline: CanonicalDieline,
): LockBottomGoldenAcceptanceReport {
  const profiled = applyLockBottomGoldenSourceProfile(rawDieline);
  const base = evaluateGoldenStructuralAcceptance(
    profiled.topologyDieline,
    LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
  );
  const panelCountPassed = base.panelCount === LOCK_BOTTOM_WINDOW_EXPECTED_PANEL_COUNT;
  const repairCountPassed =
    profiled.repairs.length === LOCK_BOTTOM_WINDOW_EXPECTED_TOPOLOGY_REPAIRS;
  const maxRepairDistanceMm = profiled.repairs.reduce(
    (maximum, repair) => Math.max(maximum, repair.distanceMm),
    0,
  );
  const repairDistancePassed =
    maxRepairDistanceMm <= LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM;
  return {
    ...base,
    profile: {
      id: "cloudlab-lock-bottom-window-300x150x200",
      endpointToSpanSnapMm: LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM,
      expectedPanelCount: LOCK_BOTTOM_WINDOW_EXPECTED_PANEL_COUNT,
      expectedRepairCount: LOCK_BOTTOM_WINDOW_EXPECTED_TOPOLOGY_REPAIRS,
      actualRepairCount: profiled.repairs.length,
      maxRepairDistanceMm,
      repairs: profiled.repairs,
      panelCountPassed,
      repairCountPassed,
      repairDistancePassed,
      sourceProfileApplied: true,
    },
    passed:
      base.passed &&
      panelCountPassed &&
      repairCountPassed &&
      repairDistancePassed,
  };
}
