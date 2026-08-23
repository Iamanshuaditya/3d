import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";
import { PRODUCTS, DEFAULT_PRODUCT_ID } from "@/lib/configurator/product-config";
import { parseOptionSelection } from "@/platform/products/configuration-resolver";
import { ProductDomainError } from "@/platform/products/errors";
import type { ProductPresentationMode } from "@/platform/products/types";
import { getProductCatalogService } from "@/server/products/container";

export const metadata: Metadata = {
  title: "Packaging Studio",
  description: "Design a printable surface and preview it live on a 3D product model.",
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{
    product?: string;
    project?: string;
    version?: string;
    options?: string;
  }>;
}) {
  const { product, project, version, options } = await searchParams;
  const productId = product ?? DEFAULT_PRODUCT_ID;
  let config = null;
  let presentationMode: ProductPresentationMode | null = null;
  let resolutionError: string | null = null;
  try {
    const selection = parseOptionSelection(options ? JSON.parse(options) : {});
    const resolved = await getProductCatalogService().resolve(
      productId,
      version ?? null,
      selection,
    );
    config = resolved.productConfig;
    presentationMode = resolved.presentation.mode;
  } catch (error) {
    resolutionError = error instanceof ProductDomainError
      ? error.message
      : options && error instanceof SyntaxError
        ? "The product option selection in this URL is invalid."
        : "The product configuration could not be resolved.";
  }

  // The switcher is driven by the registry, so adding a product to
  // product-config.ts is enough to make it selectable here.
  const visible = Object.values(PRODUCTS).filter((p) => !p.hidden);
  const catalogue = visible.map((p) => ({ id: p.id, name: p.name }));
  if (config && !catalogue.some((entry) => entry.id === config.id)) {
    catalogue.unshift({ id: config.id, name: config.name });
  }

  if (!config || !presentationMode) {
    return (
      <main className="mx-auto max-w-[640px] px-6 py-24">
        <h1 className="text-[24px] font-semibold tracking-tight text-[var(--st-text)]">
          Unknown product
        </h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-[var(--st-dim)]">
          {resolutionError ?? `No product is registered with id “${productId}”.`} Registered ids:{" "}
          {catalogue.map((p) => p.id).join(", ")}.
        </p>
      </main>
    );
  }

  // Project changes also remount the editor so undo history can never cross a
  // project boundary, even when both projects use the same product.
  return (
    <StudioShell
      key={`${config.id}:${config.configurationId}:${project ?? "new"}`}
      config={config}
      presentationMode={presentationMode}
      catalogue={catalogue}
      requestedProjectId={project ?? null}
    />
  );
}
