import type { Metadata } from "next";
import { statSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { PRODUCTS } from "@/lib/configurator/product-config";
import { modelFilePath, summarize } from "@/lib/configurator/product-summary";
import { ProductGallery, type GalleryItem } from "@/components/gallery/ProductGallery";

export const metadata: Metadata = {
  title: "Product library",
  description: "Every 3D product registered in the studio, previewed live.",
};

/** Mesh weight is read from disk so the library reports what a card costs. */
function modelBytes(modelUrl: string): number | null {
  const path = modelFilePath(modelUrl);
  if (!path) return null;
  try {
    return statSync(join(process.cwd(), "public", path)).size;
  } catch {
    return null;
  }
}

export default function LibraryPage() {
  const items: GalleryItem[] = Object.values(PRODUCTS).filter((config) => !config.hidden).map((config) => ({
    config,
    summary: summarize(config, modelBytes(config.modelUrl)),
  }));

  const meshCount = items.filter((item) => item.summary.modelBytes !== null).length;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-10 border-b border-[var(--st-line)] pb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--st-faint)]">
          Studio
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-tight text-[var(--st-text)] sm:text-[40px]">
            Product library
          </h1>
          <Link
            href="/designs"
            className="rounded-lg bg-[var(--st-raised)] px-4 py-2.5 text-[13px] font-semibold text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)]"
          >
            My designs
          </Link>
        </div>
        <p className="mt-3 max-w-[54ch] text-[15px] leading-[1.6] text-[var(--st-dim)]">
          Every product registered in the configurator, rendered from the same
          meshes and material response the editor uses. Pick one to start
          designing.
        </p>
        <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[var(--st-faint)]">
          <span>
            {items.length} product{items.length === 1 ? "" : "s"}
          </span>
          <span>{meshCount} mesh files</span>
          <span>{items.length - meshCount} generated from a dieline</span>
        </p>
      </header>

      <ProductGallery items={items} />
    </main>
  );
}
