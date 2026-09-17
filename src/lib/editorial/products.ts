export type EditorialProduct = {
  id: string;
  name: string;
  family: string;
  subtitle: string;
  description: string;
  image: string;
  hero: string;
  outputs: string[];
  previewOnly: boolean;
};

export const EDITORIAL_PRODUCTS: readonly EditorialProduct[] = [
  {
    id: "mailer-box-001", name: "Mailer Box", family: "Boxes",
    subtitle: "Direct-to-consumer shipping",
    description: "A self-locking mailer built for unboxing moments. Make the exterior and interior your own, then see your artwork fold into place on the actual product.",
    image: "/editorial/mailer.webp", hero: "/editorial/hero.webp",
    outputs: ["Print PDF", "Dieline SVG", "3D preview"], previewOnly: false,
  },
  {
    id: "blender-pouch-v3-preview", name: "Stand-Up Pouch", family: "Pouches",
    subtitle: "Shelf-ready flexible packaging",
    description: "A dimensional stand-up pouch for a distinctive shelf presence. Design your artwork, explore the 3D model, and download a PNG, GLB model, or SVG placement guides.",
    image: "/editorial/pouch.webp", hero: "/editorial/pouch-hero.webp",
    outputs: ["Artwork PNG", "GLB model", "Guides SVG"], previewOnly: true,
  },
  {
    id: "coffee-cup", name: "Paper Coffee Cup", family: "Drinkware",
    subtitle: "Cafe + hospitality take-away",
    description: "Turn an everyday coffee ritual into a branded touchpoint. Add your artwork to the supported print surface and inspect the result on the dimensional cup.",
    image: "/editorial/coffee.webp", hero: "/editorial/coffee-hero.webp",
    outputs: ["Print PDF", "3D preview"], previewOnly: false,
  },
];

export function editorialProduct(id: string) {
  return EDITORIAL_PRODUCTS.find((product) => product.id === id);
}
