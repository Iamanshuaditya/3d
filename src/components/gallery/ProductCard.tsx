import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { studioHref } from "@/lib/projects/location";
import type { FeaturedProduct } from "@/lib/configurator/library-showcase";
import { ProductPoster } from "./ProductPoster";

type ProductCardProps = {
  feature: FeaturedProduct;
};

export function ProductCard({ feature }: ProductCardProps) {
  return (
    <article
      id={feature.slug}
      aria-labelledby={`${feature.slug}-title`}
      className="group relative flex h-full w-full scroll-mt-6 flex-col rounded-2xl"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#e1e2e5]">
        <ProductPoster src={feature.poster} name={feature.name} />
      </div>

      <div className="flex flex-1 flex-col px-1 pb-1 pt-5 sm:pt-6">
        <div>
          <p className="mb-2 text-xs font-medium text-[var(--st-dim)]">{feature.category}</p>
          <h3 id={`${feature.slug}-title`} className="text-2xl font-semibold tracking-tight text-[var(--st-text)] sm:text-[28px]">
            {feature.name}
          </h3>
          <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-[var(--st-dim)] sm:text-[15px]">
            {feature.description}
          </p>
        </div>

        <Link
          href={studioHref({ product: feature.productId })}
          className="mt-auto inline-flex min-h-11 items-center justify-between gap-4 rounded-lg pt-5 text-sm font-semibold text-[var(--st-text)] outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-[var(--st-accent)] focus-visible:after:ring-offset-4"
        >
          <span className="underline-offset-4 group-hover:underline">
            {feature.action}
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--st-line)] transition-colors group-hover:border-[var(--st-text)] group-hover:bg-[var(--st-text)] group-hover:text-white">
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </article>
  );
}
