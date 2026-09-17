import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import type { EditorialProduct } from "@/lib/editorial/products";
import { EditorialFooter, EditorialHeader } from "./EditorialHeader";

const FAQ = [
  ["What file formats does Vortex export?", "Outputs depend on the product. The mailer supports print PDF and manufacturing SVG. The standalone pouch offers artwork PNG, a GLB model, and SVG placement guides. Available downloads are shown for your selected product."],
  ["Can I use my own artwork or logo?", "Yes. Open the editor’s Uploads tool to add your artwork, then position and resize it on the supported design surface."],
  ["Is there a print certification or guarantee?", "Production exports run through the project’s preflight checks. Always inspect the exported file and confirm the requirements with your printer. A visual mockup is not a manufacturing certification."],
  ["How are my designs saved?", "Supported projects save automatically and can be reopened from My designs. The standalone pouch preview is session-only; download your artwork before leaving that session."],
  ["Can I start from a blank canvas?", "Yes. Choose a product, review its supported configuration, and start blank or select an available editable template. You can upload artwork from inside the editor."],
];

const GALLERY = [
  {brand: "Mira Botanicals", type: "Mailer Box", image: "/editorial/mailer.webp"},
  {brand: "Kestrel Coffee", type: "Stand-Up Pouch", image: "/editorial/pouch-hero.webp"},
  {brand: "Noon & Oak", type: "Coffee Cup", image: "/editorial/coffee.webp"},
  {brand: "Veld Supply", type: "Mailer Box", image: "/editorial/veld.webp"},
];

const CHIP = "border border-st-line px-3.5 py-2 text-xs text-st-dim transition-[color,border-color,transform] duration-200 ease-[var(--ease-out)] hover:border-st-text hover:text-st-text active:scale-[0.98]";

export function EditorialLanding({ products }: { products: EditorialProduct[] }) {
  return (
    <div className="editorial-page">
      <a className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-st-bg focus:p-4" href="#main">Skip to content</a>
      <EditorialHeader />
      <main id="main">
        {/* The hero cascades on load rather than on scroll: it is above the
            fold, so it must not wait for hydration. Delays are carried by
            [data-rise] / [data-rise-lines] in motion.css. */}
        <section className="grid overflow-hidden lg:min-h-[850px] lg:grid-cols-2">
          <div data-rise className="flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-16 lg:py-20">
            <p className="mb-8 w-fit border border-[#C4714A] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[#A75232]">Browser-based packaging design</p>
            <h1 data-rise-lines className="font-display tracking-[-0.035em] text-st-text">
              <span className="block text-[clamp(56px,5.5vw,84px)] font-semibold leading-[1.05]">Good</span>
              <span className="mt-2 block text-[clamp(56px,5.5vw,84px)] font-medium italic leading-[1.05]">packaging</span>
              <span className="mt-3 block text-[clamp(30px,2.8vw,44px)] font-light leading-[1.1] text-[#4A4A44]">starts with a</span>
              <span className="mt-3 block text-[clamp(56px,5.5vw,84px)] font-semibold leading-[1.05]">great idea<span className="text-[#C4714A]">.</span></span>
            </h1>
            <p className="mb-10 mt-12 max-w-[380px] text-base leading-[1.65] text-st-dim">Design mailer boxes, stand-up pouches, and coffee cups — directly in your browser. Bring your artwork to life in 3D.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/products" className="editorial-button">Start designing <ArrowRight className="h-4 w-4" /></Link>
              <a href="#products" className="editorial-button-outline">Explore packaging</a>
            </div>
            <div className="mt-12 flex flex-wrap gap-2.5">
              {products.map((product) => <Link key={product.id} href={`/products/${product.id}`} className={CHIP}>{product.name}</Link>)}
            </div>
          </div>
          <div className="relative min-h-[440px] overflow-hidden bg-[#E7DDCB] sm:min-h-[560px] lg:min-h-full">
            {/* Transform only — this is the LCP candidate, and an image held at
                opacity 0 has not painted yet. */}
            <Image src="/editorial/hero.webp" alt="Kraft packaging composition with a box, coffee cup, and utensils" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="hero-settle object-cover" />
            <span className="hero-aside absolute right-6 top-6 bg-st-text px-3 py-2 text-[10px] uppercase tracking-wider text-st-bg">Design · Preview · Export</span>
            <div className="hero-aside hero-aside-late absolute bottom-8 left-6 border border-white/30 bg-st-bg/95 p-5 sm:left-8">
              <p className="text-[9px] uppercase tracking-[0.14em] text-st-dim">Packaging inspiration</p>
              <p className="mt-1.5 font-display text-xl">Mira Botanicals</p>
              <p className="mt-1 text-[11px] text-st-dim">Mailer Box · Editorial collection</p>
            </div>
          </div>
        </section>

        <section id="products" className="scroll-mt-8 px-6 py-16 sm:px-12 lg:px-16 lg:py-24">
          <div data-reveal="up" className="mb-10 flex flex-wrap items-center justify-between gap-4"><h2 className="font-display text-[32px]">Product families</h2><Link href="/products" className="editorial-link text-xs uppercase tracking-[0.08em]">View all products →</Link></div>
          <div data-stagger className="grid gap-8 md:grid-cols-3">
            {products.map((product) => <Link key={product.id} data-reveal="up" href={`/products/${product.id}`} className="group block">
              <div className="editorial-media aspect-[4/3]"><Image src={product.image} alt={product.name} fill sizes="(min-width: 768px) 32vw, 100vw" className="object-cover" /></div>
              <div className="mt-5 flex items-center justify-between"><h3 className="font-display text-[26px]">{product.name}</h3><ArrowRight className="editorial-arrow h-5 w-5" /></div>
              <p className="mt-2 text-sm text-st-dim">{product.subtitle}</p>
              <div className="mt-4 flex flex-wrap gap-2">{product.outputs.map(output => <span key={output} className="editorial-tag">{output}</span>)}</div>
            </Link>)}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-6 bg-[#173D32] px-6 py-20 text-[#F5F1E8] sm:px-12 lg:px-16 lg:py-24">
          <p data-reveal="up" className="mb-8 text-xs uppercase tracking-[0.14em] text-[#F5F1E8]/60">How it works</p>
          <div data-stagger className="grid gap-8 lg:grid-cols-2 lg:gap-20"><h2 data-reveal="rise" className="font-display text-[clamp(36px,4vw,58px)] font-light leading-[1.1]">From idea to artwork<br />in four steps.</h2><p data-reveal="up" className="max-w-[430px] self-end text-[15px] leading-7 text-[#F5F1E8]/70">Your creative process, all in one place. Choose your packaging, make it your own, and inspect every detail before you export.</p></div>
          <ol data-stagger className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Choose your packaging", "Pick a mailer box, stand-up pouch, or coffee cup. Review its supported size and output formats."],
              ["Design your artwork", "Start blank or from a template. Add type, upload assets, and change the background."],
              ["Review & export", "Inspect your artwork and dimensional preview. Download the formats supported by your product."],
              ["Keep creating", "Return to My designs to resume saved projects. Download session-only artwork before leaving."],
            ].map(([title, copy], index) => <li key={title} data-reveal="up" className="rule-draw pt-6"><span className="font-display text-4xl font-light text-[#F5F1E8]/40">0{index + 1}</span><h3 className="mb-3 mt-6 text-base font-medium">{title}</h3><p className="text-sm leading-6 text-[#F5F1E8]/65">{copy}</p></li>)}
          </ol>
        </section>

        <section className="px-6 py-20 sm:px-12 lg:px-16"><h2 data-reveal="up" className="mb-10 font-display text-[32px]">A little inspiration</h2><div data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{GALLERY.map(item => <figure key={item.brand} data-reveal="curtain" className="group"><div className="editorial-media aspect-[4/5]"><Image src={item.image} alt={`${item.brand} packaging inspiration`} fill sizes="(min-width:1024px) 24vw, (min-width:640px) 50vw, 100vw" className="object-cover" /></div><figcaption className="mt-4"><span className="font-display text-xl">{item.brand}</span><span className="mt-1 block text-[10px] uppercase tracking-wider text-st-dim">{item.type} · Sample direction</span></figcaption></figure>)}</div></section>

        <section className="grid gap-10 border-t border-st-line px-6 py-20 sm:px-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20 lg:px-16"><div data-reveal="up"><h2 className="font-display text-[48px] font-light leading-[1.1]">Questions &<br />answers.</h2><p className="mt-5 max-w-[280px] text-sm leading-6 text-st-dim">Common questions about outputs, saving, and production.</p></div><div data-stagger>{FAQ.map(([question, answer]) => <details key={question} data-reveal="up" className="editorial-disclosure group border-b border-st-line"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-5 text-[15px] font-medium">{question}<Plus aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-45" /></summary><p className="pb-6 pr-8 text-sm leading-6 text-st-dim">{answer}</p></details>)}</div></section>

        <section data-stagger className="border-t border-st-line px-6 py-20 text-center"><h2 data-reveal="up" className="font-display text-[clamp(36px,4vw,58px)] font-light">Ready to design <em>your box?</em></h2><p data-reveal="up" className="mb-8 mt-5 text-sm text-st-dim">Start with a product, choose your starting point, and open the editor.</p><Link data-reveal="up" href="/products" className="editorial-button mx-auto w-fit">Start designing <ArrowRight className="h-4 w-4" /></Link></section>
      </main>
      <EditorialFooter />
    </div>
  );
}
