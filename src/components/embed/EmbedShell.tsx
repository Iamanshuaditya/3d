"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ProductConfig } from "@/types/configurator";
import type { ProductPresentationMode } from "@/platform/products/types";
import type { ResolvedEmbedConfig } from "@/platform/embed/types";
import { resolveStudioPresentation } from "@/platform/presentation/resolve-studio-presentation";
import { resolveProductPresentation } from "@/lib/configurator/presentation";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import { useCustomizer } from "@/lib/configurator/use-customizer";
import { useUnfold } from "@/lib/configurator/use-unfold";
import { markEmbedContext } from "@/lib/embed/embed-request-context";
import { SurfaceSelector } from "@/components/configurator/SurfaceSelector";
import { UnfoldControl } from "@/components/configurator/UnfoldControl";
import { StudioPanel } from "@/components/studio/StudioPanel";
import type { StudioTool } from "@/components/studio/StudioToolRail";
import { EmbedToolRail } from "./EmbedToolRail";
import { useEmbedHost } from "./use-embed-host";

const DesignEditor = dynamic(
  () => import("@/components/configurator/DesignEditor").then((m) => m.DesignEditor),
  {
    ssr: false,
    loading: () => <div className="h-[420px] w-full animate-pulse rounded bg-black/5" />,
  },
);
const Product3DViewer = dynamic(
  () => import("@/components/configurator/Product3DViewer").then((m) => m.Product3DViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px] text-[var(--st-dim)]">Loading 3D preview…</p>
      </div>
    ),
  },
);

type EmbedShellProps = {
  config: ProductConfig;
  presentationMode: ProductPresentationMode;
  embed: ResolvedEmbedConfig;
  requestedProjectId: string | null;
};

/**
 * The customer-facing configurator inside a manufacturer's website (#27).
 *
 * This is composition over the same engine the Studio uses — the customizer,
 * editor, dieline resolution and 3D viewer are shared, not copied. What differs
 * is only what a customer should see: no catalogue switcher, no account
 * control, no operator export, and no tool the client has not enabled.
 */
export function EmbedShell({
  config,
  presentationMode,
  embed,
  requestedProjectId,
}: EmbedShellProps) {
  // Marked before the customizer's first request so the very first session
  // call carries the embed header and receives a partitioned cookie.
  const [contextMarked] = useState(() => {
    markEmbedContext(embed.clientId);
    return true;
  });

  const c = useCustomizer(config, requestedProjectId, contextMarked);
  const presentation = useMemo(() => resolveProductPresentation(config), [config]);
  const studioPresentation = useMemo(
    () => resolveStudioPresentation(config, presentationMode),
    [config, presentationMode],
  );
  const unfoldPlan =
    presentation.mode === "open-close" || presentation.mode === "progressive-unfold"
      ? presentation.plan
      : null;
  const unfold = useUnfold(unfoldPlan);

  const enabledTools = useMemo(() => {
    const tools: StudioTool[] = [];
    if (embed.features.text) tools.push("Text");
    if (embed.features.uploads) tools.push("Uploads");
    if (embed.features.background) tools.push("Background");
    if (embed.features.adjust) tools.push("Editor");
    return tools;
  }, [embed.features]);

  const [tool, setTool] = useState<StudioTool | null>(enabledTools[0] ?? null);
  useEffect(() => {
    setTool((current) =>
      current && enabledTools.includes(current) ? current : (enabledTools[0] ?? null),
    );
  }, [enabledTools]);

  const surface = c.activeSurface;
  const dieline = useMemo(() => resolveSurfaceDieline(config, surface), [config, surface]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [completed, setCompleted] = useState(false);

  const showPreview = embed.features.preview3d && studioPresentation.previewKind === "3d-product";

  const host = useEmbedHost({
    hostOrigin: embed.hostOrigin,
    clientId: embed.clientId,
    productId: embed.productId,
    rootRef,
  });

  const { notifyCompleted, notifyError, notifyBusy } = host;

  useEffect(() => {
    if (c.projectError) {
      notifyError("SESSION_FAILED", c.projectError);
    }
  }, [c.projectError, notifyError]);

  useEffect(() => {
    notifyBusy(c.saveState === "saving", "Saving design");
  }, [c.saveState, notifyBusy]);

  /**
   * Completion always saves first. A host that stores the returned reference
   * against a quote must be able to load exactly what the customer saw, so
   * emitting before the revision is durable would hand them a dangling id.
   */
  const complete = useCallback(async () => {
    try {
      notifyBusy(true, "Saving design");
      const saved = await c.saveNow();
      const projectId = c.projectId;
      const revision = c.project?.revision;
      if (!saved || !projectId || typeof revision !== "number") {
        notifyError("SAVE_FAILED", "The design could not be saved. Nothing was submitted.");
        return;
      }
      notifyCompleted({
        mode: embed.completion.mode,
        projectId,
        revision,
        productId: embed.productId,
        configurationId: config.configurationId ?? null,
      });
      setCompleted(true);
    } catch (error) {
      notifyError(
        "SAVE_FAILED",
        error instanceof Error ? error.message : "The design could not be submitted.",
      );
    } finally {
      notifyBusy(false, "");
    }
  }, [c, config.configurationId, embed, notifyBusy, notifyCompleted, notifyError]);

  useEffect(() => {
    host.onHostComplete(() => {
      void complete();
    });
  }, [complete, host]);

  const busy = c.saveState === "loading";

  return (
    <div
      ref={rootRef}
      className="flex min-h-[520px] w-full flex-col bg-[var(--st-bg)] text-[var(--st-text)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--st-line)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight">{config.name}</p>
          <p className="text-[12px] text-[var(--st-dim)]">
            {busy ? "Opening your design…" : "Your design is saved as you work."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void complete()}
          disabled={busy}
          className="rounded-[var(--vx-radius)] bg-[var(--st-accent)] px-4 py-2.5 text-[13px] font-semibold text-[var(--st-accent-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {embed.completion.ctaLabel}
        </button>
      </header>

      {completed && (
        <p
          role="status"
          className="border-b border-[var(--st-line)] bg-[var(--st-raised)] px-4 py-2.5 text-[13px]"
        >
          {embed.completion.confirmationText}
        </p>
      )}

      {c.projectError && (
        <p
          role="alert"
          className="border-b border-[var(--st-line)] bg-red-50 px-4 py-2.5 text-[13px] text-red-800"
        >
          {c.projectError}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {tool && (
          <>
            <EmbedToolRail tools={enabledTools} active={tool} onSelect={setTool} />
            <aside className="w-full shrink-0 border-b border-[var(--st-line)] bg-[var(--st-surface)] lg:w-[300px] lg:border-b-0 lg:border-r">
              <StudioPanel tool={tool} customizer={c} />
            </aside>
          </>
        )}

        <section aria-label="Design" className="flex min-w-0 flex-1 flex-col p-4">
          {studioPresentation.targets.length > 1 && (
            <SurfaceSelector
              surfaces={studioPresentation.targets.map((target) =>
                config.editableSurfaces.find((entry) => entry.id === target.surfaceId)!,
              )}
              activeId={c.activeSurfaceId}
              onSelect={c.selectSurface}
            />
          )}
          <div className="mt-3 flex min-h-0 flex-1 items-start justify-center overflow-auto">
            <DesignEditor
              surface={surface}
              design={c.design.surfaces[surface.id]}
              images={c.images}
              embroidery={c.embroidery.results}
              selectedId={c.selectedId}
              showGuides={c.showGuides}
              onSelect={c.setSelectedId}
              onChange={c.applyChange}
              onCommit={c.commitHistory}
              onCanvasReady={c.registerCanvas}
              onDirty={c.markDirty}
              selectedSectionId={c.activeSectionId}
              hoveredMeshName={c.hoveredMeshName}
              onSectionSelect={c.selectSection}
              onSectionHover={c.setHoveredMeshName}
              showProductionChrome={false}
              dieline={dieline}
              onDeleteSelected={c.deleteSelected}
              onDuplicateSelected={c.duplicateSelected}
              onToggleSelectedLock={c.toggleSelectedLock}
              cropMode={c.cropMode}
            />
          </div>
        </section>

        {showPreview && (
          <section
            aria-label="3D preview"
            className="relative flex min-h-[320px] min-w-0 flex-1 flex-col border-t border-[var(--st-line)] lg:min-h-0 lg:w-[38%] lg:max-w-[560px] lg:flex-none lg:border-l lg:border-t-0"
          >
            {embed.features.unfold && (
              <div className="flex items-center justify-end border-b border-[var(--st-line)] px-4 py-2">
                <UnfoldControl
                  presentation={presentation}
                  status={unfold.status}
                  onNext={unfold.next}
                  onPrevious={unfold.previous}
                  onReset={unfold.reset}
                />
              </div>
            )}
            <div className="min-h-0 flex-1 p-3">
              <div className="h-full overflow-hidden rounded-[var(--vx-radius)] ring-1 ring-[var(--st-line)]">
                <Product3DViewer
                  config={config}
                  textures={c.textures}
                  materialTextures={c.materialTextures}
                  consumeDirty={c.consumeDirty}
                  pendingPreset={null}
                  onPresetApplied={() => {}}
                  onValidated={c.handleValidated}
                  onSurfaceClick={c.selectSurface}
                  highlightedMeshName={c.hoveredMeshName}
                  onMeshHover={c.setHoveredMeshName}
                  onMeshClick={c.selectMesh}
                  hoverParallax={false}
                  hingeAngles={unfold.angles}
                  dielineView={Boolean(unfold.status?.isFlat)}
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
