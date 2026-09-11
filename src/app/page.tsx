import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, Box } from "lucide-react";
import { ProductGallery, type GalleryItem } from "@/components/gallery/ProductGallery";
import { FEATURED_PRODUCTS } from "@/lib/configurator/library-showcase";
import { getProductCatalogService } from "@/server/products/container";
import { AccountControl } from "@/components/auth/AccountControl";
import { StudioEntry } from "@/components/studio/StudioEntry";
import type { StudioSearchParams } from "@/lib/projects/location";

export async function generateMetadata({ searchParams }: {
  searchParams: Promise<StudioSearchParams>;
}): Promise<Metadata> {
  const selection = await searchParams;
  return {
    title: selection.product || selection.project ? "Packaging Studio" : "Product library · Vortex Studio",
    description: "Choose a product, design its artwork and preview it in one shared Studio.",
  };
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<StudioSearchParams>;
}) {
  const selection = await searchParams;
  if (selection.product || selection.project) {
    return <StudioEntry searchParams={selection} />;
  }
  const catalog = getProductCatalogService();
  const visibleIds = new Set((await catalog.listDefinitions())
    .filter((definition) => definition.currentVersionId && definition.visibility === "public")
    .map((definition) => definition.id));
  const resolvedItems = await Promise.all(
    FEATURED_PRODUCTS.filter((feature) => visibleIds.has(feature.productId)).map(async (feature) => {
      try {
        await catalog.resolve(feature.productId, null, {});
        return { feature };
      } catch (error) {
        console.warn(JSON.stringify({
          scope: "vortex-platform",
          event: "product.library-resolution-failed",
          productId: feature.productId,
          message: error instanceof Error ? error.message : "Unknown error",
        }));
        return null;
      }
    }),
  );
  const items = resolvedItems.filter((item): item is GalleryItem => item !== null);

  return (
    <div className="mx-auto w-full max-w-[1328px] px-5 sm:px-8 lg:px-12">
      <a href="#products" className="sr-only z-50 rounded-lg bg-white p-3 text-sm font-medium focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
        Skip to products
      </a>
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--st-line)] py-4">
        <Link href="/" aria-label="Vortex Studio home" className="inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-accent)] focus-visible:ring-offset-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--st-text)] text-white">
            <Box aria-hidden="true" className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Vortex <span className="font-normal text-[var(--st-dim)]">Studio</span></span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-4 sm:gap-7">
          <a href="#products" className="hidden text-[13px] font-medium underline-offset-4 hover:underline sm:block">Products</a>
          <Link href="/developers" className="hidden text-[13px] font-medium text-[var(--st-dim)] underline-offset-4 hover:underline lg:block">Developers</Link>
          <div className="flex items-center gap-3">
            <Link
              href="/designs"
              className="inline-flex min-h-9 items-center text-[13px] font-medium underline-offset-4 hover:underline"
            >
              My designs
            </Link>
            <AccountControl />
          </div>
        </nav>
      </header>

      <main>
        <section aria-labelledby="library-title" className="grid gap-7 py-10 sm:py-12 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:gap-16">
          <div>
            <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--st-dim)]">The product library</p>
            <h1 id="library-title" className="text-[40px] font-medium leading-[1.06] tracking-[-0.045em] sm:text-[56px] lg:text-[64px]">
              Great products.<br />Ready for your ideas.
            </h1>
          </div>
          <div className="max-w-[37ch] lg:pb-1">
            <p className="text-[15px] leading-relaxed text-[var(--st-dim)] sm:text-base">
              Packaging made personal. Choose your canvas, add your artwork, and see it come to life in 3D.
            </p>
            <a href="#products" className="mt-6 inline-flex min-h-11 items-center gap-5 rounded-full bg-[var(--st-text)] px-5 text-sm font-medium text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--st-accent)]">
              Explore products <ArrowDown aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section id="products" aria-labelledby="products-title" className="scroll-mt-6 border-t border-[var(--st-line)] pb-14 pt-7 sm:pb-20">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <h2 id="products-title" className="text-lg font-semibold tracking-tight">Find your next canvas</h2>
            <nav aria-label="Product categories" className="flex flex-wrap gap-x-5 gap-y-2">
              {items.map(({ feature }) => (
                <a key={feature.slug} href={`#${feature.slug}`} className="inline-flex min-h-9 items-center text-[13px] font-medium text-[var(--st-dim)] underline-offset-4 hover:text-[var(--st-text)] hover:underline">
                  {feature.category}
                </a>
              ))}
            </nav>
          </div>
          {items.length > 0 ? <ProductGallery items={items} /> : (
            <p className="rounded-2xl bg-[var(--st-raised)] p-8 text-sm text-[var(--st-dim)]">Products are temporarily unavailable. Please try again shortly.</p>
          )}
        </section>

        <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-6 border-t border-[var(--st-line)] py-12 sm:py-16">
          <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
            <h2 id="how-it-works-title" className="text-2xl font-medium tracking-tight sm:text-3xl">From blank to yours.</h2>
            <a href="#products" className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold underline-offset-4 hover:underline">Start creating <ArrowRight aria-hidden="true" className="h-4 w-4" /></a>
          </div>
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-10">
            {[
              { title: "Choose a product", description: "Find the right starting point for your idea." },
              { title: "Make it your own", description: "Add artwork, colours, and the details that make it yours." },
              { title: "See every side", description: "Explore your design in the interactive 3D editor." },
            ].map((step, index) => (
              <li key={step.title} className="border-t border-[var(--st-line)] pt-5">
                <span aria-hidden="true" className="font-mono text-xs text-[var(--st-dim)]">0{index + 1}</span>
                <h3 className="mb-2 mt-4 text-base font-semibold">{step.title}</h3>
                <p className="max-w-[30ch] text-sm leading-relaxed text-[var(--st-dim)]">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--st-line)] py-7 text-xs text-[var(--st-dim)]">
        <span>Vortex Studio</span>
        <span>A little imagination. A new dimension.</span>
      </footer>
    </div>
  );
}
