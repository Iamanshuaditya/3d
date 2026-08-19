"use client";

import type { ProductConfig } from "@/types/configurator";
import type { ProductSummary } from "@/lib/configurator/product-summary";
import { ProductCard } from "./ProductCard";

export type GalleryItem = {
  config: ProductConfig;
  summary: ProductSummary;
};

export function ProductGallery({ items }: { items: GalleryItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.summary.id} className="flex">
          <ProductCard config={item.config} summary={item.summary} />
        </li>
      ))}
    </ul>
  );
}
