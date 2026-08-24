import type { CanonicalDieline } from "./vector-domain";
import {
  evaluateGoldenStructuralAcceptance,
  LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
  type GoldenStructuralAcceptanceReport,
} from "./structural-acceptance";

/**
 * Source-specific topology contract for the reviewed CloudLab lock-bottom PDF.
 *
 * Independent object-level measurement found four diagonal crease terminals
 * 0.0135–0.0147 mm from their intended cut span. Those gaps are larger than
 * the engine-wide 0.01 mm automatic topology tolerance but remain below
 * 0.02 mm. Raising the GLOBAL tolerance would weaken unrelated products, so
 * the exception is explicit, hash-locked and local to this exact source.
 */
export const LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM = 0.02;
export const LOCK_BOTTOM_WINDOW_EXPECTED_PANEL_COUNT = 17;

export type LockBottomGoldenAcceptanceReport = GoldenStructuralAcceptanceReport &
  Readonly<{
    profile: Readonly<{
      id: "cloudlab-lock-bottom-window-300x150x200";
      topologySnapMm: number;
      expectedPanelCount: number;
      panelCountPassed: boolean;
      sourceProfileApplied: true;
    }>;
    passed: boolean;
  }>;

export function applyLockBottomGoldenSourceProfile(
  dieline: CanonicalDieline,
): CanonicalDieline {
  if (
    dieline.source.sha256?.toLowerCase() !==
    LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS.sourceSha256.toLowerCase()
  ) {
    throw new Error(
      "Lock-bottom golden topology profile may only be applied to the reviewed source SHA-256.",
    );
  }
  if (dieline.tolerances.topologySnapMm > LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM) {
    throw new Error(
      `Golden source already requests topology tolerance ${dieline.tolerances.topologySnapMm} mm, which exceeds the reviewed ${LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM} mm profile.`,
    );
  }
  return {
    ...dieline,
    tolerances: {
      ...dieline.tolerances,
      topologySnapMm: LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM,
    },
    metadata: {
      ...dieline.metadata,
      topologyProfile: "cloudlab-lock-bottom-window-300x150x200",
      topologySnapMm: LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM,
      topologyRationale:
        "Four reviewed diagonal crease terminals are 0.0135–0.0147 mm from their intended cut spans; 0.02 mm closes those numeric source gaps without changing global tolerances.",
    },
  };
}

/**
 * Full golden source acceptance with the reviewed local topology profile.
 * Source-cycle metrics remain measured from the untouched canonical vectors;
 * only planar adjacency uses the explicit 0.02 mm source-profile tolerance.
 */
export function evaluateLockBottomGoldenAcceptance(
  rawDieline: CanonicalDieline,
): LockBottomGoldenAcceptanceReport {
  const dieline = applyLockBottomGoldenSourceProfile(rawDieline);
  const base = evaluateGoldenStructuralAcceptance(
    dieline,
    LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
  );
  const panelCountPassed = base.panelCount === LOCK_BOTTOM_WINDOW_EXPECTED_PANEL_COUNT;
  return {
    ...base,
    profile: {
      id: "cloudlab-lock-bottom-window-300x150x200",
      topologySnapMm: LOCK_BOTTOM_WINDOW_TOPOLOGY_SNAP_MM,
      expectedPanelCount: LOCK_BOTTOM_WINDOW_EXPECTED_PANEL_COUNT,
      panelCountPassed,
      sourceProfileApplied: true,
    },
    passed: base.passed && panelCountPassed,
  };
}
