"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Download, FileCode2 } from "lucide-react";
import type { ProductConfig } from "@/types/configurator";
import type { ProductionArtifactKind } from "@/platform/production/types";
import type { ProjectSaveState } from "@/platform/projects/types";

type StudioReviewPanelProps = {
  config: ProductConfig;
  saveState: ProjectSaveState;
  canExportSvg: boolean;
  exporting: ProductionArtifactKind | null;
  notice: { kind: "success" | "error"; message: string } | null;
  onExport: (kind: ProductionArtifactKind) => void;
  previewDownloads: ReactNode;
};

export function StudioReviewPanel({ config, saveState, canExportSvg, exporting, notice, onExport, previewDownloads }: StudioReviewPanelProps) {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quotePreviewed, setQuotePreviewed] = useState(false);
  const [quantity, setQuantity] = useState("500");
  const disabled = Boolean(exporting) || saveState === "loading";
  return (
    <aside aria-label="Review and export" className="w-full shrink-0 border-t border-[var(--st-line)] bg-[var(--st-surface)] p-6 lg:w-[380px] lg:overflow-y-auto lg:border-t-0 lg:border-l lg:p-8">
      <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--st-dim)]">The final look</p>
      <h1 className="mt-4 font-display text-5xl leading-[1.05]">Almost <em>ready.</em></h1>
      <p className="mt-5 text-sm leading-6 text-[var(--st-dim)]">Take a moment to check your design from every angle, then choose your download.</p>
      <div className="mt-6 border-y border-[var(--st-line)] py-5">
        <p className="font-medium">{config.name}</p>
        {config.editableSurfaces.map((surface) => (
          <p key={surface.id} className="mt-2 text-xs leading-5 text-[var(--st-dim)]">{surface.label} · {(surface.physicalWidthCm * 10).toFixed(0)} × {(surface.physicalHeightCm * 10).toFixed(0)} mm</p>
        ))}
        <p className="mt-3 text-xs text-[var(--st-dim)]">{config.previewOnly ? "Preview design · current session only" : saveState === "saved" ? "Your project is saved" : saveState === "saving" ? "Saving your changes…" : "Changes are saved before export"}</p>
      </div>
      <h2 className="mt-6 font-display text-2xl">Before you export</h2>
      <ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--st-dim)]">
        <li>Check spelling, placement, and every printable surface.</li>
        <li>Keep essential artwork inside the safe area and extend backgrounds into the bleed.</li>
        <li>{config.previewOnly ? "Preview files are for presentation. They are not manufacturing artwork." : "Production checks run when you generate your file. Review any reported warnings with your printer."}</li>
      </ul>
      <h2 className="mt-7 font-display text-2xl">Take it with you</h2>
      {config.previewOnly ? <div className="mt-4 flex flex-wrap gap-2">{previewDownloads}</div> : (
        <div className="mt-4 space-y-3">
          <button type="button" disabled={disabled} onClick={() => onExport("pdf")} className="editorial-button w-full disabled:cursor-wait disabled:opacity-50"><Download className="h-4 w-4" />{exporting === "pdf" ? "Preparing PDF…" : "Download print PDF"}</button>
          {canExportSvg && <button type="button" disabled={disabled} onClick={() => onExport("svg")} className="editorial-button-outline w-full disabled:cursor-wait disabled:opacity-50"><FileCode2 className="h-4 w-4" />{exporting === "svg" ? "Preparing SVG…" : "Download dieline SVG"}</button>}
        </div>
      )}
      {notice && <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 border p-3 text-sm leading-6 ${notice.kind === "error" ? "border-red-300 text-red-800" : "border-[var(--st-line)] text-[var(--st-text)]"}`}>{notice.message}</p>}
      <div className="mt-8 border-t border-[var(--st-line)] pt-6">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#A45535]">Proposed feature · preview only</p>
        <button type="button" aria-expanded={quoteOpen} onClick={() => setQuoteOpen(!quoteOpen)} className="mt-3 flex w-full items-center justify-between text-sm font-medium">Explore a print quote <ArrowRight className="h-4 w-4" /></button>
        {quoteOpen && (quotePreviewed ? <div role="status" className="mt-4 text-sm leading-6"><p className="font-medium">Quote preview ready.</p><p className="text-[var(--st-dim)]">{quantity} units of {config.name}. No request has been sent. Supplier quotes and ordering are not connected yet.</p><button type="button" className="mt-3 underline underline-offset-4" onClick={() => setQuotePreviewed(false)}>Edit preview</button></div> : (
          <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); setQuotePreviewed(true); }}>
            <p className="text-xs leading-5 text-[var(--st-dim)]">Try the proposed quote step. This creates a local preview, not an order.</p>
            <label className="block text-xs">Quantity<input className="mt-2 block w-full border border-[var(--st-line)] bg-transparent p-3 text-sm" type="number" min="1" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
            <button className="editorial-button-outline w-full" type="submit">Preview quote request</button>
          </form>
        ))}
      </div>
    </aside>
  );
}
