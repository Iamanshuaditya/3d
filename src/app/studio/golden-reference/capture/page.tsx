import type { Metadata } from "next";
import { GoldenReferenceCaptureStage } from "@/components/studio/GoldenReferenceCaptureStage";
import {
  buildGoldenReferenceCapturePlan,
  findGoldenReferenceCapture,
} from "@/lib/configurator/golden-reference-captures";
import { createCanonicalSheetSvg } from "@/lib/structure";
import {
  buildGoldenPreview,
  GOLDEN_PDF_ENV_HINT,
  parseClosure,
  parseThickness,
  parseTop,
} from "../golden-preview";

export const metadata: Metadata = {
  title: "Golden Reference Capture",
  description: "Private fixed-camera capture stage for golden reference visual verification.",
};

export const dynamic = "force-dynamic";

const DEFAULT_WIDTH_PX = 1600;
const DEFAULT_HEIGHT_PX = 1000;

function parseSize(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 320 && parsed <= 4096 ? Math.round(parsed) : fallback;
}

function unavailable(message: string) {
  return (
    <main data-capture-ready="false" className="mx-auto max-w-[760px] px-6 py-24">
      <h1 className="text-[22px] font-semibold tracking-tight">Golden reference capture unavailable</h1>
      <p className="mt-3 text-[15px] leading-[1.7] opacity-70">{message}</p>
      <pre className="mt-6 overflow-auto rounded-xl border p-4 text-[12px] leading-[1.6]">
        {GOLDEN_PDF_ENV_HINT}
      </pre>
    </main>
  );
}

export default async function GoldenReferenceCapturePage({
  searchParams,
}: {
  searchParams: Promise<{
    capture?: string;
    top?: string;
    closure?: string;
    thickness?: string;
    width?: string;
    height?: string;
  }>;
}) {
  const query = await searchParams;
  const preview = await buildGoldenPreview({
    physicalTop: parseTop(query.top),
    closureVariant: parseClosure(query.closure),
    boardThicknessMm: parseThickness(query.thickness),
  });

  if (!preview.ok) return unavailable(preview.message);

  const capturePlan = buildGoldenReferenceCapturePlan(
    preview.compiled.unfold,
    preview.rig.articulatedHinges,
  );
  const captureId = query.capture ?? "02-flat-3d";
  const capture = findGoldenReferenceCapture(capturePlan, captureId);
  if (!capture) {
    return unavailable(
      `Unknown capture id "${captureId}". Expected one of ${capturePlan.captures
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }
  if (capturePlan.planErrors.length > 0) {
    return unavailable(`Golden reference unfold plan is invalid: ${capturePlan.planErrors.join("; ")}`);
  }

  const widthPx = parseSize(query.width, DEFAULT_WIDTH_PX);
  const heightPx = parseSize(query.height, DEFAULT_HEIGHT_PX);

  // The canonical 2D capture is the source dieline itself, not a 3D render.
  // The markup is generated server-side from numeric canonical geometry and
  // XML-escaped internal ids; no request, user or file-supplied text reaches it.
  if (capture.kind === "canonical-2d") {
    const svg = createCanonicalSheetSvg(preview.dieline, { artworkSvg: preview.artworkSvg });
    return (
      <main
        data-capture-id={capture.id}
        data-capture-ready="true"
        className="bg-white"
        style={{ width: widthPx, height: heightPx }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <GoldenReferenceCaptureStage
      config={preview.config}
      pose={capture.pose}
      pairedPose={capture.pairedPose}
      artworkSvg={preview.artworkSvg}
      captureId={capture.id}
      widthPx={widthPx}
      heightPx={heightPx}
    />
  );
}
