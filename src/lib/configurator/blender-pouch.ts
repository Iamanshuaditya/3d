import manifest from "./generated/blender-pouch-v3.json";
import type { DielinePath, ProductConfig, SurfaceDieline } from "@/types/configurator";

export const BLENDER_POUCH = manifest;
const { editorWidth, editorHeight } = manifest.atlas;
const scalePath = (path: DielinePath): DielinePath => ({
  ...path,
  points: path.points.map((coordinate, index) => coordinate * (index % 2 === 0 ? editorWidth : editorHeight)),
});

// These are UV boundaries exported by Blender, never a separately authored die.
export const blenderPouchDieline: SurfaceDieline = {
  cuts: manifest.guides.cuts.map(scalePath),
  technical: manifest.guides.technical.map(scalePath),
  creases: manifest.guides.creases.map(scalePath),
  regions: manifest.panels.map((panel) => ({
    id: panel.id,
    label: panel.label,
    role: "artwork",
    x: panel.x * editorWidth,
    y: panel.y * editorHeight,
    width: panel.width * editorWidth,
    height: panel.height * editorHeight,
  })),
};

export const blenderPouchConfig: ProductConfig = {
  id: "blender-pouch-v3-preview",
  name: "Stand-up pouch · Blender master",
  family: "glb",
  modelUrl: `${manifest.modelUrl}?v=${manifest.sha256.slice(0, 12)}`,
  previewOnly: true,
  materialProfile: "satin-laminate",
  modelScale: 10,
  shadowY: 0,
  inflation: { targetName: manifest.inflationTarget, defaultValue: 1 },
  editableSurfaces: [{
    id: "blender-pouch-atlas",
    label: "Continuous pouch film",
    presentation: { kind: "print-area", order: 0 },
    meshName: manifest.meshName,
    editorWidth,
    editorHeight,
    physicalWidthCm: manifest.atlas.widthMm / 10,
    physicalHeightCm: manifest.atlas.heightMm / 10,
    displayUnit: "mm",
    defaultBackground: "#ffffff",
    textureFlipY: manifest.textureFlipY,
    renderModes: ["print"],
    dieline: blenderPouchDieline,
    sections: manifest.panels.map((panel) => ({
      id: panel.id,
      label: panel.label,
      meshName: manifest.meshName,
      xCm: panel.x * manifest.atlas.widthMm / 10,
      yCm: panel.y * manifest.atlas.heightMm / 10,
      widthCm: panel.width * manifest.atlas.widthMm / 10,
      heightCm: panel.height * manifest.atlas.heightMm / 10,
      contentRotation: panel.contentRotation,
    })),
  }],
  camera: {
    initial: [2.4, 1.9, 4.4], target: [0, 1.3, 0],
    minDistance: 2, maxDistance: 10,
    presets: [
      { id: "hero", label: "3/4", position: [2.4, 1.9, 4.4], target: [0, 1.3, 0] },
      { id: "front", label: "Front", position: [0, 1.3, 4.8], target: [0, 1.3, 0] },
      { id: "back", label: "Back", position: [0, 1.3, -4.8], target: [0, 1.3, 0] },
      { id: "side", label: "Side", position: [4.8, 1.3, 0], target: [0, 1.3, 0] },
      { id: "gusset", label: "Gusset", position: [1.4, -1.5, 2.5], target: [0, 0.35, 0] },
      { id: "bottom", label: "Underneath", position: [0, -2.8, 0.001], target: [0, 0, 0] },
    ],
  },
};

/** A downloadable drawing of the same guides displayed by the Studio canvas. */
export function blenderPouchGuideSvg(): string {
  const paths = (items: DielinePath[], stroke: string, dashed = false) => items.map((path) => {
    const points = path.points.reduce<string[]>((pairs, value, index) => {
      if (index % 2 === 0) pairs.push(`${value.toFixed(4)},${path.points[index + 1].toFixed(4)}`);
      return pairs;
    }, []).join(" ");
    return `<${path.closed ? "polygon" : "polyline"} points="${points}" fill="none" stroke="${stroke}" stroke-width="1.5"${dashed ? ' stroke-dasharray="8 5"' : ""}/>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${manifest.atlas.widthMm}mm" height="${manifest.atlas.heightMm}mm" viewBox="0 0 ${editorWidth} ${editorHeight}">
<title>Continuous pouch film — front, bottom gusset, back</title>
<desc>Authored visual artwork guides. Not a certified manufacturing dieline.</desc>
${paths(blenderPouchDieline.cuts, "#e84c78")}
${paths(blenderPouchDieline.technical ?? [], "#8991a3")}
${paths(blenderPouchDieline.creases, "#3e78d1", true)}
</svg>`;
}
