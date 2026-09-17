"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { EditorialProduct } from "@/lib/editorial/products";
import { EditorialFooter, EditorialHeader } from "./EditorialHeader";

export function EditorialCatalog({ products }: { products: EditorialProduct[] }) {
  const [family, setFamily] = useState("All");
  const visible = products.filter(product => family === "All" || product.family === family);
  return <div className="editorial-page"><EditorialHeader /><main className="mx-auto min-h-[80vh] max-w-[1600px] px-6 pb-24 pt-8 sm:px-12 lg:px-16">
    <nav aria-label="Breadcrumb" className="mb-14 flex gap-3 text-xs text-st-dim"><Link href="/" className="hover:underline">Home</Link><span>›</span><span aria-current="page">Products</span></nav>
    <h1 className="font-display text-[clamp(44px,5vw,68px)] font-light leading-[1.05]">Packaging<br /><em>Products</em></h1>
    <p className="mt-6 max-w-[520px] text-[15px] leading-7 text-st-dim">Three product families. Each with its own supported dimensions, artwork surfaces, and output formats.</p>
    <div aria-label="Product categories" className="mb-10 mt-10 flex flex-wrap gap-3">{["All", ...new Set(products.map(product => product.family))].map(item => <button key={item} type="button" aria-pressed={family === item} onClick={() => setFamily(item)} className={family === item ? "editorial-button min-h-10 px-5" : "editorial-button-outline min-h-10 px-5"}>{item}</button>)}</div>
    {visible.length ? <div className="grid gap-9 md:grid-cols-2 lg:grid-cols-3">{visible.map(product => <Link key={product.id} href={`/products/${product.id}`} className="group border-t border-st-line pt-4">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#E8E3D8]"><Image src={product.image} alt={product.name} fill sizes="(min-width:1024px) 32vw, (min-width:768px) 50vw, 100vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" /><div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">{product.outputs.map(output => <span key={output} className="bg-st-bg/95 px-2 py-1 text-[9px] uppercase tracking-wider text-st-text">{output}</span>)}</div></div>
      <div className="mb-3 mt-6 flex items-center justify-between"><h2 className="font-display text-[32px]">{product.name}</h2><ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></div><p className="mb-4 text-xs uppercase tracking-wider text-[#A75232]">{product.subtitle}</p><p className="text-sm leading-6 text-st-dim">{product.description}</p><span className="mt-6 inline-flex border-b border-st-text pb-1 text-xs uppercase tracking-wider">Explore product</span>
    </Link>)}</div> : <p role="status" className="border border-st-line p-8 text-st-dim">No products are available in this category right now.</p>}
  </main><EditorialFooter /></div>;
}
