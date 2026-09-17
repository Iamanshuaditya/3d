import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EditorialHeader, EditorialFooter } from "@/components/editorial/EditorialHeader";
import { ProjectLibrary } from "@/components/projects/ProjectLibrary";
import { PRODUCTS } from "@/lib/configurator/product-config";
import { AccountControl } from "@/components/auth/AccountControl";

export const metadata: Metadata = {
  title: "My designs",
  description: "Resume, duplicate, or archive your saved customization projects.",
};

export default function MyDesignsPage() {
  const productNames = Object.fromEntries(
    Object.values(PRODUCTS).map((product) => [product.id, product.name]),
  );

  return (
    <div className="editorial-page editorial-designs">
    <EditorialHeader />
    <main className="mx-auto min-h-[75vh] w-full max-w-[1440px] px-6 py-10 sm:px-12 sm:py-14">
      <header className="mb-9 border-b border-[var(--st-line)] pb-7">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/products"
            className="editorial-button"
          >
            <Plus className="h-4 w-4" />
            New design
          </Link>
          <AccountControl />
        </div>
        <h1 data-reveal="up" className="mt-8 text-5xl font-normal leading-tight tracking-tight text-[var(--st-text)] sm:text-7xl">
          My <em>designs.</em>
        </h1>
        <p data-reveal="up" className="mt-3 max-w-[56ch] text-[15px] leading-6 text-[var(--st-dim)]">
          A home for your ideas. Pick up where you left off, or make something new.
        </p>
      </header>

      <ProjectLibrary productNames={productNames} />
    </main>
    <EditorialFooter />
    </div>
  );
}
