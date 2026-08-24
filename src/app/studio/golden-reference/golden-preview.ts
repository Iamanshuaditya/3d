import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { CartonSpec } from "@/types/carton";
import type { ProductConfig } from "@/types/configurator";
import {
  applyLockBottomGoldenSourceProfile,
  buildPlanarGraph,
  classifyLockBottomGoldenGeometry,
  classifyLockBottomGoldenHinges,
  compileLockBottomGoldenConstruction,
  createGoldenReferenceRecreationCandidate,
  createStructuralDiagnosticArtwork,
  evaluateLockBottomGoldenAcceptance,
  extractStructuralPanels,
  importVectorPdfRawAuthority,
  inspectStructuralConstruction,
  LOCK_BOTTOM_WINDOW_TOPOLOGY_PROFILE,
  resolveStructuralRig,
  type CanonicalDieline,
  type CompiledGoldenConstruction,
  type GoldenReferenceClosureVariant,
  type GoldenReferenceTopSide,
  type ResolvedStructuralRig,
  type StructuralPanel,
} from "@/lib/structure";

/**
 * One shared server-side pipeline for the private golden reference routes.
 *
 * The interactive preview and the fixed-camera capture route must resolve the
 * identical dieline, candidate, construction and rig — otherwise a capture would
 * not be evidence about the thing the preview shows.
 */
export type GoldenPreviewOptions = Readonly<{
  physicalTop: GoldenReferenceTopSide;
  closureVariant: GoldenReferenceClosureVariant;
  boardThicknessMm: number;
}>;

export type GoldenPreviewSuccess = Readonly<{
  ok: true;
  config: ProductConfig;
  dieline: CanonicalDieline;
  panels: readonly StructuralPanel[];
  compiled: CompiledGoldenConstruction;
  rig: ResolvedStructuralRig;
  artworkSvg: string;
  candidateId: string;
  sourceSha256: string;
}>;

export type GoldenPreviewFailure = Readonly<{ ok: false; message: string }>;
export type GoldenPreviewResult = GoldenPreviewSuccess | GoldenPreviewFailure;

export const GOLDEN_PDF_ENV_HINT =
  "VORTEX_GOLDEN_REFERENCE_PDF=/absolute/path/to/product_Lock\\ Bottom\\ and\\ top\\ incl.\\ window_mm_300_150_200.pdf npm run dev";

export function parseTop(value: string | undefined): GoldenReferenceTopSide {
  return value === "south" ? "south" : "north";
}

export function parseClosure(value: string | undefined): GoldenReferenceClosureVariant {
  return value === "window-final" ? "window-final" : "plain-final";
}

export function parseThickness(value: string | undefined): number {
  if (!value) return 0.6;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10 ? parsed : 0.6;
}

export async function buildGoldenPreview(
  options: GoldenPreviewOptions,
): Promise<GoldenPreviewResult> {
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      message:
        "This route is intentionally disabled in production because it consumes licensed/private benchmark evidence from a local filesystem path.",
    };
  }

  const pdfPath = process.env.VORTEX_GOLDEN_REFERENCE_PDF;
  if (!pdfPath) {
    return {
      ok: false,
      message:
        "Set VORTEX_GOLDEN_REFERENCE_PDF to the authorized local PDF before starting the development server. The PDF and its source vectors are never committed or exposed as a public catalogue product.",
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(pdfPath));
  } catch (error) {
    return {
      ok: false,
      message: `The configured golden PDF could not be read (${error instanceof Error ? error.message : "unknown filesystem error"}).`,
    };
  }

  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");

  try {
    const dieline = await importVectorPdfRawAuthority(bytes, {
      id: "cloudlab-lock-bottom-window-300x150x200",
      sourceName: "authorized-local-golden-reference.pdf",
      sourceSha256,
      rules: [
        { operation: "cut", spotName: "DieCutBlue" },
        { operation: "crease", spotName: "DieCutRed" },
      ],
      ignoredSpotNames: ["DieCutGreen"],
      metadata: {
        productName: "Lock Bottom and top incl. window",
        nominalDimensions: "300 x 150 x 200 mm",
        authority: "authorized-local-vector-pdf",
      },
    });

    const acceptance = evaluateLockBottomGoldenAcceptance(dieline);
    if (!acceptance.passed) {
      return {
        ok: false,
        message: "The configured file failed the source-locked golden geometric acceptance gates.",
      };
    }

    const profiled = applyLockBottomGoldenSourceProfile(dieline);
    const graph = buildPlanarGraph(profiled.topologyDieline);
    const panels = extractStructuralPanels(dieline, graph);
    const inventory = inspectStructuralConstruction(dieline, graph, panels);
    const geometryRoles = classifyLockBottomGoldenGeometry(dieline, panels);
    const hingeRoles = classifyLockBottomGoldenHinges(geometryRoles, inventory);
    const candidate = createGoldenReferenceRecreationCandidate(geometryRoles, hingeRoles, {
      physicalTop: options.physicalTop,
      closureVariant: options.closureVariant,
      boardThicknessMm: options.boardThicknessMm,
    });
    const compiled = compileLockBottomGoldenConstruction(
      dieline.id,
      geometryRoles,
      hingeRoles,
      candidate.input,
    );

    const rig = resolveStructuralRig(dieline, graph, panels, compiled.construction);
    if (rig.hinges.length !== 16 || panels.length !== 17) {
      return {
        ok: false,
        message:
          "Golden reference preflight no longer resolves the reviewed 17-panel / 16-hinge structure.",
      };
    }

    const cartonSpec: CartonSpec = {
      id: "golden-reference-local",
      name: "Golden Reference Recreation",
      width: dieline.widthMm,
      height: dieline.heightMm,
      boardThickness: compiled.construction.boardThicknessMm,
      panels: [],
      lidClosedAngle: 0,
      lidOpenAngle: 0,
      structural: {
        dieline,
        topology: LOCK_BOTTOM_WINDOW_TOPOLOGY_PROFILE,
        construction: compiled.construction,
      },
      unfold: compiled.unfold,
    };

    const editorHeight = 1000;
    const editorWidth = Math.max(
      1,
      Math.round(editorHeight * (dieline.widthMm / dieline.heightMm)),
    );

    const config: ProductConfig = {
      id: "golden-reference-local",
      configurationId: `reference:${candidate.id}:${sourceSha256.slice(0, 12)}`,
      name: `Golden Reference — ${candidate.id} — VISUAL RECREATION`,
      family: "folded-carton",
      modelUrl: "",
      cartonSpec,
      modelRotation: [
        compiled.modelRotationRad[0],
        compiled.modelRotationRad[1],
        compiled.modelRotationRad[2],
      ],
      // Built live from a private local PDF, so it has no published catalogue
      // row. Without this the Studio blocks on "product is not published" and
      // artwork upload never unlocks.
      previewOnly: true,
      modelYOffset: 1.5,
      shadowY: 0,
      materialProfile: "standard",
      editableSurfaces: [
        {
          id: "outside",
          label: "Outside — canonical full sheet",
          presentation: { kind: "continuous-web", order: 0 },
          meshName: "STRUCTURAL_PACKAGE_ROOT",
          editorWidth,
          editorHeight,
          physicalWidthCm: dieline.widthMm / 10,
          physicalHeightCm: dieline.heightMm / 10,
          displayUnit: "cm",
          guides: { bleed: 0, safeArea: 0 },
          defaultBackground: "#ffffff",
        },
      ],
      camera: {
        // This product changes extent by ~3.7x between poses: a 200 x 150 x 300 mm
        // carton unfolds into a 742 x 500 mm sheet. In the portrait preview the
        // effective horizontal field is only ~21deg, so the flat sheet needs
        // roughly 20 units of distance — the old 12-unit ceiling made it
        // impossible to see. autoFrame keeps the pivot on the body and re-fits
        // the distance whenever the fold changes the model's extent.
        autoFrame: true,
        initial: [5.4, 5.0, 7.2],
        target: [0, 1.5, 0],
        minDistance: 2.2,
        maxDistance: 30,
        presets: [
          { id: "fixed-reference", label: "Reference", position: [4.8, 4.0, 5.2], target: [0, 1.5, 0] },
          { id: "front", label: "Front", position: [0, 2.2, 6.0], target: [0, 1.5, 0] },
          { id: "side", label: "Side", position: [6.0, 2.2, 0], target: [0, 1.5, 0] },
          { id: "top", label: "Top", position: [0, 7.0, 0.8], target: [0, 1.5, 0] },
        ],
      },
    };

    return {
      ok: true,
      config,
      dieline,
      panels,
      compiled,
      rig,
      artworkSvg: createStructuralDiagnosticArtwork(dieline, panels),
      candidateId: candidate.id,
      sourceSha256,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Golden reference compilation failed closed: ${error instanceof Error ? error.message : "unknown structural error"}.`,
    };
  }
}
