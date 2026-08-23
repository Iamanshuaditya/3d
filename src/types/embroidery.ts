/**
 * Artwork render treatments.
 *
 * A treatment is a DERIVED layer, never a replacement: the design document
 * keeps the customer's original asset plus a small parameter block, and every
 * pixel of stitching is recomputed from those two things. Nothing here is
 * destructive, and removing a treatment restores the original artwork exactly.
 */

export type ArtworkRenderMode = "print" | "embroidery";

/**
 * Embroidery parameters, in PHYSICAL units.
 *
 * Everything that controls how the stitching looks is expressed in
 * millimetres, so a 5 cm logo produces the same thread scale whether the
 * surface canvas is 1024px or 4096px wide. Pixels are an output detail.
 */
export type EmbroiderySettings = {
  /** Centre-to-centre spacing between adjacent stitch rows. */
  densityMm: number;
  /** Rendered thread width. Real 40wt rayon lands around 0.4mm. */
  threadWidthMm: number;
  /** Length of one stitch along its row. */
  stitchLengthMm: number;
  /**
   * How many thread colours the artwork is reduced to. Real production runs
   * change threads per colour, so this is a cost as well as a look.
   */
  maxColours: number;
  /** Specular response of the thread, 0 = matte cotton, 1 = rayon/polyester. */
  sheen: number;
  /**
   * Narrow shapes below this width get column (satin) stitching instead of a
   * filled area — the same decision a digitiser makes by hand.
   */
  satinMaxWidthMm: number;
  /** Perceived height of the stitching, drives the generated normal map. */
  reliefMm: number;
};

export const DEFAULT_EMBROIDERY: EmbroiderySettings = {
  densityMm: 0.45,
  threadWidthMm: 0.4,
  stitchLengthMm: 2.6,
  maxColours: 6,
  sheen: 0.55,
  satinMaxWidthMm: 6,
  reliefMm: 0.7,
};

export type ArtworkTreatment =
  | { mode: "print" }
  | { mode: "embroidery"; settings: EmbroiderySettings };

export const PRINT_TREATMENT: ArtworkTreatment = { mode: "print" };

/**
 * A rasterised layer of the result.
 *
 * A canvas when the pipeline ran on the main thread, an `ImageBitmap` when it
 * ran in a worker and the layers came back across `postMessage`. Every
 * consumer — the Konva editor and the surface compositor — draws from these
 * through `drawImage`, which accepts all three.
 */
export type EmbroideryRaster = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

/** One thread colour and the stitches worked in it. */
export type ThreadRun = {
  /** sRGB hex of the thread. */
  colour: string;
  /**
   * Stitch endpoints as a flat Float32Array [x0,y0,x1,y1, ...] in EFFECT-RASTER
   * pixels. A typed array rather than an object per stitch: a 10cm logo at
   * production density is tens of thousands of stitches, and the object
   * overhead dominates both allocation time and GC pressure.
   */
  segments: Float32Array;
};

/**
 * The output of the stitch generator.
 *
 * `colour` / `normal` / `roughness` are canvases in the effect raster's own
 * resolution (derived from physical size, see `pxPerMm`). The compositor draws
 * them into a surface's texture canvases under the element's transform.
 */
export type EmbroideryResult = {
  widthPx: number;
  heightPx: number;
  /** Effect-raster resolution. widthPx / pxPerMm == physical width in mm. */
  pxPerMm: number;
  widthMm: number;
  heightMm: number;
  runs: ThreadRun[];
  stitchCount: number;
  colour: EmbroideryRaster;
  normal: EmbroideryRaster;
  roughness: EmbroideryRaster;
  /** Coverage mask: 255 where thread lies, used to key the fabric material. */
  mask: EmbroideryRaster;
  /** Warnings the customer should see (photo detail loss, colour count, ...). */
  notices: string[];
};

/** How suitable a source image is for stitching, reported honestly. */
export type EmbroideryAssessment = {
  distinctColours: number;
  reducedColours: number;
  /** Fraction of the artwork whose features are finer than one stitch row. */
  fineDetailFraction: number;
  notices: string[];
};
