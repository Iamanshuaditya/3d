import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";
import { PRODUCTS, getProduct, DEFAULT_PRODUCT_ID } from "@/lib/configurator/product-config";

export const metadata: Metadata = {
  title: "Packaging Studio",
  description: "Design a printable surface and preview it live on a 3D product model.",
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product } = await searchParams;
  const config = getProduct(product ?? DEFAULT_PRODUCT_ID);

  // The switcher is driven by the registry, so adding a product to
  // product-config.ts is enough to make it selectable here.
  const visible = Object.values(PRODUCTS).filter((p) => !p.hidden);
  const catalogue = visible.map((p) => ({ id: p.id, name: p.name }));
  if (config && !catalogue.some((entry) => entry.id === config.id)) {
    catalogue.unshift({ id: config.id, name: config.name });
  }

  if (!config) {
    return (
      <main className="mx-auto max-w-[640px] px-6 py-24">
        <h1 className="text-[24px] font-semibold tracking-tight text-[var(--st-text)]">
          Unknown product
        </h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-[var(--st-dim)]">
          No product is registered with id &ldquo;{product}&rdquo;. Registered ids:{" "}
          {catalogue.map((p) => p.id).join(", ")}.
        </p>
      </main>
    );
  }

  // Keying by product id resets editor state on a product switch; surface ids,
  // history and canvases are all product-specific.
  return <StudioShell key={config.id} config={config} catalogue={catalogue} />;
}
