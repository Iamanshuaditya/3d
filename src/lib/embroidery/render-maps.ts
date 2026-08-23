import type { EmbroiderySettings, ThreadRun } from "@/types/embroidery";
import { context2d, domCanvasFactory, type CanvasFactory, type RasterSurface } from "./canvas";

/**
 * Turns a stitch plan into the material maps the renderer consumes.
 *
 * Approach B of the three evaluated (see docs/research/EMBROIDERY_RESEARCH.md):
 * the stitches are rasterised once into a HEIGHT field, and colour / normal /
 * roughness are all derived from it. That is what makes the result respond to
 * light like thread rather than like a printed noise pattern — the ridges,
 * the crossings and the shadow between rows are all real surface data, not a
 * baked-in shadow that stays put when the product turns.
 */

export type EmbroideryMaps = {
  colour: RasterSurface;
  normal: RasterSurface;
  roughness: RasterSurface;
  mask: RasterSurface;
};

/** One path per thread colour, so 50 000 stitches cost 50 000 lineTos, not 50 000 draws. */
function strokeRuns(
  context: CanvasRenderingContext2D,
  runs: ThreadRun[],
  lineWidth: number,
  colourFor: (run: ThreadRun) => string,
) {
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(0.6, lineWidth);
  for (const run of runs) {
    context.beginPath();
    const { segments } = run;
    for (let i = 0; i < segments.length; i += 4) {
      context.moveTo(segments[i], segments[i + 1]);
      context.lineTo(segments[i + 2], segments[i + 3]);
    }
    context.strokeStyle = colourFor(run);
    context.stroke();
  }
}

export function renderEmbroideryMaps(
  runs: ThreadRun[],
  width: number,
  height: number,
  pxPerMm: number,
  settings: EmbroiderySettings,
  createCanvas: CanvasFactory = domCanvasFactory,
): EmbroideryMaps {
  const threadPx = Math.max(1, settings.threadWidthMm * pxPerMm);

  // ---- height: thread bodies, then a brighter core so each strand reads ----
  const heightCanvas = createCanvas(width, height);
  const heightContext = context2d(heightCanvas, { willReadFrequently: true });
  heightContext.fillStyle = "#000000";
  heightContext.fillRect(0, 0, width, height);
  heightContext.globalCompositeOperation = "lighter";
  strokeRuns(heightContext, runs, threadPx, () => "rgba(120,120,120,1)");
  strokeRuns(heightContext, runs, threadPx * 0.42, () => "rgba(96,96,96,1)");
  heightContext.globalCompositeOperation = "source-over";
  const heightData = heightContext.getImageData(0, 0, width, height).data;

  // ---- mask ----
  const maskCanvas = createCanvas(width, height);
  const maskContext = context2d(maskCanvas);
  maskContext.fillStyle = "#000000";
  maskContext.fillRect(0, 0, width, height);
  strokeRuns(maskContext, runs, threadPx, () => "#ffffff");

  // ---- roughness: thread is smoother than the cloth it sits on ----
  const roughnessCanvas = createCanvas(width, height);
  const roughnessContext = context2d(roughnessCanvas);
  const threadRoughness = Math.round((1 - settings.sheen * 0.55) * 255);
  roughnessContext.fillStyle = "#f2f2f2";
  roughnessContext.fillRect(0, 0, width, height);
  strokeRuns(
    roughnessContext,
    runs,
    threadPx,
    () => `rgb(${threadRoughness},${threadRoughness},${threadRoughness})`,
  );

  // ---- colour: flat thread, then shaded by the height field ----
  const colourCanvas = createCanvas(width, height);
  const colourContext = context2d(colourCanvas, { willReadFrequently: true });
  colourContext.clearRect(0, 0, width, height);
  strokeRuns(colourContext, runs, threadPx, (run) => run.colour);
  const colourData = colourContext.getImageData(0, 0, width, height);

  // ---- normal from height, and bake a light touch of the same relief into
  // the 2D colour so the flat editor preview also reads as thread ----
  const normalCanvas = createCanvas(width, height);
  const normalContext = context2d(normalCanvas);
  const normalData = normalContext.createImageData(width, height);
  const strength = settings.reliefMm * pxPerMm * 0.09;

  const heightAt = (x: number, y: number) => {
    const cx = Math.min(width - 1, Math.max(0, x));
    const cy = Math.min(height - 1, Math.max(0, y));
    return heightData[(cy * width + cx) * 4] / 255;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const dx = heightAt(x + 1, y) - heightAt(x - 1, y);
      // Canvas y runs down, glTF normal maps are +Y up, hence the sign.
      const dy = heightAt(x, y - 1) - heightAt(x, y + 1);
      let nx = -dx * strength;
      let ny = -dy * strength;
      const nz = 1;
      const inverse = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inverse;
      ny *= inverse;
      normalData.data[index] = Math.round((nx * 0.5 + 0.5) * 255);
      normalData.data[index + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalData.data[index + 2] = Math.round((nz * inverse * 0.5 + 0.5) * 255);
      normalData.data[index + 3] = 255;

      if (colourData.data[index + 3] > 0) {
        // Light from the upper left, the direction the editor's own UI implies.
        // Kept gentle: in 3D the same relief is already shading the thread
        // through the normal map, and a heavy bake here would both double it
        // and clip saturated thread colours toward white.
        const shade = 1 + (nx * 0.34 - ny * 0.22) * 0.85;
        colourData.data[index] = Math.min(255, colourData.data[index] * shade);
        colourData.data[index + 1] = Math.min(255, colourData.data[index + 1] * shade);
        colourData.data[index + 2] = Math.min(255, colourData.data[index + 2] * shade);
      }
    }
  }
  normalContext.putImageData(normalData, 0, 0);
  colourContext.putImageData(colourData, 0, 0);

  return {
    colour: colourCanvas,
    normal: normalCanvas,
    roughness: roughnessCanvas,
    mask: maskCanvas,
  };
}
