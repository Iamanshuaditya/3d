const MM_PER_INCH = 25.4;

/**
 * Converts physical length to the smallest containing raster dimension.
 * The epsilon prevents exact integral targets (88.9 mm at 300 PPI = 1050)
 * from becoming 1051 through binary floating-point noise.
 */
export function pixelsForMm(mm: number, ppi: number) {
  return Math.ceil((mm / MM_PER_INCH) * ppi - 1e-9);
}
