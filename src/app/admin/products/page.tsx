import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Layers3,
} from "lucide-react";
import { getProductOperationsService } from "@/server/products/container";

export const metadata: Metadata = {
  title: "Product operations",
  description: "Validate the versioned Vortex product catalogue.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function ProductOperationsPage() {
  // This inventory exposes unlisted catalogue metadata. Keep it local until a
  // real operator identity/authorization adapter is present.
  if (process.env.NODE_ENV === "production") notFound();

  const products = await getProductOperationsService().list();
  const passed = products.filter((product) => product.validation.passed).length;
  const issues = products.reduce(
    (count, product) => count + product.validation.issues.length,
    0,
  );
  const versionCount = products.reduce(
    (count, product) => count + product.versions.length,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-10 sm:px-8 sm:py-14">
      <header className="border-b border-[var(--st-line)] pb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--st-dim)] hover:text-[var(--st-text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Product library
        </Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--st-faint)]">
              Operator foundation
            </p>
            <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-[var(--st-text)] sm:text-[40px]">
              Product operations
            </h1>
          </div>
          <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            Local read-only view
          </span>
        </div>
        <p className="mt-3 max-w-[68ch] text-[15px] leading-6 text-[var(--st-dim)]">
          One inventory for immutable product versions, resolved Studio surfaces,
          production formats, and validation. Publishing remains in the domain
          service and onboarding CLI until operator authentication is connected.
        </p>
      </header>

      <section aria-label="Catalogue summary" className="grid gap-px border-x border-b border-[var(--st-line)] bg-[var(--st-line)] sm:grid-cols-4">
        {[
          { icon: Boxes, label: "Definitions", value: products.length },
          { icon: FileCheck2, label: "Published versions", value: versionCount },
          { icon: CheckCircle2, label: "Passing validation", value: `${passed}/${products.length}` },
          { icon: AlertTriangle, label: "Validation issues", value: issues },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-white px-5 py-5">
            <Icon className="h-4 w-4 text-[var(--st-faint)]" />
            <p className="mt-5 text-[26px] font-semibold tracking-tight text-[var(--st-text)]">{value}</p>
            <p className="mt-1 text-[12px] font-medium text-[var(--st-dim)]">{label}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 space-y-4" aria-label="Products">
        {products.map((product) => {
          const current = product.versions.find((version) => version.current);
          return (
            <article key={product.id} className="rounded-xl border border-[var(--st-line)] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[19px] font-semibold tracking-tight text-[var(--st-text)]">
                      {product.name}
                    </h2>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${product.validation.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {product.validation.passed ? "Valid" : "Needs attention"}
                    </span>
                    <span className="rounded-full bg-[var(--st-raised)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--st-dim)]">
                      {product.visibility}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[12px] text-[var(--st-faint)]">{product.id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.visibility === "public" && (
                    <Link
                      href={`/api/v1/products/${encodeURIComponent(product.id)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--st-line)] px-3 py-2 text-[12px] font-semibold text-[var(--st-text)] hover:bg-[var(--st-raised)]"
                    >
                      API DTO <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  {product.inspectUrl && (
                    <Link
                      href={product.inspectUrl}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--st-text)] px-3 py-2 text-[12px] font-semibold text-white hover:opacity-85"
                    >
                      Inspect in Studio <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>

              <dl className="mt-6 grid gap-4 border-y border-[var(--st-line)] py-4 text-[12px] sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <dt className="text-[var(--st-faint)]">Current version</dt>
                  <dd className="mt-1 font-mono font-medium text-[var(--st-text)]">{current?.id ?? "Not published"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--st-faint)]">Resolver</dt>
                  <dd className="mt-1 font-medium capitalize text-[var(--st-text)]">{current?.resolutionKind ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--st-faint)]">Options / surfaces</dt>
                  <dd className="mt-1 font-medium text-[var(--st-text)]">{product.optionCount} / {product.surfaceCount ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--st-faint)]">Production</dt>
                  <dd className="mt-1 font-medium uppercase text-[var(--st-text)]">{product.manufacturingFormats.join(" · ") || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--st-faint)]">Published</dt>
                  <dd className="mt-1 font-medium text-[var(--st-text)]">{current ? dateLabel(current.publishedAt) : "—"}</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-start gap-3">
                <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--st-faint)]" />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[var(--st-text)]">
                    {product.versions.length} immutable version{product.versions.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 break-words font-mono text-[11px] leading-5 text-[var(--st-faint)]">
                    {product.versions.map((version) => `${version.id}${version.current ? " (current)" : ""}`).join(" · ")}
                  </p>
                </div>
              </div>

              {product.validation.issues.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-[var(--st-line)] pt-4">
                  {product.validation.issues.map((issue, index) => (
                    <li key={`${issue.code}:${index}`} className="flex gap-2 text-[12px] leading-5 text-red-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span><span className="font-mono font-semibold">{issue.code}</span> — {issue.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
