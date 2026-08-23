import type { Metadata } from "next";
import Link from "next/link";
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
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="text-2xl font-semibold text-[var(--st-text)]">Choose a product first</h1>
        <Link href="/" className="mt-5 inline-flex text-[14px] font-medium text-[var(--st-accent)]">
          Return to product library
        </Link>
      </main>
    );
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
  const surface = resolved.productConfig.editableSurfaces[0];
  const physicalLabel = surface
    ? `Print sheet ${(surface.physicalWidthCm * 10).toFixed(0)} × ${(surface.physicalHeightCm * 10).toFixed(0)} mm`
    : "Resolved product";

  return (
    <main className="mx-auto w-full max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[var(--st-line)] pb-7">
        <Link href="/" className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--st-dim)] hover:text-[var(--st-text)]">
          <ArrowLeft className="h-4 w-4" /> Product library
        </Link>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--st-faint)]">
          {resolved.productConfig.name}
        </p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-[var(--st-text)] sm:text-[40px]">
          Choose your starting point
        </h1>
        <p className="mt-3 max-w-[58ch] text-[15px] leading-6 text-[var(--st-dim)]">
          Start blank or use an editable template. Template text, placement, and personalization remain normal Studio layers.
        </p>
      </header>
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
    </main>
  );
}
