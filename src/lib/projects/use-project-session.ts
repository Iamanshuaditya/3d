"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignDocument, ProductConfig } from "@/types/configurator";
import type {
  DesignProjectDto,
  ProjectAssetDto,
  ProjectSaveState,
} from "@/platform/projects/types";
import { deserializeDesign } from "@/lib/configurator/design-state";
import {
  createProject,
  generateProjectPreview,
  getProject,
  ProjectApiError,
  updateProject,
  uploadProjectAsset,
} from "./client";
import { applyProjectLocation } from "./location";

const AUTOSAVE_DELAY_MS = 700;
const PREVIEW_DELAY_MS = 1_500;
const LEGACY_STORAGE_KEY = "configurator:design";

type PendingSave = {
  sequence: number;
  design: DesignDocument;
};

export type ProjectSession = {
  project: DesignProjectDto | null;
  projectId: string | null;
  saveState: ProjectSaveState;
  error: string | null;
  uploadAsset: (file: File) => Promise<ProjectAssetDto>;
  retrySave: () => void;
  saveNow: () => Promise<boolean>;
};

export function useProjectSession(
  config: ProductConfig,
  requestedProjectId: string | null,
  design: DesignDocument,
  commitSequence: number,
  onDocumentLoaded: (document: DesignDocument) => void,
): ProjectSession {
  const [project, setProject] = useState<DesignProjectDto | null>(null);
  const [saveState, setSaveState] = useState<ProjectSaveState>("loading");
  const [error, setError] = useState<string | null>(null);
  const projectRef = useRef<DesignProjectDto | null>(null);
  const revisionRef = useRef(0);
  const pendingRef = useRef<PendingSave | null>(null);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedCallbackRef = useRef(onDocumentLoaded);
  const lastQueuedSequenceRef = useRef(0);
  const flushRef = useRef<() => void>(() => {});
  const creationKeyRef = useRef(crypto.randomUUID());

  loadedCallbackRef.current = onDocumentLoaded;

  const schedulePreview = useCallback((projectId: string) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      void generateProjectPreview(projectId).catch(() => {
        // Preview failure must never turn a successfully saved design into a
        // failed save. The library can retry preview generation later.
      });
    }, PREVIEW_DELAY_MS);
  }, []);

  const flush = useCallback(async () => {
    if (savingRef.current) return;
    const currentProject = projectRef.current;
    const pending = pendingRef.current;
    if (!currentProject || !pending) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSaveState("offline");
      return;
    }

    pendingRef.current = null;
    savingRef.current = true;
    setSaveState("saving");
    setError(null);
    try {
      const saved = await updateProject(currentProject.id, {
        expectedRevision: revisionRef.current,
        design: pending.design,
      });
      revisionRef.current = saved.revision;
      projectRef.current = saved;
      setProject(saved);
      // Another render may queue a commit while updateProject awaits the
      // server. TypeScript cannot observe that cross-render ref mutation.
      const queuedAfterSave = pendingRef.current as PendingSave | null;
      if (queuedAfterSave && queuedAfterSave.sequence > pending.sequence) {
        setSaveState("unsaved");
        queueMicrotask(() => flushRef.current());
      } else {
        setSaveState("saved");
        schedulePreview(saved.id);
      }
    } catch (cause) {
      const queuedAfterFailure = pendingRef.current as PendingSave | null;
      pendingRef.current = queuedAfterFailure && queuedAfterFailure.sequence > pending.sequence
        ? queuedAfterFailure
        : pending;
      setSaveState(
        typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "failed",
      );
      setError(
        cause instanceof ProjectApiError
          ? cause.message
          : "Project save failed. Your edits remain open in this tab.",
      );
    } finally {
      savingRef.current = false;
    }
  }, [schedulePreview]);
  flushRef.current = () => void flush();

  useEffect(() => {
    let cancelled = false;
    setSaveState("loading");
    setError(null);
    setProject(null);
    projectRef.current = null;
    pendingRef.current = null;
    revisionRef.current = 0;
    lastQueuedSequenceRef.current = 0;

    void (async () => {
      try {
        let loaded = requestedProjectId
          ? await getProject(requestedProjectId)
          : await createProject(
              config.id,
              creationKeyRef.current,
              config.optionSelection ?? {},
            );
        if (cancelled) return;
        if (loaded.productId !== config.id) {
          throw new Error(
            `This project belongs to ${loaded.productId}, not the selected ${config.id} product.`,
          );
        }
        if (
          (config.productVersionId && loaded.productVersionId !== config.productVersionId) ||
          (config.configurationId && loaded.configurationId !== config.configurationId)
        ) {
          const url = new URL(window.location.href);
          applyProjectLocation(url, loaded);
          window.location.replace(url);
          return;
        }

        // One-time migration for the old text-only local save. Uploaded images
        // were never present in that value, so no false promise is made.
        if (!requestedProjectId) {
          const key = `${LEGACY_STORAGE_KEY}:${config.id}`;
          const legacy = deserializeDesign(window.localStorage.getItem(key) ?? "");
          if (legacy && legacy.productId === config.id) {
            try {
              loaded = await updateProject(loaded.id, {
                expectedRevision: loaded.revision,
                design: legacy,
              });
              window.localStorage.removeItem(key);
            } catch {
              // Keep the legacy value if migration fails so it is still
              // recoverable on the next attempt.
            }
          }
        }

        if (cancelled) return;
        projectRef.current = loaded;
        revisionRef.current = loaded.revision;
        setProject(loaded);
        loadedCallbackRef.current(loaded.design);
        setSaveState("saved");

        const url = new URL(window.location.href);
        applyProjectLocation(url, loaded);
        window.history.replaceState(window.history.state, "", url);
      } catch (cause) {
        if (cancelled) return;
        setSaveState("failed");
        setError(cause instanceof Error ? cause.message : "Project could not be opened.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    config.configurationId,
    config.id,
    config.optionSelection,
    config.productVersionId,
    requestedProjectId,
  ]);

  useEffect(() => {
    if (!projectRef.current || commitSequence <= lastQueuedSequenceRef.current) return;
    lastQueuedSequenceRef.current = commitSequence;
    pendingRef.current = { sequence: commitSequence, design };
    setSaveState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "unsaved");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [commitSequence, design]);

  useEffect(() => {
    const onOnline = () => {
      if (pendingRef.current) {
        setSaveState("unsaved");
        flushRef.current();
      }
    };
    const onOffline = () => {
      if (pendingRef.current || savingRef.current) setSaveState("offline");
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!pendingRef.current && !savingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeunload", beforeUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  const uploadAsset = useCallback(async (file: File) => {
    const current = projectRef.current;
    if (!current) throw new Error("Wait for the project to finish opening before uploading.");
    const asset = await uploadProjectAsset(current.id, file);
    const next = { ...current, assets: [...current.assets, asset] };
    projectRef.current = next;
    setProject(next);
    return asset;
  }, []);

  const retrySave = useCallback(() => {
    if (pendingRef.current) flushRef.current();
  }, []);

  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const deadline = Date.now() + 10_000;
    while (savingRef.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    while (pendingRef.current && Date.now() < deadline) {
      const sequence = pendingRef.current.sequence;
      await flush();
      while (savingRef.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      // A failed save puts the same commit back. Stop instead of retrying in a
      // tight loop; navigation remains blocked and the customer's tab is kept.
      if (pendingRef.current?.sequence === sequence) return false;
    }
    return !pendingRef.current && !savingRef.current;
  }, [flush]);

  return {
    project,
    projectId: project?.id ?? null,
    saveState,
    error,
    uploadAsset,
    retrySave,
    saveNow,
  };
}
