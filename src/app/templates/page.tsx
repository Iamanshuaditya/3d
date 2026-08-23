import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TemplateBrowser } from "@/components/templates/TemplateBrowser";
import { getProduct } from "@/lib/configurator/product-config";
import { getProductCatalogService } from "@/server/products/container";

export const metadata: Metadata = {
  title: "Choose a design",
  description: "Start blank or customize an editable design template.",
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: productId } = await searchParams;
  const product = productId ? getProduct(productId) : undefined;
  if (!product) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="text-2xl font-semibold text-[var(--st-text)]">Choose a product first</h1>
        <Link href="/" className="mt-5 inline-flex text-[14px] font-medium text-[var(--st-accent)]">
          Return to product library
        </Link>
      </main>
    );
  }
  const resolved = await getProductCatalogService().resolve(product.id, null, {});

  return (
    <main className="mx-auto w-full max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[var(--st-line)] pb-7">
        <Link href="/" className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--st-dim)] hover:text-[var(--st-text)]">
          <ArrowLeft className="h-4 w-4" /> Product library
        </Link>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--st-faint)]">
          {product.name}
        </p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-[var(--st-text)] sm:text-[40px]">
          Choose your starting point
        </h1>
        <p className="mt-3 max-w-[58ch] text-[15px] leading-6 text-[var(--st-dim)]">
          Start blank or use an editable template. Template text, placement, and personalization remain normal Studio layers.
        </p>
      </header>
      <TemplateBrowser
        productId={product.id}
        productName={product.name}
        productVersionId={resolved.productVersionId}
        configurationId={resolved.configurationId}
        optionSelection={resolved.selection}
      />
    </main>
  );
}
