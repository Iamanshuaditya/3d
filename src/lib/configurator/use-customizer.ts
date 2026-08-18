"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import * as THREE from "three";
import type {
  DesignDocument,
  DesignElement,
  ProductConfig,
  ValidationResult,
} from "@/types/configurator";
import type { SceneDebugInfo } from "@/lib/configurator/model-validator";
import { configureDesignTexture } from "@/lib/configurator/texture-manager";
import {
  commit,
  centeredOrigin,
  createEmptyDocument,
  createHistory,
  deserializeDesign,
  fitElement,
  fitElementToSection,
  nextId,
  redo,
  reduceHistory,
  serializeDesign,
  sectionBox,
  undo,
  type DesignAction,
  type History,
} from "@/lib/configurator/design-state";

const STORAGE_KEY = "configurator:design";

type HistoryAction =
  | { kind: "apply"; action: DesignAction; transient?: boolean }
  | { kind: "commit" }
  | { kind: "undo" }
  | { kind: "redo" };

function historyReducer(
  state: History<DesignDocument>,
  action: HistoryAction,
): History<DesignDocument> {
  switch (action.kind) {
    case "apply":
      return reduceHistory(state, action.action, { transient: action.transient });
    case "commit":
      return commit(state);
    case "undo":
      return undo(state);
    case "redo":
      return redo(state);
  }
}

/**
 * All customizer state and behaviour, independent of layout.
 *
 * Shared by the standalone /configurator page and the Studio shell so both
 * drive exactly the same engine — the 2D design remains the source of truth
 * and the 3D view is a live CanvasTexture preview.
 */
export function useCustomizer(config: ProductConfig) {
  const [history, dispatch] = useReducer(historyReducer, config, (c) =>
    createHistory(createEmptyDocument(c)),
  );
  const design = history.present;

  const [activeSurfaceId, setActiveSurfaceId] = useState(config.editableSurfaces[0].id);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    config.editableSurfaces[0].sections?.[0]?.id ?? null,
  );
  const [hoveredMeshName, setHoveredMeshName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [canvases, setCanvases] = useState<Record<string, HTMLCanvasElement | null>>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [debugInfo, setDebugInfo] = useState<SceneDebugInfo[]>([]);

  const dirtyRef = useRef<Record<string, boolean>>({});
  const objectUrlsRef = useRef<Set<string>>(new Set());

  // A held surface id can outlive the config it came from (switching products
  // keeps this hook mounted), so fall back to the first surface rather than
  // dereferencing undefined.
  const activeSurface = useMemo(
    () =>
      config.editableSurfaces.find((s) => s.id === activeSurfaceId) ??
      config.editableSurfaces[0],
    [config, activeSurfaceId],
  );
  const activeDesign = design.surfaces[activeSurfaceId];
  const activeSection = useMemo(
    () => activeSurface.sections?.find((section) => section.id === activeSectionId) ?? null,
    [activeSectionId, activeSurface.sections],
  );
  const activeSectionBox = useMemo(
    () => (activeSection ? sectionBox(activeSurface, activeSection) : null),
    [activeSection, activeSurface],
  );
  const selectedElement = activeDesign?.elements.find((el) => el.id === selectedId) ?? null;

  // ---- Textures: one per canvas, updated in place (§15/§38) -----------------
  const textures = useMemo(() => {
    const next: Record<string, THREE.CanvasTexture | null> = {};
    for (const surface of config.editableSurfaces) {
      const canvas = canvases[surface.id];
      if (!canvas) {
        next[surface.id] = null;
        continue;
      }
      const texture = new THREE.CanvasTexture(canvas);
      configureDesignTexture(texture);
      next[surface.id] = texture;
    }
    return next;
  }, [canvases, config]);

  useEffect(() => {
    for (const key of Object.keys(textures)) dirtyRef.current[key] = true;
    return () => {
      Object.values(textures).forEach((t) => t?.dispose());
    };
  }, [textures]);

  const markDirty = useCallback((surfaceId: string) => {
    dirtyRef.current[surfaceId] = true;
  }, []);

  const consumeDirty = useCallback((surfaceId: string) => {
    if (!dirtyRef.current[surfaceId]) return false;
    dirtyRef.current[surfaceId] = false;
    return true;
  }, []);

  const scheduleDirty = useCallback(
    (surfaceId: string) => {
      requestAnimationFrame(() => markDirty(surfaceId));
    },
    [markDirty],
  );

  const registerCanvas = useCallback(
    (surfaceId: string, canvas: HTMLCanvasElement | null) => {
      setCanvases((prev) =>
        prev[surfaceId] === canvas ? prev : { ...prev, [surfaceId]: canvas },
      );
    },
    [],
  );

  // ---- Mutations ------------------------------------------------------------
  const applyChange = useCallback(
    (id: string, patch: Partial<DesignElement>, transient: boolean) => {
      dispatch({
        kind: "apply",
        action: { type: "update", surfaceId: activeSurfaceId, id, patch: patch as never },
        transient,
      });
    },
    [activeSurfaceId],
  );

  const commitHistory = useCallback(() => dispatch({ kind: "commit" }), []);

  /** Normalizes EXIF-rotated photos, passing ordinary files through untouched. */
  const loadImageSource = useCallback(async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(objectUrl);

    const raw = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = objectUrl;
    });
    if (!raw) throw new Error("unreadable");

    if (typeof createImageBitmap !== "function") {
      return { src: objectUrl, width: raw.naturalWidth, height: raw.naturalHeight };
    }

    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const rotated = bitmap.width !== raw.naturalWidth || bitmap.height !== raw.naturalHeight;
      if (!rotated) {
        bitmap.close();
        return { src: objectUrl, width: raw.naturalWidth, height: raw.naturalHeight };
      }
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      bitmap.close();
      URL.revokeObjectURL(objectUrl);
      objectUrlsRef.current.delete(objectUrl);
      return { src: dataUrl, width: canvas.width, height: canvas.height };
    } catch {
      return { src: objectUrl, width: raw.naturalWidth, height: raw.naturalHeight };
    }
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        try {
          const { src, width, height } = await loadImageSource(file);
          const placement = activeSection && activeSectionBox
            ? fitElementToSection(
                width,
                height,
                activeSectionBox,
                activeSection.contentRotation,
              )
            : {
                ...fitElement(
                  width,
                  height,
                  activeSurface.editorWidth,
                  activeSurface.editorHeight,
                ),
                rotation: 0,
              };
          const element: DesignElement = {
            id: nextId("img"),
            type: "image",
            src,
            ...placement,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
          };
          dispatch({
            kind: "apply",
            action: { type: "add", surfaceId: activeSurfaceId, element },
          });
          setSelectedId(element.id);
          scheduleDirty(activeSurfaceId);
        } catch {
          window.alert(`Could not read "${file.name}". Please use a PNG, JPG or WebP.`);
        }
      }
    },
    [
      activeSection,
      activeSectionBox,
      activeSurface,
      activeSurfaceId,
      loadImageSource,
      scheduleDirty,
    ],
  );

  const addText = useCallback(() => {
    const text = activeSection ? "Type text here" : "Your text";
    const fontSize = 84;
    const rotation = activeSection?.contentRotation ?? 0;
    const target = activeSectionBox ?? {
      x: 0,
      y: 0,
      width: activeSurface.editorWidth,
      height: activeSurface.editorHeight,
    };
    const element: DesignElement = {
      id: nextId("txt"),
      type: "text",
      text,
      ...centeredOrigin(target, text.length * fontSize * 0.54, fontSize, rotation),
      fontFamily: "Graphik, sans-serif",
      fontSize,
      fill: "#111111",
      rotation,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    };
    dispatch({ kind: "apply", action: { type: "add", surfaceId: activeSurfaceId, element } });
    setSelectedId(element.id);
    scheduleDirty(activeSurfaceId);
  }, [activeSection, activeSectionBox, activeSurface, activeSurfaceId, scheduleDirty]);

  const removeElement = useCallback(
    (id: string) => {
      dispatch({ kind: "apply", action: { type: "remove", surfaceId: activeSurfaceId, id } });
      setSelectedId((cur) => (cur === id ? null : cur));
      scheduleDirty(activeSurfaceId);
    },
    [activeSurfaceId, scheduleDirty],
  );

  const deleteSelected = useCallback(() => {
    if (selectedId) removeElement(selectedId);
  }, [selectedId, removeElement]);

  const reorderElement = useCallback(
    (id: string, direction: "up" | "down") => {
      dispatch({
        kind: "apply",
        action: { type: "reorder", surfaceId: activeSurfaceId, id, direction },
      });
      scheduleDirty(activeSurfaceId);
    },
    [activeSurfaceId, scheduleDirty],
  );

  const setBackground = useCallback(
    (color: string | null) => {
      dispatch({ kind: "apply", action: { type: "background", surfaceId: activeSurfaceId, color } });
      scheduleDirty(activeSurfaceId);
    },
    [activeSurfaceId, scheduleDirty],
  );

  const centerSelected = useCallback(() => {
    if (!selectedElement) return;
    const w =
      selectedElement.type === "image"
        ? selectedElement.width * selectedElement.scaleX
        : selectedElement.fontSize * 6;
    const h =
      selectedElement.type === "image"
        ? selectedElement.height * selectedElement.scaleY
        : selectedElement.fontSize;
    const target = activeSectionBox ?? {
      x: 0,
      y: 0,
      width: activeSurface.editorWidth,
      height: activeSurface.editorHeight,
    };
    applyChange(
      selectedElement.id,
      centeredOrigin(target, w, h, selectedElement.rotation),
      false,
    );
    scheduleDirty(activeSurfaceId);
  }, [selectedElement, activeSectionBox, activeSurface, applyChange, activeSurfaceId, scheduleDirty]);

  const fitSelected = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "image") return;
    const placement = activeSection && activeSectionBox
      ? fitElementToSection(
          selectedElement.width,
          selectedElement.height,
          activeSectionBox,
          activeSection.contentRotation,
          0.8,
        )
      : {
          ...fitElement(
            selectedElement.width,
            selectedElement.height,
            activeSurface.editorWidth,
            activeSurface.editorHeight,
            0.8,
          ),
          rotation: 0,
        };
    applyChange(
      selectedElement.id,
      { ...placement, scaleX: 1, scaleY: 1 },
      false,
    );
    scheduleDirty(activeSurfaceId);
  }, [
    selectedElement,
    activeSection,
    activeSectionBox,
    activeSurface,
    applyChange,
    activeSurfaceId,
    scheduleDirty,
  ]);

  /**
   * Stretch the selection to the full print area. Packaging artwork is almost
   * always supplied full-bleed, so "fit inside" is the wrong default here.
   */
  const fillSelected = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "image") return;
    if (activeSection && activeSectionBox) {
      const quarterTurn = Math.abs(activeSection.contentRotation % 180) === 90;
      const width = quarterTurn ? activeSectionBox.height : activeSectionBox.width;
      const height = quarterTurn ? activeSectionBox.width : activeSectionBox.height;
      applyChange(
        selectedElement.id,
        {
          ...centeredOrigin(
            activeSectionBox,
            width,
            height,
            activeSection.contentRotation,
          ),
          width,
          height,
          scaleX: 1,
          scaleY: 1,
          rotation: activeSection.contentRotation,
        },
        false,
      );
      scheduleDirty(activeSurfaceId);
      return;
    }
    applyChange(
      selectedElement.id,
      {
        x: 0,
        y: 0,
        width: activeSurface.editorWidth,
        height: activeSurface.editorHeight,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
      false,
    );
    scheduleDirty(activeSurfaceId);
  }, [
    selectedElement,
    activeSection,
    activeSectionBox,
    activeSurface,
    applyChange,
    activeSurfaceId,
    scheduleDirty,
  ]);

  const resetSurface = useCallback(() => {
    dispatch({ kind: "apply", action: { type: "resetSurface", surfaceId: activeSurfaceId } });
    setSelectedId(null);
    scheduleDirty(activeSurfaceId);
  }, [activeSurfaceId, scheduleDirty]);

  const selectSurface = useCallback(
    (surfaceId: string) => {
      const surface = config.editableSurfaces.find((candidate) => candidate.id === surfaceId);
      setActiveSurfaceId(surfaceId);
      setActiveSectionId(surface?.sections?.[0]?.id ?? null);
      setSelectedId(null);
    },
    [config.editableSurfaces],
  );

  const selectSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    setSelectedId(null);
  }, []);

  const selectMesh = useCallback(
    (meshName: string) => {
      for (const surface of config.editableSurfaces) {
        const section = surface.sections?.find((candidate) => candidate.meshName === meshName);
        if (!section) continue;
        setActiveSurfaceId(surface.id);
        setActiveSectionId(section.id);
        setSelectedId(null);
        return;
      }
    },
    [config.editableSurfaces],
  );

  const doUndo = useCallback(() => dispatch({ kind: "undo" }), []);
  const doRedo = useCallback(() => dispatch({ kind: "redo" }), []);

  // ---- Keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ kind: e.shiftKey ? "redo" : "undo" });
        scheduleDirty(activeSurfaceId);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeElement(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, removeElement, activeSurfaceId, scheduleDirty]);

  useEffect(() => {
    scheduleDirty(activeSurfaceId);
  }, [history.present, activeSurfaceId, scheduleDirty]);

  // ---- Persistence ----------------------------------------------------------
  useEffect(() => {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${config.id}`);
    if (!raw) return;
    const parsed = deserializeDesign(raw);
    const matchesCurrentSurfaces = config.editableSurfaces.every(
      (surface) => parsed?.surfaces?.[surface.id],
    );
    if (parsed && parsed.productId === config.id && matchesCurrentSurfaces) {
      const migrated = config.materialProfile === "clear-barrier-gloss"
        ? {
            ...parsed,
            surfaces: Object.fromEntries(
              Object.entries(parsed.surfaces).map(([id, surface]) => [
                id,
                {
                  ...surface,
                  background: surface.background === "#f5f5f3" ? null : surface.background,
                },
              ]),
            ),
          }
        : parsed;
      dispatch({ kind: "apply", action: { type: "replace", document: migrated } });
    }
  }, [config.id, config.materialProfile]);

  useEffect(() => {
    // Nothing has been applied yet — neither an edit nor the restore above —
    // so the in-memory document is still the empty default. Writing it here
    // would erase the stored design before the restore effect can read it.
    if (!history.past.length) return;

    // Object URLs don't survive a reload, so only text persists.
    const persistable: DesignDocument = {
      ...design,
      surfaces: Object.fromEntries(
        Object.entries(design.surfaces).map(([id, surface]) => [
          id,
          { ...surface, elements: surface.elements.filter((el) => el.type === "text") },
        ]),
      ),
    };
    window.localStorage.setItem(`${STORAGE_KEY}:${config.id}`, serializeDesign(persistable));
  }, [design, config.id, history.past.length]);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const handleValidated = useCallback((result: ValidationResult, debug: SceneDebugInfo[]) => {
    setValidation(result);
    setDebugInfo(debug);
  }, []);

  return {
    design,
    activeSurface,
    activeSurfaceId,
    activeDesign,
    activeSection,
    activeSectionId,
    selectSurface,
    selectSection,
    selectMesh,
    hoveredMeshName,
    setHoveredMeshName,
    setActiveSurfaceId,
    selectedId,
    setSelectedId,
    selectedElement,
    showGuides,
    setShowGuides,
    textures,
    registerCanvas,
    markDirty,
    consumeDirty,
    scheduleDirty,
    applyChange,
    commitHistory,
    uploadFiles,
    addText,
    removeElement,
    deleteSelected,
    reorderElement,
    setBackground,
    centerSelected,
    fitSelected,
    fillSelected,
    resetSurface,
    undo: doUndo,
    redo: doRedo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    validation,
    debugInfo,
    handleValidated,
  };
}
