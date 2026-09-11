import { redirect } from "next/navigation";
import { DEFAULT_PRODUCT_ID } from "@/lib/configurator/product-config";
import { studioHref, type StudioSearchParams } from "@/lib/projects/location";

export default async function LegacyStudioPage({ searchParams }: {
  searchParams: Promise<StudioSearchParams>;
}) {
  const selection = await searchParams;
  redirect(studioHref({ ...selection, product: selection.product ?? DEFAULT_PRODUCT_ID }));
}
