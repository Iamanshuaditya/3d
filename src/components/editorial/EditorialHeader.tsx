import Link from "next/link";
import { Menu } from "lucide-react";

const links = [
  { href: "/products", label: "Products" },
  { href: "/templates", label: "Templates" },
  { href: "/#how-it-works", label: "How it works" },
];

export function EditorialHeader() {
  return (
    // Translucent chrome that the page scrolls beneath, rather than an opaque
    // strip the layout has to give up.
    <header className="editorial-chrome z-40 flex min-h-16 items-center justify-between gap-6 border-b border-st-line px-5 sm:px-8">
      <Link href="/" className="flex shrink-0 items-baseline gap-1.5" aria-label="Vortex Studio home">
        <span className="font-display text-[24px] font-semibold tracking-tight">Vortex</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-st-dim">Studio</span>
      </Link>
      <nav aria-label="Main navigation" className="mr-auto hidden items-center gap-8 text-[13px] md:flex">
        {links.map((link) => <Link key={link.href} href={link.href} className="editorial-link">{link.label}</Link>)}
      </nav>
      <div className="hidden items-center gap-7 md:flex">
        <Link href="/designs" className="editorial-link text-[13px]">My designs</Link>
        <Link href="/products" className="editorial-button min-h-10 px-6 text-[11px]">Start designing</Link>
      </div>
      <details className="group md:hidden">
        <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center" aria-label="Open navigation"><Menu className="h-5 w-5" /></summary>
        <nav aria-label="Mobile navigation" className="editorial-menu absolute left-0 right-0 top-full flex flex-col border-b border-st-line bg-st-bg px-6 py-5 shadow-lg">
          {[...links, {href: "/designs", label: "My designs"}].map((link) => <Link key={link.href} href={link.href} className="py-3 text-sm">{link.label}</Link>)}
          <Link href="/products" className="editorial-button mt-3">Start designing</Link>
        </nav>
      </details>
    </header>
  );
}

export function EditorialFooter() {
  return <footer data-reveal="up" className="flex flex-wrap items-center justify-between gap-4 border-t border-st-line px-6 py-8 text-xs text-st-dim sm:px-16"><Link href="/" className="font-display text-xl text-st-text">Vortex Studio</Link><span>A little imagination. A new dimension.</span><Link href="/developers" className="editorial-link">For developers</Link></footer>;
}
