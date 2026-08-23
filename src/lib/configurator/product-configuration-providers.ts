import type { CartonPanel, CartonSpec } from "@/types/carton";
import type { EditableSection, ProductConfig } from "@/types/configurator";
import type {
  ProductConfigurationProvider,
  ResolvedOptionValue,
} from "@/platform/products/types";
import { ProductDomainError } from "@/platform/products/errors";
import { createMailerBoxSpec } from "./mailer-box-spec";
import { mailerBoxProduct } from "./product-config";

export const MAILER_BOX_PROVIDER_ID = "mailer-box-0427-v1";
const EDITOR_PIXELS_PER_MM = 3;

function productionNumber(
  options: Readonly<Record<string, ResolvedOptionValue>>,
  optionId: string,
) {
  const value = options[optionId]?.productionValue;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Resolved mailer option ${optionId} is not a finite number.`);
  }
  return value;
}

function panel(spec: CartonSpec, id: string): CartonPanel {
  const value = spec.panels.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Resolved mailer structure is missing ${id}.`);
  return value;
}

function section(
  spec: CartonSpec,
  input: {
    id: string;
    label: string;
    sourcePanelId: string;
    meshName: string;
    contentRotation: number;
  },
): EditableSection {
  const rect = panel(spec, input.sourcePanelId).rect;
  return {
    id: input.id,
    label: input.label,
    meshName: input.meshName,
    xCm: rect.x / 10,
    yCm: rect.y / 10,
    widthCm: rect.w / 10,
    heightCm: rect.h / 10,
    contentRotation: input.contentRotation,
  };
}

/**
 * Resolves a parameterized mailer into the unchanged engine-facing contract.
 * The embedded CartonSpec is the only physical structure consumed by Studio,
 * Three.js, unfolding, PDF, and manufacturing exporters.
 */
export const mailerBoxConfigurationProvider: ProductConfigurationProvider = {
  resolve({ options }) {
    const lengthMm = productionNumber(options, "length");
    const widthMm = productionNumber(options, "width");
    const depthMm = productionNumber(options, "depth");
    const boardThicknessMm = productionNumber(options, "board_thickness");
    if (lengthMm < widthMm || depthMm * 2 > widthMm) {
      throw new ProductDomainError(
        "CONFIGURATION_UNMANUFACTURABLE",
        "Mailer length must be at least its width, and depth cannot exceed half the width for this construction.",
      );
    }
    const spec = createMailerBoxSpec({
      lengthMm,
      widthMm,
      depthMm,
      boardThicknessMm,
      layoutMarginMm: 8,
    });
    const config: ProductConfig = structuredClone(mailerBoxProduct);
    const longestAssembledSide = Math.max(lengthMm, widthMm, depthMm) * 0.01;
    const cameraDistance = Math.max(3.4, longestAssembledSide * 2.45);
    const modelYOffset = -(depthMm * 0.01) * (0.28 / 0.6);

    config.name = spec.name;
    config.cartonSpecId = spec.id;
    config.cartonSpec = spec;
    config.modelYOffset = modelYOffset;
    config.editableSurfaces = [
      {
        id: "outside",
        label: "Outside",
        presentation: { kind: "continuous-web", order: 1 },
        meshName: "BASE",
        editorWidth: Math.round(spec.width * EDITOR_PIXELS_PER_MM),
        editorHeight: Math.round(spec.height * EDITOR_PIXELS_PER_MM),
        physicalWidthCm: spec.width / 10,
        physicalHeightCm: spec.height / 10,
        displayUnit: "cm",
        guides: {
          bleed: 3 * EDITOR_PIXELS_PER_MM,
          safeArea: 8 * EDITOR_PIXELS_PER_MM,
        },
        defaultBackground: "#ad8352",
        sections: [
          section(spec, { id: "lid", label: "Lid", sourcePanelId: "LID_TOP", meshName: "LID_TOP", contentRotation: 180 }),
          section(spec, { id: "front", label: "Front", sourcePanelId: "FRONT", meshName: "FRONT", contentRotation: 180 }),
          section(spec, { id: "back", label: "Back", sourcePanelId: "BACK", meshName: "BACK", contentRotation: 0 }),
          section(spec, { id: "base", label: "Base", sourcePanelId: "BASE", meshName: "BASE", contentRotation: 0 }),
          // Outside-print chirality flips the blank before folding: the final
          // left wall samples the right-hand dieline panel and vice versa.
          section(spec, { id: "left", label: "Left side", sourcePanelId: "RIGHT", meshName: "LEFT", contentRotation: 90 }),
          section(spec, { id: "right", label: "Right side", sourcePanelId: "LEFT", meshName: "RIGHT", contentRotation: -90 }),
        ],
      },
    ];
    config.camera = {
      initial: [cameraDistance * 0.58, cameraDistance * 0.48, cameraDistance * 0.82],
      target: [0, modelYOffset + depthMm * 0.0045, 0],
      minDistance: Math.max(1.2, cameraDistance * 0.3),
      maxDistance: Math.max(12, cameraDistance * 2.4),
      presets: [
        { id: "front", label: "Front", position: [0, cameraDistance * 0.28, cameraDistance], target: [0, modelYOffset + depthMm * 0.0045, 0] },
        { id: "angle", label: "3/4", position: [cameraDistance * 0.58, cameraDistance * 0.48, cameraDistance * 0.82], target: [0, modelYOffset + depthMm * 0.0045, 0] },
        { id: "top", label: "Top", position: [0, cameraDistance * 1.08, cameraDistance * 0.28], target: [0, modelYOffset + depthMm * 0.0045, 0] },
        { id: "side", label: "Side", position: [cameraDistance, cameraDistance * 0.28, 0], target: [0, modelYOffset + depthMm * 0.0045, 0] },
      ],
    };
    return config;
  },
};

export const PRODUCT_CONFIGURATION_PROVIDERS: Readonly<
  Record<string, ProductConfigurationProvider>
> = {
  [MAILER_BOX_PROVIDER_ID]: mailerBoxConfigurationProvider,
};
