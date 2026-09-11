"use client";

import { useCallback, useRef, useState } from "react";
import type { useCustomizer } from "@/lib/configurator/use-customizer";
import type { EditorSessionMode, EditorSessionResult } from "@/lib/embed/editor-session-types";
import { embedRequestHeaders } from "@/lib/embed/embed-request-context";
import type { ResolvedEmbedConfig } from "@/platform/embed/types";
import type { useEmbedHost } from "./use-embed-host";

export type BrowserEditorSession = { id: string; mode: EditorSessionMode };

export function useEditorCompletion(
  customizer: ReturnType<typeof useCustomizer>,
  embed: ResolvedEmbedConfig,
  session: BrowserEditorSession | null,
  host: ReturnType<typeof useEmbedHost>,
  configurationId: string | null,
) {
  const [finishing, setFinishing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [result, setResult] = useState<EditorSessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const { saveSnapshot } = customizer;
  const { notifyBusy, notifyCompleted, notifyError } = host;

  const complete = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setFinishing(true);
    setError(null);
    setCompleted(false);
    try {
      notifyBusy(true, "Saving design");
      const saved = await saveSnapshot();
      if (!saved) throw new Error("The design could not be saved. Please try again.");
      let next: EditorSessionResult | null = null;
      if (session) {
        notifyBusy(true, session.mode === "pdf" ? "Preparing your PDF" : "Finishing your design");
        const response = await fetch(`/api/v1/editor-sessions/${session.id}/complete`, {
          method: "POST", headers: { "Content-Type": "application/json", ...embedRequestHeaders() },
          body: JSON.stringify({ revision: saved.revision }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? "Your PDF could not be prepared. Please try again.");
        next = data as EditorSessionResult;
      }
      setResult(next);
      setCompleted(true);
      notifyCompleted({ mode: embed.completion.mode, projectId: saved.id, revision: saved.revision,
        productId: embed.productId, configurationId,
        ...(session ? { sessionId: session.id } : {}), ...(next ? { result: next } : {}) });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "The design could not be finished. Please try again.";
      setError(message);
      notifyError(session?.mode === "pdf" ? "EXPORT_FAILED" : "SAVE_FAILED", message);
    } finally {
      active.current = false;
      setFinishing(false);
      notifyBusy(false, "");
    }
  }, [saveSnapshot, session, embed, configurationId, notifyBusy, notifyCompleted, notifyError]);

  const download = useCallback(async () => {
    if (!result?.artifact) return;
    try {
      const response = await fetch(`/api/v1/production-artifacts/${result.artifact.id}/content`, {
        headers: embedRequestHeaders(), cache: "no-store",
      });
      if (!response.ok) throw new Error("The PDF could not be downloaded. Reopen the editor and try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = result.artifact.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Download failed. Please try again.");
    }
  }, [result]);

  return { complete, finishing, completed, result, error, download };
}
