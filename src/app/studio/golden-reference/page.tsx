import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";
import type { ProductConfig } from "@/types/configurator";
import type { CartonSpec } from "@/types/carton";
import {
  applyLockBottomGoldenSourceProfile,
  buildPlanarGraph,
  classifyLockBottomGoldenGeometry,
  classifyLockBottomGoldenHinges,
  compileLockBottomGoldenConstruction,
  createGoldenReferenceRecreationCandidate,
  evaluateLockBottomGoldenAcceptance,
  extractStructuralPanels,
  importVectorPdfRawAuthority,
  inspectStructuralConstruction,
  LOCK_BOTTOM_WINDOW_TOPOLOGY_PROFILE,
  resolveStructuralRig,
  type GoldenReferenceClosureVariant,
  type GoldenReferenceTopSide,
} from "@/lib/structure";

export const metadata: Metadata = {
  title: "Golden Structural Reference",
  description: "Private development-only recreation of the authorized structural carton reference.",
};

export const dynamic = "force-dynamic";

function disabled(message: string) {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-24">
      <h1 className="text-[24px] font-semibold tracking-tight text-[var(--st-text)]">
        Golden reference preview unavailable
      </h1>
      <p className="mt-3 text-[15px] leading-[1.7] text-[var(--st-dim)]">{message}</p>
      <pre className="mt-6 overflow-auto rounded-xl border border-[var(--st-line)] bg-[var(--st-raised)] p-4 text-[12px] leading-[1.6] text-[var(--st-text)]">
        VORTEX_GOLDEN_REFERENCE_PDF=/absolute/path/to/product_Lock\ Bottom\ and\ top\ incl.\ window_mm_300_150_200.pdf npm run dev
      </pre>
    </main>
  );
}

function parseTop(value: string | undefined): GoldenReferenceTopSide {
  return value === "south" ? "south" : "north";
}

function parseClosure(value: string | undefined): GoldenReferenceClosureVariant {
  return value === "window-final" ? "window-final" : "plain-final";
}

function parseThickness(value: string | undefined): number {
  if (!value) return 0.6;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10 ? parsed : 0.6;
}

export default async function GoldenReferenceStudioPage({
  searchParams,
}: {
  searchParams: Promise<{
    top?: string;
    closure?: string;
    thickness?: string;
  }>;
}) {
  if (process.env.NODE_ENV === "production") {
    return disabled(
      "This route is intentionally disabled in production because it consumes licensed/private benchmark evidence from a local filesystem path.",
    );
  }

  const pdfPath = process.env.VORTEX_GOLDEN_REFERENCE_PDF;
  if (!pdfPath) {
    return disabled(
      "Set VORTEX_GOLDEN_REFERENCE_PDF to the authorized local PDF before starting the development server. The PDF and its source vectors are never committed or exposed as a public catalogue product.",
    );
  }

  const query = await searchParams;
  const physicalTop = parseTop(query.top);
  const closureVariant = parseClosure(query.closure);
  const boardThicknessMm = parseThickness(query.thickness);

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(pdfPath));
  } catch (error) {
    return disabled(
      `The configured golden PDF could not be read (${error instanceof Error ? error.message : "unknown filesystem error"}).`,
    );
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    const dieline = await importVectorPdfRawAuthority(bytes, {
      id: "cloudlab-lock-bottom-window-300x150x200",
      sourceName: "authorized-local-golden-reference.pdf",
      sourceSha256: sha256,
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
      return disabled("The configured file failed the source-locked golden geometric acceptance gates.");
    }

    const profiled = applyLockBottomGoldenSourceProfile(dieline);
    const graph = buildPlanarGraph(profiled.topologyDieline);
    const panels = extractStructuralPanels(dieline, graph);
    const inventory = inspectStructuralConstruction(dieline, graph, panels);
    const geometryRoles = classifyLockBottomGoldenGeometry(dieline, panels);
    const hingeRoles = classifyLockBottomGoldenHinges(geometryRoles, inventory);
    const candidate = createGoldenReferenceRecreationCandidate(geometryRoles, hingeRoles, {
      physicalTop,
      closureVariant,
      boardThicknessMm,
    });
    const compiled = compileLockBottomGoldenConstruction(
      dieline.id,
      geometryRoles,
      hingeRoles,
      candidate.input,
    );

    // Resolve once on the server as a hard preflight. The client resolves the
    // same source-locked authority again when it builds the exact Three.js tree.
    const resolvedRig = resolveStructuralRig(dieline, graph, panels, compiled.construction);
    if (resolvedRig.hinges.length !== 16 || panels.length !== 17) {
      return disabled("Golden reference preflight no longer resolves the reviewed 17-panel / 16-hinge structure.");
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
    const editorWidth = Math.max(1, Math.round(editorHeight * (dieline.widthMm / dieline.heightMm)));
    const config: ProductConfig = {
      id: "golden-reference-local",
      configurationId: `reference:${candidate.id}:${sha256.slice(0, 12)}`,
      name: `Golden Reference — ${candidate.id} — VISUAL RECREATION`,
      family: "folded-carton",
      modelUrl: "",
      cartonSpec,
      modelRotation: [
        compiled.modelRotationRad[0],
        compiled.modelRotationRad[1],
        compiled.modelRotationRad[2],
      ],
      // The 300 mm body is centered around the structural origin after the
      // fixed quarter-turn, so +1.5 scene units places its lower edge at y=0.
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
        initial: [4.8, 4.0, 5.2],
        target: [0, 1.5, 0],
        minDistance: 2.2,
        maxDistance: 12,
        presets: [
          { id: "fixed-reference", label: "Reference", position: [4.8, 4.0, 5.2], target: [0, 1.5, 0] },
          { id: "front", label: "Front", position: [0, 2.2, 6.0], target: [0, 1.5, 0] },
          { id: "side", label: "Side", position: [6.0, 2.2, 0], target: [0, 1.5, 0] },
          { id: "top", label: "Top", position: [0, 7.0, 0.8], target: [0, 1.5, 0] },
        ],
      },
    };

    return (
      <StudioShell
        key={config.configurationId}
        config={config}
        presentationMode="packaging"
        catalogue={[{ id: config.id, name: config.name }]}
        requestedProjectId={null}
      />
    );
  } catch (error) {
    return disabled(
      `Golden reference compilation failed closed: ${error instanceof Error ? error.message : "unknown structural error"}.`,
    );
  }
}
