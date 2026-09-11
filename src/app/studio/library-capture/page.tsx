import Link from "next/link";
import { notFound } from "next/navigation";
import { LibraryCapture } from "@/components/gallery/LibraryCapture";
import { FEATURED_PRODUCTS } from "@/lib/configurator/library-showcase";
import { getProductCatalogService } from "@/server/products/container";

export default async function LibraryCapturePage({ searchParams }: {
  searchParams: Promise<{ product?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { product } = await searchParams;
  const feature = FEATURED_PRODUCTS.find((entry) => entry.productId === product) ?? FEATURED_PRODUCTS[0];
  const { productConfig } = await getProductCatalogService().resolve(feature.productId, null, {});
  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold">Library preview capture</h1>
      <nav className="my-4 flex gap-5" aria-label="Capture products">
        {FEATURED_PRODUCTS.map((entry) => <Link key={entry.productId} href={`/studio/library-capture?product=${entry.productId}`} className="underline">{entry.name}</Link>)}
      </nav>
      <LibraryCapture key={feature.productId} config={productConfig} />
    </main>
  );
}
