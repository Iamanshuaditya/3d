export type BoxFoldPose = {
  wallAngle: number;
  dustAngle: number;
  frontRollAngle: number;
  lidWingAngle: number;
  lidCloseAngle: number;
  lockAngle: number;
  tuckAngle: number;
};

function ease01(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function staged(fold: number, start: number, end: number): number {
  return ease01((Math.min(1, Math.max(0, fold)) - start) / (end - start));
}

/**
 * One fold schedule for the 2D net's real crease hierarchy. Values are angles
 * relative to each panel's parent, so a child can never detach or interpolate
 * through the floor independently of its wall.
 */
export function resolvePacdoraLabBoxFoldPose(fold: number): BoxFoldPose {
  const quarterTurn = Math.PI * 0.5;
  return {
    wallAngle: staged(fold, 0, 0.42) * quarterTurn,
    dustAngle: staged(fold, 0.1, 0.52) * quarterTurn,
    frontRollAngle: staged(fold, 0.28, 0.62) * quarterTurn,
    lidWingAngle: staged(fold, 0.3, 0.66) * quarterTurn,
    lidCloseAngle: staged(fold, 0.5, 0.94) * quarterTurn,
    lockAngle: staged(fold, 0.62, 0.94) * quarterTurn,
    tuckAngle: staged(fold, 0.72, 1) * quarterTurn,
  };
}
