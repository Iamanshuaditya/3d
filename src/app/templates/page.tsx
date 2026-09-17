import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { EditorialHeader, EditorialFooter } from "@/components/editorial/EditorialHeader";
import { editorialProduct } from "@/lib/editorial/products";
import { ArrowLeft } from "lucide-react";
import { TemplateBrowser } from "@/components/templates/TemplateBrowser";
import { ProductOptionConfigurator } from "@/components/products/ProductOptionConfigurator";
import { parseOptionSelection } from "@/platform/products/configuration-resolver";
import { ProductDomainError } from "@/platform/products/errors";
import type { OptionSelection, ResolvedProductConfiguration } from "@/platform/products/types";
import { getProductCatalogService } from "@/server/products/container";

export const metadata: Metadata = {
  title: "Choose a design",
  description: "Start blank or customize an editable design template.",
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; options?: string }>;
}) {
  const { product: productId, options: encodedOptions } = await searchParams;
  if (!productId) {
    redirect("/products");
  }
  const catalog = getProductCatalogService();
  let selection: OptionSelection = {};
  let resolutionError: string | null = null;
  try {
    selection = parseOptionSelection(encodedOptions ? JSON.parse(encodedOptions) : {});
  } catch {
    selection = {};
    resolutionError = "The product options in this URL are invalid.";
  }
  let resolved: ResolvedProductConfiguration;
  try {
    resolved = await catalog.resolve(productId, null, selection);
  } catch (error) {
    resolutionError = error instanceof ProductDomainError
      ? error.message
      : "That product configuration could not be resolved.";
    try {
      resolved = await catalog.resolve(productId, null, {});
    } catch {
      return (
        <main className="mx-auto max-w-xl px-6 py-24">
          <h1 className="text-2xl font-semibold text-[var(--st-text)]">Product unavailable</h1>
          <p className="mt-3 text-[15px] leading-6 text-[var(--st-dim)]">{resolutionError}</p>
          <Link href="/" className="mt-5 inline-flex text-[14px] font-medium text-[var(--st-accent)]">
            Return to product library
          </Link>
        </main>
      );
    }
  }
  const version = await catalog.currentVersion(productId);
  const editorial = editorialProduct(productId);
  const surface = resolved.productConfig.editableSurfaces[0];
  const physicalLabel = surface
    ? `Print sheet ${(surface.physicalWidthCm * 10).toFixed(0)} × ${(surface.physicalHeightCm * 10).toFixed(0)} mm`
    : "Resolved product";

  return (
    <div className="editorial-page editorial-setup">
    <EditorialHeader />
    <main className="mx-auto w-full max-w-[1440px] px-6 py-10 sm:px-12 sm:py-14">
      <header data-rise className="mb-8 border-b border-[var(--st-line)] pb-7">
        <Link href={`/products/${productId}`} className="editorial-back inline-flex items-center gap-2 text-[13px] font-medium text-[var(--st-dim)]">
          <ArrowLeft className="h-4 w-4" /> Product details
        </Link>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--st-faint)]">
          {resolved.productConfig.name}
        </p>
        <h1 className="mt-2 text-5xl font-normal tracking-tight text-[var(--st-text)] sm:text-6xl">
          Make it <em className="font-normal">yours.</em>
        </h1>
        <p className="mt-3 max-w-[58ch] text-[15px] leading-6 text-[var(--st-dim)]">
          Choose your size and starting point. Add your artwork, type, and finishing touches in the studio.
        </p>
      </header>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
      {version.definition.options.length > 0 && (
        <ProductOptionConfigurator
          key={`options:${resolved.configurationId}`}
          productName={resolved.productConfig.name}
          options={version.definition.options}
          selection={resolved.selection}
          configurationId={resolved.configurationId}
          physicalLabel={physicalLabel}
          errorMessage={resolutionError}
        />
      )}
      <TemplateBrowser
        key={`templates:${resolved.configurationId}`}
        productId={productId}
        productName={resolved.productConfig.name}
        productVersionId={resolved.productVersionId}
        configurationId={resolved.configurationId}
        optionSelection={resolved.selection}
      />
      </div>
      <aside data-reveal="up" className="border border-[var(--st-line)] bg-[var(--st-surface)] lg:sticky lg:top-8">
        {editorial && <span className="editorial-thumb block"><Image src={editorial.hero} alt={editorial.name} width={640} height={480} className="aspect-[4/3] w-full object-cover" /></span>}
        <div className="p-6">
          <p className="text-[10px] uppercase tracking-[0.2em]">Your canvas</p>
          <h2 className="mt-3 text-3xl">{resolved.productConfig.name}</h2>
          <p className="mt-4 text-sm text-[var(--st-dim)]">{physicalLabel}</p>
          <p className="mt-5 border-t border-[var(--st-line)] pt-5 text-sm leading-6 text-[var(--st-dim)]">Your design stays editable. Preview it in the studio before preparing your download.</p>
        </div>
      </aside>
      </div>
    </main>
    <EditorialFooter />
    </div>
  );
}
