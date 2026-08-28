import type {
  DielinePath,
  DielineRegion,
  EditableSection,
  EditableSurface,
  ProductConfig,
  SurfaceDieline,
} from "@/types/configurator";
import type { DielineLine, DielinePanel, PouchLabSolution } from "./types";

export const PACDORA_LAB_STUDIO_SURFACE_ID = "pacdora-lab-film-web";
export const PACDORA_LAB_EDITOR_PX_PER_MM = 2;

function linePath(line: DielineLine, scale: number): DielinePath {
  return {
    points: [line.x1 * scale, line.y1 * scale, line.x2 * scale, line.y2 * scale],
    closed: false,
  };
}

function panelRegion(panel: DielinePanel, scale: number): DielineRegion {
  return {
    id: panel.id,
    label: panel.label,
    role: panel.role === "film" ? "artwork" : "technical",
    x: panel.x * scale,
    y: panel.y * scale,
    width: panel.width * scale,
    height: panel.height * scale,
  };
}

function sectionFor(panel: DielinePanel): EditableSection {
  return {
    id: panel.id,
    label: panel.label,
    meshName: panel.id,
    xCm: panel.x / 10,
    yCm: panel.y / 10,
    widthCm: panel.width / 10,
    heightCm: panel.height / 10,
    contentRotation: 0,
  };
}

export function createPacdoraLabStudioDieline(
  solution: PouchLabSolution,
): SurfaceDieline {
  const scale = PACDORA_LAB_EDITOR_PX_PER_MM;
  const width = solution.web.width * scale;
  const height = solution.web.height * scale;
  return {
    cuts: [{
      points: [0, 0, width, 0, width, height, 0, height],
      closed: true,
    }],
    creases: solution.lines
      .filter((line) => line.kind === "crease")
      .map((line) => linePath(line, scale)),
    technical: solution.lines
      .filter((line) => line.kind === "seal")
      .map((line) => linePath(line, scale)),
    regions: solution.panels.map((panel) => panelRegion(panel, scale)),
  };
}

/**
 * Adapts the procedural web to the exact editor engine used by `/studio`.
 * The complete film repeat is one surface, so an object placed on Front can
 * be dragged across the fold into Bottom gusset or Back without being clipped
 * at a region boundary. Regions remain snap targets and upload destinations.
 */
export function createPacdoraLabStudioConfig(
  solution: PouchLabSolution,
): ProductConfig {
  const scale = PACDORA_LAB_EDITOR_PX_PER_MM;
  const orderedPanels = [
    solution.panels.find((panel) => panel.id === "front-film"),
    solution.panels.find((panel) => panel.id === "bottom-gusset"),
    solution.panels.find((panel) => panel.id === "back-film"),
    ...solution.panels.filter((panel) => ![
      "front-film",
      "bottom-gusset",
      "back-film",
    ].includes(panel.id)),
  ].filter((panel): panel is DielinePanel => Boolean(panel));
  const surface: EditableSurface = {
    id: PACDORA_LAB_STUDIO_SURFACE_ID,
    label: "Continuous pouch film web",
    presentation: { kind: "continuous-web", order: 0 },
    meshName: "front-film",
    meshNames: solution.panels.map((panel) => panel.id),
    sections: orderedPanels.map(sectionFor),
    editorWidth: Math.round(solution.web.width * scale),
    editorHeight: Math.round(solution.web.height * scale),
    physicalWidthCm: solution.web.width / 10,
    physicalHeightCm: solution.web.height / 10,
    displayUnit: "mm",
    defaultBackground: "#ffffff",
    renderModes: ["print"],
    dieline: createPacdoraLabStudioDieline(solution),
  };

  return {
    id: "pacdora-lab-studio-preview",
    name: "Procedural pouch Studio preview",
    family: "pouch",
    modelUrl: "",
    previewOnly: true,
    materialProfile: "standard",
    editableSurfaces: [surface],
    camera: {
      initial: [0, 0, 5],
      target: [0, 0, 0],
      minDistance: 2,
      maxDistance: 12,
      presets: [],
    },
  };
}
