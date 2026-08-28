function normalizedHalfSine(normalizedLateral: number): number {
  const s = Math.min(1, Math.max(-1, normalizedLateral));
  if (Math.abs(s) === 1) return 0;
  return Math.sin((s + 1) * Math.PI * 0.5);
}

/**
 * Normalized half-depth of the bottom-gusset lens at x in [-1, 1].
 *
 * An ellipse has a shared vertical tangent where its upper and lower halves
 * meet, so its ends read as round. A Doypack gusset instead has two formed
 * film facets that meet the side heat seal at a visible angle. A half sine
 * keeps the broad curved middle while giving the mirrored halves finite,
 * opposing end slopes: the sharp lens tips visible in Pacdora's underside.
 */
export function standUpLensDepthMask(normalizedLateral: number): number {
  return Math.max(0, normalizedHalfSine(normalizedLateral));
}

/**
 * Single centre-driven crown used above the gusset transition. The exponent
 * broadens the printable face without introducing the old flat plateau and
 * its two competing shoulder bulges.
 */
export function standUpFaceCrownMask(normalizedLateral: number): number {
  const s = Math.min(1, Math.max(-1, normalizedLateral));
  const broadCrown = Math.pow(Math.max(0, normalizedHalfSine(s)), 0.42);
  const t = Math.min(1, Math.max(0, (Math.abs(s) - 0.84) / 0.14));
  const sealShoulder = 1 - t * t * (3 - 2 * t);
  return broadCrown * sealShoulder;
}
