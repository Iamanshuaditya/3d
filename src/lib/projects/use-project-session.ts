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
const pendingCreationKeys = new Map<string, string>();
const pendingProjectCreations = new Map<
  string,
  { key: string; promise: Promise<DesignProjectDto> }
>();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEW_ONLY_PROJECT_ID = "preview-only";

/** Reads an image's intrinsic pixel size without a round trip to the server. */
async function decodeImageSize(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("That image could not be decoded."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

type PendingSave = {
  sequence: number;
  design: DesignDocument;
};

function pendingCreationIdentity(config: ProductConfig) {
  return `${config.id}:${config.productVersionId ?? "current"}:${config.configurationId ?? "default"}`;
}

function pendingCreationKey(identity: string) {
  const inMemory = pendingCreationKeys.get(identity);
  if (inMemory) return inMemory;
  const storageKey = `vortex:pending-project:${identity}`;
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored && UUID_PATTERN.test(stored)) {
      pendingCreationKeys.set(identity, stored);
      return stored;
    }
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, created);
    pendingCreationKeys.set(identity, created);
    return created;
  } catch {
    const created = crypto.randomUUID();
    pendingCreationKeys.set(identity, created);
    return created;
  }
}

function clearPendingCreationKey(identity: string, value: string) {
  if (pendingCreationKeys.get(identity) === value) pendingCreationKeys.delete(identity);
  try {
    const storageKey = `vortex:pending-project:${identity}`;
    if (window.sessionStorage.getItem(storageKey) === value) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Storage can be unavailable in hardened browser contexts; the module map
    // still protects normal Strict Mode remounts in that case.
  }
}

function createPendingProject(
  identity: string,
  productId: string,
  optionSelection: ProductConfig["optionSelection"],
) {
  const existing = pendingProjectCreations.get(identity);
  if (existing) return existing;
  const key = pendingCreationKey(identity);
  const entry = {
    key,
    promise: createProject(productId, key, optionSelection ?? {}).catch((error) => {
      if (pendingProjectCreations.get(identity)?.key === key) {
        pendingProjectCreations.delete(identity);
      }
      throw error;
    }),
  };
  pendingProjectCreations.set(identity, entry);
  return entry;
}

function clearPendingProjectCreation(identity: string, key: string) {
  if (pendingProjectCreations.get(identity)?.key === key) {
    pendingProjectCreations.delete(identity);
  }
  clearPendingCreationKey(identity, key);
}

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
  const previewOnly = config.previewOnly === true;
  const creationIdentity = pendingCreationIdentity(config);
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
  const previewAssetUrls = useRef<string[]>([]);

  loadedCallbackRef.current = onDocumentLoaded;

  // Preview-only artwork lives in this tab only, so its object URLs must be
  // released when the Studio unmounts rather than leaking for the session.
  useEffect(() => {
    const urls = previewAssetUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
    };
  }, []);

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

    // A preview-only product has no catalogue row to own a project, so opening
    // one would fail with "product is not published" and leave the editor
    // permanently blocked. Report the session as settled instead.
    if (previewOnly) {
      setSaveState("saved");
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        // `history.replaceState` adds the project id after a blank Studio
        // creates it. Read that URL as a recovery source so Fast Refresh does
        // not create another project from stale server props.
        const locationProjectId = requestedProjectId
          ?? new URL(window.location.href).searchParams.get("project");
        const pendingCreation = locationProjectId
          ? null
          : createPendingProject(
              creationIdentity,
              config.id,
              config.optionSelection,
            );
        const creationKey = pendingCreation?.key ?? null;
        let loaded = locationProjectId
          ? await getProject(locationProjectId)
          : await pendingCreation!.promise;
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
        if (!locationProjectId) {
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
        if (creationKey) clearPendingProjectCreation(creationIdentity, creationKey);
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
    creationIdentity,
    previewOnly,
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
    if (previewOnly) {
      // The server normally decodes the artwork to record its pixel size. With
      // no project to upload to, decode it here instead — the editor refuses an
      // image whose dimensions it does not know.
      const { width, height } = await decodeImageSize(file);
      const readUrl = URL.createObjectURL(file);
      previewAssetUrls.current.push(readUrl);
      const asset: ProjectAssetDto = {
        id: `preview-${crypto.randomUUID()}`,
        projectId: PREVIEW_ONLY_PROJECT_ID,
        kind: "artwork",
        filename: file.name,
        mimeType: file.type as ProjectAssetDto["mimeType"],
        byteSize: file.size,
        width,
        height,
        sha256: "",
        createdAt: new Date().toISOString(),
        readUrl,
      };
      return asset;
    }
    const current = projectRef.current;
    if (!current) throw new Error("Wait for the project to finish opening before uploading.");
    const asset = await uploadProjectAsset(current.id, file);
    const next = { ...current, assets: [...current.assets, asset] };
    projectRef.current = next;
    setProject(next);
    return asset;
  }, [previewOnly]);

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
