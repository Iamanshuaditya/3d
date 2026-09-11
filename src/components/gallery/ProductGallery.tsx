import type { FeaturedProduct } from "@/lib/configurator/library-showcase";
import { ProductCard } from "./ProductCard";

export type GalleryItem = {
  feature: FeaturedProduct;
};

export function ProductGallery({ items }: { items: GalleryItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-x-7 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.feature.productId} className="flex">
          <ProductCard feature={item.feature} />
        </li>
      ))}
    </ul>
  );
}
