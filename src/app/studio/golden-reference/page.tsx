import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";
import {
  buildGoldenPreview,
  GOLDEN_PDF_ENV_HINT,
  parseClosure,
  parseThickness,
  parseTop,
} from "./golden-preview";

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
        {GOLDEN_PDF_ENV_HINT}
      </pre>
    </main>
  );
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
  const query = await searchParams;
  const preview = await buildGoldenPreview({
    physicalTop: parseTop(query.top),
    closureVariant: parseClosure(query.closure),
    boardThicknessMm: parseThickness(query.thickness),
  });

  if (!preview.ok) return disabled(preview.message);

  return (
    <StudioShell
      key={preview.config.configurationId}
      config={preview.config}
      presentationMode="packaging"
      catalogue={[{ id: preview.config.id, name: preview.config.name }]}
      requestedProjectId={null}
    />
  );
}
