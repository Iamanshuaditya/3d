/**
 * Normalized half-depth of an ellipse at a lateral coordinate in [-1, 1].
 *
 * A stand-up pouch gusset opens from its centre fold. Using a flat shoulder
 * plateau here produces a rounded rectangle when viewed from underneath;
 * this ellipse instead gives maximum depth on the centreline and tapers
 * continuously into the two side seals.
 */
export function standUpEllipticDepthMask(normalizedLateral: number): number {
  const s = Math.min(1, Math.max(-1, normalizedLateral));
  return Math.sqrt(Math.max(0, 1 - s * s));
}
