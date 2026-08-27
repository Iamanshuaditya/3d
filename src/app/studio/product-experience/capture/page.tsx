import type { Metadata } from "next";
import { ProductExperienceCaptureStage } from "@/components/studio/ProductExperienceCaptureStage";
import { getProduct } from "@/lib/configurator/product-config";
import {
  buildProductExperienceMatrix,
  findProductExperienceCapture,
  findProductExperienceFixture,
} from "@/lib/qa/product-experience";

export const metadata: Metadata = {
  title: "Product Experience Capture",
  description:
    "Deterministic capture stage for the customer-experience regression benchmark.",
};

export const dynamic = "force-dynamic";

const DEFAULT_WIDTH_PX = 1440;
const DEFAULT_HEIGHT_PX = 900;

function parseSize(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 320 && parsed <= 4096
    ? Math.round(parsed)
    : fallback;
}

function unavailable(message: string) {
  return (
    <main data-capture-ready="false" className="mx-auto max-w-[760px] px-6 py-24">
      <h1 className="text-[22px] font-semibold tracking-tight">
        Product experience capture unavailable
      </h1>
      <p className="mt-3 text-[15px] leading-[1.7] opacity-70">{message}</p>
      <p className="mt-6 text-[13px] opacity-60">
        Known captures: {buildProductExperienceMatrix().map((entry) => entry.id).join(", ")}
      </p>
    </main>
  );
}

export default async function ProductExperienceCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ capture?: string; width?: string; height?: string }>;
}) {
  const query = await searchParams;
  const captureId = query.capture ?? "";
  const capture = findProductExperienceCapture(captureId);
  if (!capture) {
    return unavailable(`Unknown capture id "${captureId}".`);
  }

  const fixture = findProductExperienceFixture(capture.fixtureId);
  if (!fixture) {
    return unavailable(`Capture ${captureId} names an unregistered fixture.`);
  }

  const config = getProduct(capture.productId);
  if (!config) {
    return unavailable(
      `Capture ${captureId} needs product ${capture.productId}, which is not in the catalogue.`,
    );
  }
  if (config.editableSurfaces.length === 0) {
    return unavailable(`Product ${capture.productId} declares no editable surface.`);
  }

  return (
    <ProductExperienceCaptureStage
      captureId={capture.id}
      config={config}
      stateId={capture.stateId}
      artwork={fixture.artwork}
      label={fixture.id.toUpperCase()}
      widthPx={parseSize(query.width, DEFAULT_WIDTH_PX)}
      heightPx={parseSize(query.height, DEFAULT_HEIGHT_PX)}
    />
  );
}
