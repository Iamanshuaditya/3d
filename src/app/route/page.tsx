import { redirect } from "next/navigation";
import { studioHref, type StudioSearchParams } from "@/lib/projects/location";

export default async function RootAliasPage({
  searchParams,
}: {
  searchParams: Promise<StudioSearchParams>;
}) {
  redirect(studioHref(await searchParams));
}
