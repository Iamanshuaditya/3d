import type { Metadata } from "next";
import { EditorialLanding } from "@/components/editorial/EditorialLanding";
import { StudioEntry } from "@/components/studio/StudioEntry";
import { getEditorialCatalog } from "@/server/products/editorial-catalog";
import type { StudioSearchParams } from "@/lib/projects/location";

export async function generateMetadata({ searchParams }: {searchParams: Promise<StudioSearchParams>}): Promise<Metadata> {
  const selection = await searchParams;
  return {
    title: selection.product || selection.project ? "Packaging Studio" : "Vortex Studio · Good packaging starts with a great idea",
    description: "Design packaging in your browser. Choose a mailer box, stand-up pouch, or coffee cup and bring your artwork to life in 3D.",
  };
}

export default async function HomePage({searchParams}: {searchParams: Promise<StudioSearchParams>}) {
  const selection = await searchParams;
  if (selection.product || selection.project) return <StudioEntry searchParams={selection} />;
  return <EditorialLanding products={await getEditorialCatalog()} />;
}