import type { CameraPreset, ProductConfig, SurfaceDieline } from "@/types/configurator";
import type { ArtworkRenderMode } from "@/types/embroidery";
import type { GlbArticulationSpec } from "@/types/unfold";
import cameraProductJson from "./generated/camera-001.product.json";
import pouch002ProductJson from "./generated/pouch-002.product.json";
import sodaCanJson from "./generated/soda-can.product.json";
import tinCanJson from "./generated/tin-can.product.json";
import wineBottleJson from "./generated/wine-bottle.product.json";
import shampooBottleJson from "./generated/shampoo-bottle.product.json";
import cosmeticJarJson from "./generated/cosmetic-jar.product.json";
import mugJson from "./generated/mug.product.json";
import tumblerJson from "./generated/tumbler.product.json";
import coffeeCupJson from "./generated/coffee-cup.product.json";
import cosmeticTubeJson from "./generated/cosmetic-tube.product.json";
import pillBottleJson from "./generated/pill-bottle.product.json";
import candleJarJson from "./generated/candle-jar.product.json";
import spiceJarJson from "./generated/spice-jar.product.json";
import waterBottleJson from "./generated/water-bottle.product.json";
import tshirtJson from "./generated/tshirt.product.json";
import counterDisplayJson from "./generated/counter-display.product.json";
import { kraftVisitingCardProduct } from "./kraft-visiting-card-spec";


type Vec3 = [number, number, number];

/**
 * Products onboarded by the product-onboarding pipeline are data, not code:
 * `product-onboarding/onboard.py build && integrate` emits a product.json that
 * this mapper turns into a ProductConfig. Adding an onboarded product =
 * one import + one PRODUCTS entry, no engine changes.
 */
function onboardedProduct(json: typeof cameraProductJson): ProductConfig {
  const toVec3 = (v: number[]): Vec3 => [v[0], v[1], v[2]];
  return {
    id: json.id,
    name: json.name,
    family: "glb",
    modelUrl: json.modelUrl,
    modelYOffset: json.modelYOffset,
    shadowY: json.shadowY,
    materialProfile: json.materialProfile as ProductConfig["materialProfile"],
    // Authored hinge graph, when the product declares one. Absent for every
    // product whose parts do not move.
    articulation: (json as { articulation?: GlbArticulationSpec }).articulation,
    editableSurfaces: json.editableSurfaces.map((s) => ({
      ...s,
      displayUnit: s.displayUnit as "mm" | "cm" | "in",
      // Generated JSONs are typed against one sample product; dieline and
      // sections vary per layout mode, so pass them through explicitly.
      dieline: (s as { dieline?: SurfaceDieline }).dieline,
      // Which reproduction methods this panel offers (print / embroidery).
      renderModes: (s as { renderModes?: ArtworkRenderMode[] }).renderModes,
    })),
    camera: {
      initial: toVec3(json.camera.initial),
      target: toVec3(json.camera.target),
      minDistance: json.camera.minDistance,
      maxDistance: json.camera.maxDistance,
      presets: json.camera.presets.map(
        (p): CameraPreset => ({
          id: p.id,
          label: p.label,
          position: toVec3(p.position),
          target: toVec3(p.target),
        }),
      ),
    },
  };
}

export const cameraProduct = onboardedProduct(cameraProductJson);
// Curated demo catalogue: non-standard-looking SKUs stay reachable by URL but
// hidden from the library (client-facing quality bar).
const HIDDEN_PRODUCT_IDS = new Set([
  "camera-001", "wine-bottle", "shampoo-bottle", "cosmetic-jar",
  "cosmetic-tube", "pill-bottle", "candle-jar", "spice-jar", "water-bottle",
]);
cameraProduct.hidden = HIDDEN_PRODUCT_IDS.has(cameraProduct.id);
export const pouch002Product = onboardedProduct(
  pouch002ProductJson as unknown as typeof cameraProductJson,
);
export const sodaCanProduct = onboardedProduct(sodaCanJson as unknown as typeof cameraProductJson);
sodaCanProduct.hidden = HIDDEN_PRODUCT_IDS.has(sodaCanProduct.id);
export const tinCanProduct = onboardedProduct(tinCanJson as unknown as typeof cameraProductJson);
tinCanProduct.hidden = HIDDEN_PRODUCT_IDS.has(tinCanProduct.id);
export const wineBottleProduct = onboardedProduct(wineBottleJson as unknown as typeof cameraProductJson);
wineBottleProduct.hidden = HIDDEN_PRODUCT_IDS.has(wineBottleProduct.id);
export const shampooBottleProduct = onboardedProduct(shampooBottleJson as unknown as typeof cameraProductJson);
shampooBottleProduct.hidden = HIDDEN_PRODUCT_IDS.has(shampooBottleProduct.id);
export const cosmeticJarProduct = onboardedProduct(cosmeticJarJson as unknown as typeof cameraProductJson);
cosmeticJarProduct.hidden = HIDDEN_PRODUCT_IDS.has(cosmeticJarProduct.id);
export const mugProduct = onboardedProduct(mugJson as unknown as typeof cameraProductJson);
mugProduct.hidden = HIDDEN_PRODUCT_IDS.has(mugProduct.id);
export const tumblerProduct = onboardedProduct(tumblerJson as unknown as typeof cameraProductJson);
tumblerProduct.hidden = HIDDEN_PRODUCT_IDS.has(tumblerProduct.id);
export const coffeeCupProduct = onboardedProduct(coffeeCupJson as unknown as typeof cameraProductJson);
coffeeCupProduct.hidden = HIDDEN_PRODUCT_IDS.has(coffeeCupProduct.id);
export const cosmeticTubeProduct = onboardedProduct(cosmeticTubeJson as unknown as typeof cameraProductJson);
cosmeticTubeProduct.hidden = HIDDEN_PRODUCT_IDS.has(cosmeticTubeProduct.id);
export const pillBottleProduct = onboardedProduct(pillBottleJson as unknown as typeof cameraProductJson);
pillBottleProduct.hidden = HIDDEN_PRODUCT_IDS.has(pillBottleProduct.id);
export const candleJarProduct = onboardedProduct(candleJarJson as unknown as typeof cameraProductJson);
candleJarProduct.hidden = HIDDEN_PRODUCT_IDS.has(candleJarProduct.id);
export const spiceJarProduct = onboardedProduct(spiceJarJson as unknown as typeof cameraProductJson);
spiceJarProduct.hidden = HIDDEN_PRODUCT_IDS.has(spiceJarProduct.id);
export const waterBottleProduct = onboardedProduct(waterBottleJson as unknown as typeof cameraProductJson);
waterBottleProduct.hidden = HIDDEN_PRODUCT_IDS.has(waterBottleProduct.id);
/**
 * Garment SKU. Onboarded through the same pipeline as every other product —
 * the chest print area is a face selection carved out of the shirt surface, so
 * it is genuinely part of the cloth rather than a decal floating above it.
 */
export const tshirtProduct = onboardedProduct(tshirtJson as unknown as typeof cameraProductJson);
/**
 * Articulated GLB reference product. Its parts are real 3D shapes rather than
 * a flat dieline, so it cannot be a procedural carton — but it still folds
 * flat, driven by the hinge graph authored alongside the model.
 */
export const counterDisplayProduct = onboardedProduct(
  counterDisplayJson as unknown as typeof cameraProductJson,
);


/**
 * Product catalogue (SYSTEM B input).
 *
 * Adding a product should require only: prepare the GLB with standard mesh
 * names, define the config below, register it in PRODUCTS. No engine changes.
 *
 * The bottle's label geometry has a circumference:height ratio of 4.004:1
 * (see scripts/generate-bottle-glb.mjs), so the editor canvas is 2048x512.
 * Matching these keeps artwork undistorted when wrapped onto the cylinder.
 */
export const bottleProduct: ProductConfig = {
  id: "bottle-001",
  name: "Standard Bottle",
  hidden: true,
  family: "glb",
  modelUrl: "/models/bottle.glb",
  modelYOffset: -0.5,
  editableSurfaces: [
    {
      id: "outside-label",
      label: "Label",
      meshName: "PRINT_AREA",
      editorWidth: 2048,
      editorHeight: 512,
      // Label wrap: circumference 2.042 model units, height 0.510 (see
      // scripts/generate-bottle-glb.mjs). Scaled to a 500ml bottle.
      physicalWidthCm: 25.0,
      physicalHeightCm: 6.2,
      guides: { bleed: 24, safeArea: 64 },
    },
  ],
  camera: {
    initial: [0, 0.2, 2.35],
    target: [0, 0.02, 0],
    minDistance: 0.9,
    maxDistance: 4,
    presets: [
      { id: "front", label: "Front", position: [0, 0.2, 2.35], target: [0, 0.02, 0] },
      { id: "back", label: "Back", position: [0, 0.2, -2.35], target: [0, 0.02, 0] },
      { id: "left", label: "Left", position: [-2.35, 0.2, 0], target: [0, 0.02, 0] },
      { id: "right", label: "Right", position: [2.35, 0.2, 0], target: [0, 0.02, 0] },
      { id: "top", label: "Top", position: [0, 2.3, 0.6], target: [0, 0.02, 0] },
    ],
  },
};

/**
 * Burger clamshell — no mesh file. Geometry is generated from the dieline in
 * carton-spec.ts, which is also what the editor canvas represents.
 * Editor canvas matches the 250 x 407 mm dieline aspect exactly.
 */
export const burgerBoxProduct: ProductConfig = {
  id: "burger-box-001",
  name: "Burger Box",
  family: "folded-carton",
  modelUrl: "",
  cartonSpecId: "burger-box",
  canOpen: true,
  modelYOffset: -0.35,
  editableSurfaces: [
    {
      id: "outside",
      label: "Outside",
      meshName: "BASE",
      editorWidth: 1250,
      editorHeight: 2035,
      physicalWidthCm: 25.0,
      physicalHeightCm: 40.7,
      guides: { bleed: 20, safeArea: 56 },
    },
  ],
  camera: {
    // The studio's 3D column is narrow (~400px), so horizontal FOV is the
    // binding constraint — framing is set from width, not height.
    initial: [2.6, 2.0, 3.3],
    target: [0, 0.15, 0],
    minDistance: 1.6,
    maxDistance: 9,
    presets: [
      { id: "front", label: "Front", position: [0, 1.4, 4.4], target: [0, 0.15, 0] },
      { id: "angle", label: "3/4", position: [2.6, 2.0, 3.3], target: [0, 0.15, 0] },
      { id: "side", label: "Side", position: [4.4, 1.3, 0], target: [0, 0.15, 0] },
      { id: "top", label: "Top", position: [0, 4.6, 1.2], target: [0, 0.15, 0] },
    ],
  },
};

/**
 * VistaPrint stand-up pouch selected by the supplied Studio URL. The editor is
 * the complete horizontal production web: back + bottom gusset + front.
 */
export const pouchProduct: ProductConfig = {
  id: "pouch-001",
  name: "Stand-Up Pouch 3.25×4.75×2 in",
  family: "glb",
  modelUrl: "/models/vistaprint-stand-up-pouch-3.25x4.75x2.glb",
  pouchSpecId: "pouch-3.25x4.75x2",
  modelYOffset: 0,
  modelScale: 10,
  shadowY: -0.823,
  materialProfile: "clear-barrier-gloss",
  editableSurfaces: [
    {
      id: "film",
      label: "Printed film",
      meshName: "front",
      meshNames: ["front", "bottom", "back"],
      // The source GLB's own 200-DPI production texture is 2332 × 650.
      editorWidth: 2332,
      editorHeight: 650,
      physicalWidthCm: 29.6098,
      physicalHeightCm: 8.255,
      displayUnit: "in",
      // Vortex composites the transparent design document over solid white
      // before the canvas is uploaded to the GLB. This prevents empty pixels
      // from sampling as black while retaining the clear-barrier gloss response.
      defaultBackground: "#ffffff",
      // Exact Calcifer panel-section metadata for ProductVersion 15.
      sections: [
        {
          id: "front-flap",
          label: "front",
          meshName: "front",
          xCm: 0.2,
          yCm: 0,
          widthCm: 12.0726,
          heightCm: 8.255,
          contentRotation: -90,
        },
        {
          id: "bottom-gusset",
          label: "bottom",
          meshName: "bottom",
          xCm: 12.2726,
          yCm: 0,
          widthCm: 5.0833,
          heightCm: 8.255,
          contentRotation: -90,
        },
        {
          id: "back-flap",
          label: "back",
          meshName: "back",
          xCm: 17.3559,
          yCm: 0,
          widthCm: 12.0725,
          heightCm: 8.255,
          contentRotation: 90,
        },
      ],
    },
  ],
  camera: {
    initial: [0.92, 0.08, 4.62],
    target: [0, 0, 0],
    minDistance: 2.5,
    maxDistance: 12,
    presets: [
      { id: "front", label: "Front", position: [0, 0.06, 4.7], target: [0, 0, 0] },
      { id: "angle", label: "3/4", position: [0.92, 0.08, 4.62], target: [0, 0, 0] },
      { id: "back", label: "Back", position: [0, 0.06, -4.7], target: [0, 0, 0] },
      { id: "side", label: "Side", position: [4.7, 0.06, 0], target: [0, 0, 0] },
      { id: "top", label: "Top", position: [0, 4.55, 0.82], target: [0, 0, 0] },
    ],
  },
};

/**
 * Meshy pouch converted from its single packed texture atlas into three named,
 * independently printable meshes. The preparation script keeps every source
 * triangle while generating clean planar 0–1 UVs for front, back and gusset.
 */
export const meshyPouchProduct: ProductConfig = {
  id: "meshy-pouch-001",
  name: "Meshy Stand-Up Pouch",
  family: "glb",
  modelUrl: "/models/meshy-stand-up-pouch-print-ready.glb?uv=normals-v2",
  pouchSpecId: "meshy-pouch-160x240x90",
  modelYOffset: 0,
  shadowY: -1.015,
  materialProfile: "glossy-laminate",
  editableSurfaces: [
    {
      id: "film",
      label: "Printed film",
      meshName: "FRONT_PRINT",
      meshNames: ["FRONT_PRINT", "BOTTOM_PRINT", "BACK_PRINT"],
      editorWidth: 2296,
      editorHeight: 640,
      physicalWidthCm: 57.4,
      physicalHeightCm: 16,
      displayUnit: "cm",
      defaultBackground: "#ffffff",
      sections: [
        {
          id: "front-panel",
          label: "front",
          meshName: "FRONT_PRINT",
          xCm: 0.2,
          yCm: 0,
          widthCm: 24,
          heightCm: 16,
          contentRotation: 0,
          textureRotation: -90,
        },
        {
          id: "bottom-gusset",
          label: "bottom",
          meshName: "BOTTOM_PRINT",
          xCm: 24.2,
          yCm: 0,
          widthCm: 9,
          heightCm: 16,
          contentRotation: 0,
          textureRotation: -90,
        },
        {
          id: "back-panel",
          label: "back",
          meshName: "BACK_PRINT",
          xCm: 33.2,
          yCm: 0,
          widthCm: 24,
          heightCm: 16,
          contentRotation: 0,
          textureRotation: 90,
        },
      ],
    },
  ],
  camera: {
    initial: [0.72, 0.04, 4.25],
    target: [0, -0.02, 0],
    minDistance: 2.25,
    maxDistance: 10,
    presets: [
      { id: "front", label: "Front", position: [0, 0, 4.25], target: [0, -0.02, 0] },
      { id: "angle", label: "3/4", position: [0.72, 0.04, 4.25], target: [0, -0.02, 0] },
      { id: "back", label: "Back", position: [0, 0, -4.25], target: [0, -0.02, 0] },
      { id: "side", label: "Side", position: [4.25, 0, 0], target: [0, -0.02, 0] },
      { id: "bottom", label: "Bottom", position: [0, -4, 0.65], target: [0, -0.35, 0] },
    ],
  },
};


/**
 * Flagship mailer box — FEFCO 0427-style roll-end tray, folded live from
 * mailer-box-spec.ts. The editor canvas IS the manufacturing dieline
 * (bleed/trim/crease), Pacdora-grade by construction.
 */
export const mailerBoxProduct: ProductConfig = {
  id: "mailer-box-001",
  name: "Mailer Box 240\u00d7160\u00d760 mm",
  family: "folded-carton",
  modelUrl: "",
  cartonSpecId: "mailer-box",
  canOpen: true,
  materialProfile: "kraft-corrugated",
  printProfileId: "vortex-carton-works-coated-offset-v1",
  modelYOffset: -0.28,
  editableSurfaces: [
    {
      id: "outside",
      label: "Outside",
      meshName: "BASE",
      editorWidth: 1128,
      editorHeight: 1662,
      physicalWidthCm: 37.6,
      physicalHeightCm: 55.4,
      guides: { bleed: 9, safeArea: 24 },
      defaultBackground: "#ad8352",
      // Panel sections in dieline centimetres. contentRotation is the
      // printer-authored orientation: panels whose dieline-up faces the box
      // front/down receive 180 so placed artwork reads upright when folded.
      sections: [
        { id: "lid", label: "Lid", meshName: "LID_TOP", xCm: 6.8, yCm: 5.0, widthCm: 24, heightCm: 16, contentRotation: 180 },
        { id: "front", label: "Front", meshName: "FRONT", xCm: 6.8, yCm: 43.0, widthCm: 24, heightCm: 6, contentRotation: 180 },
        { id: "back", label: "Back", meshName: "BACK", xCm: 6.8, yCm: 21.0, widthCm: 24, heightCm: 6, contentRotation: 0 },
        { id: "base", label: "Base", meshName: "BASE", xCm: 6.8, yCm: 27.0, widthCm: 24, heightCm: 16, contentRotation: 0 },
        // The blank is flipped before folding, so the side panel drawn on the
        // RIGHT of the printed sheet becomes the box's LEFT wall. Panel ids
        // and labels name the wall's final position on the product, which is
        // what the customer means by "left side"; the xCm is where that panel
        // lives on the sheet. See `toUv` in carton-geometry.ts.
        { id: "left", label: "Left side", meshName: "LEFT", xCm: 30.8, yCm: 27.0, widthCm: 6, heightCm: 16, contentRotation: 90 },
        { id: "right", label: "Right side", meshName: "RIGHT", xCm: 0.8, yCm: 27.0, widthCm: 6, heightCm: 16, contentRotation: -90 },
      ],
    },
  ],
  camera: {
    initial: [3.9, 3.0, 5.0],
    target: [0, 0.05, 0],
    minDistance: 1.8,
    // The unfolded blank is 376x554 mm, a 3.34-unit bounding radius, which
    // needs 13.81 units to frame at the studio padding. A 12-unit ceiling
    // clamped the flat pose and clipped the dieline off the viewport.
    maxDistance: 16,
    presets: [
      { id: "front", label: "Front", position: [0, 1.6, 5.9], target: [0, 0.05, 0] },
      { id: "angle", label: "3/4", position: [3.4, 2.6, 4.4], target: [0, 0.05, 0] },
      { id: "top", label: "Top", position: [0, 6.2, 1.6], target: [0, 0.05, 0] },
      { id: "side", label: "Side", position: [5.9, 1.6, 0], target: [0, 0.05, 0] },
    ],
  },
};


/** Hidden engine test: the PARAMETRIC pouch body (no GLB). */
export const genPouchTest: ProductConfig = {
  id: "gen-pouch-test",
  name: "Generated Pouch (engine test)",
  family: "pouch",
  modelUrl: "",
  pouchSpecId: "pouch-3.25x4.75x2",
  hidden: true,
  modelYOffset: 0,
  editableSurfaces: [
    {
      id: "film", label: "Printed film", meshName: "POUCH",
      editorWidth: 2332, editorHeight: 650,
      physicalWidthCm: 29.6098, physicalHeightCm: 8.255,
      defaultBackground: "#ffffff",
    },
  ],
  camera: {
    initial: [1.4, 0.3, 8.2], target: [0, 0, 0], minDistance: 2, maxDistance: 24,
    presets: [
      { id: "front", label: "Front", position: [0, 0.1, 8.6], target: [0, 0, 0] },
      { id: "angle", label: "3/4", position: [1.4, 0.3, 8.2], target: [0, 0, 0] },
    ],
  },
};


/**
 * Product entries for the parametric pouch family. Everything — canvas size,
 * sections, camera — derives from the spec, so a new pouch SKU is one line in
 * generatedPouchSpecs plus nothing here.
 */
import { generatedPouchSpecs } from "./pouch-spec";
import { styledWebLayout } from "./pouch-geometry";
import { resolvePouchProductionWeb } from "./pouch-production-web";
import type { PouchSpec } from "@/types/pouch";

const PX_PER_MM = 4;

function generatedPouchProduct(spec: PouchSpec): ProductConfig {
  const style = spec.style ?? "stand_up";
  const measuredWeb = resolvePouchProductionWeb(spec);
  let webWmm: number;
  let webHmm: number;
  let sections: NonNullable<ProductConfig["editableSurfaces"][number]["sections"]>;
  if (measuredWeb) {
    webWmm = measuredWeb.widthMm;
    webHmm = measuredWeb.repeatMm;
    sections = measuredWeb.segments.flatMap((segment) => {
      if (segment.role === "technical") return [];
      return [{
        id: segment.role,
        label: segment.label,
        meshName: "POUCH",
        xCm: 0,
        yCm: segment.startMm / 10,
        widthCm: measuredWeb.widthMm / 10,
        heightCm: segment.lengthMm / 10,
        contentRotation: segment.artworkOrientationDeg ?? 0,
      }];
    });
  } else if (style === "stand_up") {
    webWmm = spec.height * 2 + spec.gusset + spec.dielineBleed * 2;
    webHmm = spec.width;
    sections = [
      { id: "back", label: "Back", meshName: "POUCH", xCm: spec.dielineBleed / 10, yCm: 0, widthCm: spec.height / 10, heightCm: spec.width / 10, contentRotation: 90 },
      { id: "bottom", label: "Bottom", meshName: "POUCH", xCm: (spec.dielineBleed + spec.height) / 10, yCm: 0, widthCm: spec.gusset / 10, heightCm: spec.width / 10, contentRotation: 90 },
      { id: "front", label: "Front", meshName: "POUCH", xCm: (spec.dielineBleed + spec.height + spec.gusset) / 10, yCm: 0, widthCm: spec.height / 10, heightCm: spec.width / 10, contentRotation: -90 },
    ];
  } else {
    const layout = styledWebLayout(spec);
    const margin = spec.dielineBleed + 2;
    webWmm = layout.webW + 2 * margin;
    webHmm = layout.webH + 2 * margin;
    const labels: Record<string, string> = { front: "Front", back: "Back", left: "Left gusset", right: "Right gusset" };
    sections = layout.columns.map((c) => ({
      id: c.id,
      label: labels[c.id] ?? c.id,
      meshName: "POUCH",
      xCm: (c.x0 + margin) / 10,
      yCm: margin / 10,
      widthCm: c.w / 10,
      heightCm: spec.height / 10,
      contentRotation: 0,
    }));
  }
  const h = (spec.height * 0.01) / 2;
  const dist = Math.max(spec.width * 1.35, spec.height) * 0.01 * 3.2;
  return {
    id: spec.id,
    name: spec.name,
    family: "pouch",
    modelUrl: "",
    pouchSpecId: spec.id,
    modelYOffset: spec.proceduralModel ? 0 : -h,
    shadowY: -h - 0.002,
    materialProfile: "glossy-laminate",
    editableSurfaces: [
      {
        id: "film",
        label: "Printed film",
        meshName: "POUCH",
        ...(measuredWeb
          ? { presentation: { kind: "continuous-web" as const, order: 1 } }
          : {}),
        sections,
        editorWidth: Math.round(webWmm * PX_PER_MM),
        editorHeight: Math.round(webHmm * PX_PER_MM),
        physicalWidthCm: webWmm / 10,
        physicalHeightCm: webHmm / 10,
        displayUnit: measuredWeb ? "mm" : "cm",
        defaultBackground: "#ffffff",
        ...(measuredWeb
          ? {}
          : {
              guides: {
                bleed: Math.round(spec.dielineBleed * PX_PER_MM),
                safeArea: Math.round((spec.dielineBleed + 4) * PX_PER_MM),
              },
            }),
      },
    ],
    camera: {
      initial: [dist * 0.42, 0.14, dist],
      target: [0, 0, 0],
      minDistance: dist * 0.4,
      maxDistance: dist * 3.4,
      presets: [
        { id: "front", label: "Front", position: [0, 0.05, dist * 1.06], target: [0, 0, 0] },
        { id: "angle", label: "3/4", position: [dist * 0.42, 0.14, dist], target: [0, 0, 0] },
        { id: "back", label: "Back", position: [0, 0.05, -dist * 1.06], target: [0, 0, 0] },
        { id: "side", label: "Side", position: [dist * 1.06, 0.05, 0], target: [0, 0, 0] },
      ],
    },
  };
}

export const generatedPouchProducts: ProductConfig[] = generatedPouchSpecs.map(generatedPouchProduct);

export const PRODUCTS: Record<string, ProductConfig> = {
  [kraftVisitingCardProduct.id]: kraftVisitingCardProduct,
  [bottleProduct.id]: bottleProduct,
  [burgerBoxProduct.id]: burgerBoxProduct,
  [mailerBoxProduct.id]: mailerBoxProduct,
  [genPouchTest.id]: genPouchTest,
  ...Object.fromEntries(generatedPouchProducts.map((p) => [p.id, p])),
  [pouchProduct.id]: pouchProduct,
  [meshyPouchProduct.id]: meshyPouchProduct,
  [cameraProduct.id]: cameraProduct,
  [pouch002Product.id]: pouch002Product,
  [sodaCanProduct.id]: sodaCanProduct,
  [tinCanProduct.id]: tinCanProduct,
  [wineBottleProduct.id]: wineBottleProduct,
  [shampooBottleProduct.id]: shampooBottleProduct,
  [cosmeticJarProduct.id]: cosmeticJarProduct,
  [mugProduct.id]: mugProduct,
  [tumblerProduct.id]: tumblerProduct,
  [coffeeCupProduct.id]: coffeeCupProduct,
  [cosmeticTubeProduct.id]: cosmeticTubeProduct,
  [pillBottleProduct.id]: pillBottleProduct,
  [candleJarProduct.id]: candleJarProduct,
  [spiceJarProduct.id]: spiceJarProduct,
  [waterBottleProduct.id]: waterBottleProduct,
  [tshirtProduct.id]: tshirtProduct,
  [counterDisplayProduct.id]: counterDisplayProduct,
};

export function getProduct(id: string): ProductConfig | undefined {
  return PRODUCTS[id];
}

export const DEFAULT_PRODUCT_ID = bottleProduct.id;
