import type { Metadata } from "next";
import { EditorialCatalog } from "@/components/editorial/EditorialCatalog";
import { getEditorialCatalog } from "@/server/products/editorial-catalog";

export const metadata: Metadata = { title: "Packaging products · Vortex Studio", description: "Explore mailer boxes, stand-up pouches and coffee cups. Choose your product and start designing." };

export default async function ProductsPage() {
  return <EditorialCatalog products={await getEditorialCatalog()} />;
}
