"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Check, Download } from "lucide-react";
import type { CameraPreset, ProductConfig } from "@/types/configurator";
import type { ProductPresentationMode } from "@/platform/products/types";
import type { ResolvedEmbedConfig } from "@/platform/embed/types";
import { resolveStudioPresentation } from "@/platform/presentation/resolve-studio-presentation";
import { resolveProductPresentation } from "@/lib/configurator/presentation";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import { useCustomizer } from "@/lib/configurator/use-customizer";
import { useUnfold } from "@/lib/configurator/use-unfold";
import { useInflation } from "@/lib/configurator/use-inflation";
import { clearEmbedContext, markEmbedContext } from "@/lib/embed/embed-request-context";
import { SurfaceSelector } from "@/components/configurator/SurfaceSelector";
import { StudioPanel } from "@/components/studio/StudioPanel";
import { StudioViewport } from "@/components/studio/StudioViewport";
import type { StudioTool } from "@/components/studio/StudioToolRail";
import { EmbedToolRail } from "./EmbedToolRail";
import { useEmbedHost } from "./use-embed-host";
import { useEditorCompletion, type BrowserEditorSession } from "./use-editor-completion";

const DesignEditor = dynamic(
  () => import("@/components/configurator/DesignEditor").then((m) => m.DesignEditor),
  { ssr: false, loading: () => <div className="h-[420px] w-full animate-pulse rounded bg-black/5" /> },
);

type EmbedShellProps = {
  config: ProductConfig;
  presentationMode: ProductPresentationMode;
  embed: ResolvedEmbedConfig;
  requestedProjectId: string | null;
  editorSession?: BrowserEditorSession | null;
  returnUrl?: string | null;
};

const subscribeToFrame = () => () => {};
const isTopLevel = () => window.parent === window;
const serverFrameSnapshot = () => false;

/** Shared design tools for the full-page API editor and optional host frames. */
export function EmbedShell({ config, presentationMode, embed, requestedProjectId, editorSession = null, returnUrl = null }: EmbedShellProps) {
  const topLevel = useSyncExternalStore(subscribeToFrame, isTopLevel, serverFrameSnapshot);
  const [leaving, setLeaving] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [browserSession] = useState(() => editorSession ? {
    id: editorSession.id,
    token: typeof window === "undefined" ? "" : new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  } : null);
  const [contextMarked] = useState(() => {
    if (typeof window !== "undefined") markEmbedContext(embed.clientId, browserSession);
    return true;
  });
  // Runs before project effects, including React's development effect replay.
  useEffect(() => {
    markEmbedContext(embed.clientId, browserSession);
    return clearEmbedContext;
  }, [embed.clientId, browserSession]);

  const c = useCustomizer(config, requestedProjectId, contextMarked);
  const presentation = useMemo(() => resolveProductPresentation(config), [config]);
  const studioPresentation = useMemo(() => resolveStudioPresentation(config, presentationMode), [config, presentationMode]);
  const unfold = useUnfold(presentation.mode === "open-close" || presentation.mode === "progressive-unfold" ? presentation.plan : null);
  const inflation = useInflation(config.inflation?.defaultValue ?? 1);
  const [animated, setAnimated] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<CameraPreset | null>(null);
  const enabledTools = useMemo(() => {
    const tools: StudioTool[] = [];
    if (embed.features.text) tools.push("Text");
    if (embed.features.uploads) tools.push("Uploads");
    if (embed.features.background) tools.push("Background");
    if (embed.features.adjust) tools.push("Editor");
    return tools;
  }, [embed.features]);
  const [tool, setTool] = useState<StudioTool | null>(enabledTools[0] ?? null);
  const surface = c.activeSurface;
  const dieline = useMemo(() => resolveSurfaceDieline(config, surface), [config, surface]);
  const rootRef = useRef<HTMLDivElement>(null);
  const host = useEmbedHost({ hostOrigin: embed.hostOrigin, clientId: embed.clientId,
    productId: embed.productId, sessionId: editorSession?.id, rootRef });
  const completion = useEditorCompletion(c, embed, editorSession, host, config.configurationId ?? null);
  const { notifyError, onHostComplete } = host;
  const { complete } = completion;
  useEffect(() => {
    if (c.projectError) notifyError("SESSION_FAILED", c.projectError);
  }, [c.projectError, notifyError]);
  useEffect(() => { onHostComplete(() => { void complete(); }); }, [complete, onHostComplete]);

  const busy = c.saveState === "loading" || completion.finishing || leaving;
  const currentResult = c.saveState === "saved" && completion.result?.revision === c.project?.revision ? completion.result : null;
  const showPreview = embed.features.preview3d && studioPresentation.previewKind === "3d-product";

  async function goBack() {
    if (!returnUrl || busy) return;
    setLeaving(true);
    setNavigationError(null);
    try {
      if (!c.projectError && !await c.saveSnapshot()) throw new Error("Your changes could not be saved. Please try again.");
      window.location.assign(returnUrl);
    } catch (failure) {
      setNavigationError(failure instanceof Error ? failure.message : "Your changes could not be saved.");
      setLeaving(false);
    }
  }

  return (
    <div ref={rootRef} className="flex min-h-dvh w-full flex-col bg-[var(--st-bg)] text-[var(--st-text)] lg:h-dvh lg:min-h-[520px]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--st-line)] px-5 py-3">
        <div className="flex min-w-0 items-center gap-4">
          {returnUrl && topLevel && <button type="button" aria-label="Back to previous page" onClick={() => void goBack()} disabled={busy}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--st-line)] px-3 py-2 text-sm font-medium hover:bg-[var(--st-raised)] disabled:opacity-50">
            <ArrowLeft className="h-4 w-4" /> {leaving ? "Saving…" : "Back"}
          </button>}
          <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight">{config.name}</p>
          <p className="mt-0.5 text-[12px] text-[var(--st-dim)]">
            {c.saveState === "loading" ? "Opening your design…" : c.saveState === "saving" ? "Saving your changes…" : "Make it yours. Your changes save automatically."}
          </p>
          </div>
        </div>
        <button type="button" onClick={() => void complete()} disabled={busy || Boolean(c.projectError)}
          className="rounded-[var(--vx-radius)] bg-[var(--st-accent)] px-4 py-2.5 text-[13px] font-semibold text-[var(--st-accent-ink)] transition-opacity hover:opacity-90 disabled:opacity-50">
          {completion.finishing ? (editorSession?.mode === "pdf" ? "Preparing PDF…" : "Saving…")
            : editorSession?.mode === "preview" ? "Save design" : embed.completion.ctaLabel}
        </button>
      </header>

      {completion.completed && (currentResult || !editorSession) && (
        <div role="status" className="shrink-0 border-b border-[var(--st-line)] bg-[var(--st-raised)] px-5 py-3 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2"><Check className="h-4 w-4" />
              {currentResult?.status === "ready" ? "Your design and PDF are ready."
                : editorSession?.mode === "preview" ? "Preview saved. PDF export is not available for this product yet." : embed.completion.confirmationText}
            </p>
            {currentResult?.artifact && embed.features.downloadArtifact && <button type="button" onClick={() => void completion.download()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--st-line)] bg-[var(--st-surface)] px-3 py-2 font-medium hover:bg-[var(--st-bg)]">
              <Download className="h-4 w-4" /> Download PDF
            </button>}
          </div>
          {Boolean(currentResult?.warnings.length) && <details className="mt-2 text-[12px] text-[var(--st-dim)]">
            <summary className="cursor-pointer">Print notes · review before production</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{currentResult?.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}>{warning.message}</li>)}</ul>
          </details>}
        </div>
      )}
      {(navigationError || completion.error || c.projectError) && <p role="alert" className="shrink-0 border-b border-[var(--st-line)] bg-red-50 px-5 py-3 text-[13px] text-red-800">
        {navigationError ?? completion.error ?? c.projectError}
      </p>}

      <div inert={completion.finishing || leaving} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {tool && <>
          <EmbedToolRail tools={enabledTools} active={tool} onSelect={setTool} />
          <aside aria-label="Design tools" className="max-h-[300px] w-full shrink-0 overflow-auto border-b border-[var(--st-line)] bg-[var(--st-surface)] lg:max-h-none lg:w-[250px] lg:border-b-0 lg:border-r">
            <StudioPanel tool={tool} customizer={c} compact />
          </aside>
        </>}
        <section aria-label="Design" className="flex h-[420px] min-w-0 flex-none flex-col p-4 lg:h-auto lg:min-h-0 lg:flex-1">
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
            {studioPresentation.targets.length > 1 && <SurfaceSelector
              surfaces={studioPresentation.targets.map((target) => config.editableSurfaces.find((entry) => entry.id === target.surfaceId)!)}
              activeId={c.activeSurfaceId} onSelect={c.selectSurface} />}
            {Boolean(surface.sections?.length) && <div role="group" aria-label="Artwork panels" className="flex flex-wrap gap-1">
              {surface.sections?.map((section) => <button type="button" key={section.id} aria-pressed={c.activeSectionId === section.id}
                onClick={() => c.selectSection(section.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${c.activeSectionId === section.id ? "bg-[var(--st-accent)] text-[var(--st-accent-ink)]" : "bg-[var(--st-raised)] text-[var(--st-dim)]"}`}>
                {section.label}
              </button>)}
            </div>}
          </div>
          <div className="mt-3 flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-[var(--st-stage)] p-3">
            <DesignEditor surface={surface} design={c.design.surfaces[surface.id]} images={c.images}
              embroidery={c.embroidery.results} selectedId={c.selectedId} showGuides={c.showGuides}
              onSelect={c.setSelectedId} onChange={c.applyChange} onCommit={c.commitHistory}
              onCanvasReady={c.registerCanvas} onDirty={c.markDirty} selectedSectionId={c.activeSectionId}
              hoveredMeshName={c.hoveredMeshName} onSectionSelect={c.selectSection} onSectionHover={c.setHoveredMeshName}
              showProductionChrome={false} fitToContainer dieline={dieline} onDeleteSelected={c.deleteSelected}
              onDuplicateSelected={c.duplicateSelected} onToggleSelectedLock={c.toggleSelectedLock} cropMode={c.cropMode} />
          </div>
        </section>
        {showPreview && <section aria-label="3D preview" className="h-[540px] min-w-0 shrink-0 border-t border-[var(--st-line)] lg:h-auto lg:w-[36%] lg:border-l lg:border-t-0">
          <StudioViewport config={config} customizer={c} structuralPresentation={presentation} unfold={unfold}
            unfoldEnabled={embed.features.unfold} inflation={inflation} animated={animated} onAnimatedChange={setAnimated}
            pendingPreset={pendingPreset} onPresetApplied={() => setPendingPreset(null)} onPresetChange={setPendingPreset} />
        </section>}
      </div>
    </div>
  );
}
