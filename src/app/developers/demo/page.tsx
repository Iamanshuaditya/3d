import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IntegrationDemo } from "@/components/embed/IntegrationDemo";

export const metadata = { title: "Integration demo · Vortex Studio" };

export default function IntegrationDemoPage() {
  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
    <Link href="/developers" className="inline-flex items-center gap-2 text-sm text-[var(--st-dim)] hover:text-[var(--st-text)]"><ArrowLeft className="h-4 w-4" /> Integration guide</Link>
    <div className="mb-7 mt-7 max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--st-dim)]">Live integration demo</p>
      <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">From API request to editor.</h1>
      <p className="mt-4 text-base leading-relaxed text-[var(--st-dim)]">Send a product ID, inspect the live response, and open its full-page editor. The Back button brings you here with your design preserved.</p>
    </div>
    <IntegrationDemo enabled={process.env.NODE_ENV === "development"} />
  </main>;
}
