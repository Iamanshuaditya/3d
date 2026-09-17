import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { EditorialFooter, EditorialHeader } from "@/components/editorial/EditorialHeader";
import { ProductOptionConfigurator } from "@/components/products/ProductOptionConfigurator";
import { getEditorialCatalog } from "@/server/products/editorial-catalog";
import { getProductCatalogService } from "@/server/products/container";
import { parseOptionSelection } from "@/platform/products/configuration-resolver";
import { studioHref } from "@/lib/projects/location";
import { editorialProduct } from "@/lib/editorial/products";

export async function generateMetadata({ params }: { params: Promise<{ productId: string }> }): Promise<Metadata> {
  const product = editorialProduct((await params).productId);
  return { title: product ? `${product.name} · Vortex Studio` : "Product unavailable", description: product?.description };
}

export default async function ProductDetailPage({params, searchParams}: {
  params: Promise<{productId: string}>;
  searchParams: Promise<{options?: string}>;
}) {
  const {productId} = await params;
  const {options} = await searchParams;
  const products = await getEditorialCatalog();
  const product = products.find(item => item.id === productId);
  if (!product) notFound();
  const catalog = getProductCatalogService();
  let resolutionError: string | null = null;
  let resolved;
  try { resolved = await catalog.resolve(productId, null, parseOptionSelection(options ? JSON.parse(options) : {})); }
  catch { resolutionError = "That configuration is unavailable. The supported default is shown below."; resolved = await catalog.resolve(productId, null, {}); }
  const version = await catalog.currentVersion(productId);
  const surface = resolved.productConfig.editableSurfaces[0];
  const physicalLabel = surface ? `Print area ${(surface.physicalWidthCm * 10).toFixed(0)} × ${(surface.physicalHeightCm * 10).toFixed(0)} mm` : "Product preview";
  const selection = JSON.stringify(resolved.selection);
  const href = product.previewOnly ? studioHref({product: productId, options: selection}) : `/templates?${new URLSearchParams({product: productId, options: selection})}`;
  return <div className="editorial-page"><EditorialHeader /><main className="mx-auto max-w-[1600px] px-6 pb-20 pt-8 sm:px-12 lg:px-16">
    <nav aria-label="Breadcrumb" data-reveal="up" className="mb-12 flex flex-wrap gap-3 text-xs text-st-dim"><Link href="/" className="editorial-link">Home</Link><span>›</span><Link href="/products" className="editorial-link">Products</Link><span>›</span><span aria-current="page">{product.name}</span></nav>
    <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
      <div className="relative min-h-[420px] overflow-hidden bg-[#E7DDCB] sm:min-h-[620px]"><Image src={product.hero} alt={`${product.name} packaging inspiration`} fill priority sizes="(min-width:1024px) 50vw, 100vw" className="hero-settle object-cover" /><div className="hero-aside absolute bottom-6 left-6 bg-st-bg/95 p-5"><p className="text-[9px] uppercase tracking-wider text-st-dim">Packaging inspiration</p><p className="mt-2 font-display text-xl">{product.name}</p><p className="mt-1 text-xs text-st-dim">Your artwork. Every detail.</p></div></div>
      <section data-rise className="self-center"><p className="mb-4 text-[11px] uppercase tracking-[0.15em] text-[#A75232]">{product.family}</p><h1 className="font-display text-[clamp(44px,4.5vw,64px)] font-light leading-[1.05]">{product.name}</h1><p className="mb-8 mt-6 text-[15px] leading-7 text-st-dim">{product.description}</p><h2 className="mb-3 text-[10px] uppercase tracking-[0.12em] text-st-dim">Supported outputs — this product</h2><div className="mb-8 flex flex-wrap gap-2">{product.outputs.map(output => <span key={output} className="editorial-tag">{output}</span>)}</div>
        {version.definition.options.length > 0 ? <ProductOptionConfigurator key={resolved.configurationId} productName={product.name} options={version.definition.options} selection={resolved.selection} configurationId={resolved.configurationId} physicalLabel={physicalLabel} errorMessage={resolutionError} /> : <div className="mb-8 border-y border-st-line py-5"><p className="text-[10px] uppercase tracking-wider text-st-dim">Supported configuration</p><p className="mt-2 font-display text-2xl">{physicalLabel}</p><p className="mt-2 text-xs leading-5 text-st-dim">{product.previewOnly ? "Session-only design. Download your artwork before leaving." : "The editor uses the product’s registered print surface and structure."}</p>{resolutionError && <p role="alert" className="mt-3 text-sm text-[#A75232]">{resolutionError}</p>}</div>}
        <Link href={href} className="editorial-button w-full">{product.previewOnly ? "Open in editor" : "Configure & design this product"}<ArrowRight className="h-4 w-4" /></Link>
      </section>
    </div>
    <section className="mt-20 border-t border-st-line pt-9"><h2 data-reveal="up" className="mb-6 text-xs uppercase tracking-wider text-st-dim">Other products</h2><div data-stagger className="grid gap-6 sm:grid-cols-2">{products.filter(item => item.id !== productId).map(item => <Link key={item.id} data-reveal="up" href={`/products/${item.id}`} className="editorial-card group flex items-center gap-5 border border-st-line p-4"><span className="editorial-thumb block shrink-0"><Image src={item.image} alt={item.name} width={96} height={80} className="h-20 w-24 object-cover"/></span><span className="block"><h3 className="font-display text-2xl">{item.name}</h3><p className="mt-1 text-xs text-st-dim">{item.subtitle}</p></span><ArrowRight className="editorial-arrow ml-auto h-5 w-5"/></Link>)}</div></section>
  </main><EditorialFooter /></div>;
}
