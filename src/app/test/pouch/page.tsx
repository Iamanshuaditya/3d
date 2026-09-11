import { redirect } from "next/navigation";
import { blenderPouchConfig } from "@/lib/configurator/blender-pouch";
import { studioHref, type StudioSearchParams } from "@/lib/projects/location";

export default async function LegacyPouchPage({ searchParams }: {
  searchParams: Promise<StudioSearchParams>;
}) {
  redirect(studioHref({ ...await searchParams, product: blenderPouchConfig.id }));
}
