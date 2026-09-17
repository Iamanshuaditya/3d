import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import { ApiReference } from "@/components/developers/ApiReference";
import { DocsNav } from "@/components/developers/DocsNav";
import { IntegrationGuides } from "@/components/developers/IntegrationGuides";

export const metadata = {
  title: "Editor API · Vortex Studio",
  description:
    "Put the packaging editor on your own storefront — with a backend through the editor API, or with a script tag on WordPress, Shopify, Squarespace, Wix or Webflow.",
};

export default function DevelopersPage() {
  return (
    <main className="editorial-page mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <nav aria-label="Developer navigation" className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--st-line)] pb-6">
        <Link href="/" className="editorial-back inline-flex items-center gap-2 text-sm text-[var(--st-dim)]">
          <ArrowLeft className="h-4 w-4" /> Product library
        </Link>
        <a href="/integration.md" download className="editorial-link inline-flex items-center gap-2 text-sm font-medium">
          <Download className="h-4 w-4" /> Download guide
        </a>
      </nav>

      <header data-rise className="grid gap-8 py-12 sm:py-16 lg:grid-cols-[1.5fr_1fr] lg:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--st-dim)]">Vortex for developers</p>
          <h1 className="mt-4 text-4xl font-medium leading-[1.06] tracking-tight sm:text-6xl">Your storefront.<br />One editor API.</h1>
        </div>
        <div>
          <p className="max-w-sm text-base leading-relaxed text-[var(--st-dim)]">
            Pass a product ID and open its editor — as a full page you redirect to, or embedded in your own site
            with no backend at all. Return with a saved design and, for supported products, a print-ready PDF.
          </p>
          <Link href="/developers/demo" className="editorial-pill mt-6 inline-flex min-h-12 items-center gap-6 rounded-full bg-[var(--st-text)] px-5 text-sm font-medium text-white hover:bg-black">
            Try the API live <ArrowUpRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-xs leading-relaxed text-[var(--st-dim)]">
            Click Send, inspect the real response, then open the returned editor URL.
          </p>
        </div>
      </header>

      <p className="rounded-xl border border-[var(--st-line)] bg-[var(--st-raised)] px-5 py-4 text-sm leading-relaxed">
        Before you start: get your Vortex host URL and — for the hosted path — a server API key, and register your
        website&apos;s exact origin. Keep the key on your backend.
      </p>

      <div className="mt-2 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_212px] lg:gap-16">
        <div className="min-w-0">
          <IntegrationGuides />
          <ApiReference />
        </div>
        <DocsNav />
      </div>

      <footer data-reveal="up" className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--st-line)] py-6 text-sm text-[var(--st-dim)]">
        <span>Vortex Studio · Editor API v1 · Embed protocol v1</span>
        <a href="/integration.md" download className="editorial-link font-medium text-[var(--st-text)]">
          Get the complete short guide →
        </a>
      </footer>
    </main>
  );
}
