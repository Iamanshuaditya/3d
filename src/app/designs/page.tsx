import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
    <main className="mx-auto w-full max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-9 border-b border-[var(--st-line)] pb-7">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--st-dim)] hover:text-[var(--st-text)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Product library
          </Link>
          <AccountControl />
        </div>
        <h1 className="mt-5 text-[32px] font-semibold leading-tight tracking-tight text-[var(--st-text)] sm:text-[40px]">
          My designs
        </h1>
        <p className="mt-3 max-w-[56ch] text-[15px] leading-6 text-[var(--st-dim)]">
          Continue where you left off. Projects, artwork, transforms, and production treatments are saved together.
        </p>
      </header>

      <ProjectLibrary productNames={productNames} />
    </main>
  );
}
