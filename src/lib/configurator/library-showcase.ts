/** Landing-page curation is separate from the versioned product catalog. */
export type FeaturedProduct = Readonly<{
  productId: string;
  category: string;
  slug: string;
  name: string;
  description: string;
  action: string;
  poster: string;
}>;

export const FEATURED_PRODUCTS: readonly FeaturedProduct[] = [
  {
    productId: "blender-pouch-v3-preview",
    category: "Pouches",
    slug: "pouches",
    name: "Stand-up pouch",
    description: "Make every side your own, from the front panel to the smallest fold.",
    action: "Design a pouch",
    poster: "/products/stand-up-pouch.png",
  },
  {
    productId: "mailer-box-001",
    category: "Boxes",
    slug: "boxes",
    name: "Mailer box",
    description: "Create an unboxing moment, then watch your design fold into place.",
    action: "Design a box",
    poster: "/products/mailer-box.png",
  },
  {
    productId: "coffee-cup",
    category: "Drinkware",
    slug: "drinkware",
    name: "Paper coffee cup",
    description: "Put your brand at the centre of an everyday coffee ritual.",
    action: "Design a coffee cup",
    poster: "/products/paper-coffee-cup.png",
  },
];
